import { db, fbAdmin } from '../config/adminConfig.js';
/**
 * ChatService - Handles chat message persistence using Firebase Admin SDK
 *
 * This service manages chat messages independently from task data to:
 * - Prevent document size limits on main task documents
 * - Enable better performance for chat operations
 * - Allow unlimited message history per step
 *
 * Collection Structure:
 * chat_messages/{userId}/step_chats/{taskId}_{subtaskId}_{stepId}
 * ├── messages: Array<ChatMessage>
 * ├── messageCount: number
 * └── lastUpdated: Timestamp
 */
export class ChatService {
    /**
     * Creates a document ID for chat messages
     * Format: {taskId}_{subtaskId}_{stepId}
     */
    createChatDocumentId(taskId, subtaskId, stepId) {
        return `${taskId}_${subtaskId}_${stepId}`;
    }
    /**
     * Creates a Firestore document reference for chat messages
     */
    getChatDocumentRef(userId, taskId, subtaskId, stepId) {
        const chatDocId = this.createChatDocumentId(taskId, subtaskId, stepId);
        console.log('🔗 Creating document reference:', {
            userId,
            taskId,
            subtaskId,
            stepId,
            chatDocId,
            fullPath: `chat_messages/${userId}/step_chats/${chatDocId}`
        });
        return db.collection('chat_messages').doc(userId).collection('step_chats').doc(chatDocId);
    }
    /**
     * Retrieves all chat messages for a specific step
     */
    async getChatMessages(userId, taskId, subtaskId, stepId) {
        try {
            console.log('💬 ChatService: Loading messages for', { userId, taskId, subtaskId, stepId });
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                console.log('📭 ChatService: No chat document found, returning empty array');
                return [];
            }
            const chatData = chatDoc.data();
            const messages = chatData.messages || [];
            // Convert Firestore timestamps to Date objects for UI
            const uiMessages = messages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp instanceof Date ? msg.timestamp : msg.timestamp.toDate(),
                agentRole: msg.agentRole
            }));
            console.log(`✅ ChatService: Loaded ${uiMessages.length} messages`);
            return uiMessages;
        }
        catch (error) {
            console.error('❌ ChatService: Failed to load messages:', error);
            throw new Error(`Failed to load chat messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Adds a new chat message to the step's chat collection
     */
    async addChatMessage(userId, taskId, subtaskId, stepId, message) {
        try {
            console.log('💬 ChatService: Adding message', {
                userId,
                taskId,
                subtaskId,
                stepId,
                messageRole: message.role,
                messageLength: message.content.length
            });
            // Validate required fields
            if (!message.id || !message.role || !message.content) {
                throw new Error('Message missing required fields: id, role, or content');
            }
            // Clean the message object and ensure timestamp
            // Note: Cannot use serverTimestamp() inside arrayUnion, use actual timestamp
            const cleanMessage = {
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp || new Date(),
                ...(message.agentRole && { agentRole: message.agentRole })
            };
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            // Check if document exists
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                // Create new chat document
                const newChatDocument = {
                    messages: [cleanMessage],
                    messageCount: 1,
                    lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp()
                };
                await chatDocRef.set(newChatDocument);
                console.log('✅ ChatService: Created new chat document with first message');
            }
            else {
                // Update existing document
                await chatDocRef.update({
                    messages: fbAdmin.firestore.FieldValue.arrayUnion(cleanMessage),
                    messageCount: fbAdmin.firestore.FieldValue.increment(1),
                    lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp()
                });
                console.log('✅ ChatService: Added message to existing chat document');
            }
        }
        catch (error) {
            console.error('❌ ChatService: Failed to add message:', error);
            throw new Error(`Failed to add chat message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Gets chat summary statistics for a step
     */
    async getChatSummary(userId, taskId, subtaskId, stepId) {
        try {
            console.log('📊 ChatService: Getting chat summary for', { userId, taskId, subtaskId, stepId });
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                console.log('📭 ChatService: No chat document found for summary');
                return null;
            }
            const chatData = chatDoc.data();
            const summary = {
                chatMessageCount: chatData.messageCount || 0,
                lastChatAt: chatData.lastUpdated
            };
            console.log('✅ ChatService: Retrieved chat summary:', summary);
            return summary;
        }
        catch (error) {
            console.error('❌ ChatService: Failed to get chat summary:', error);
            throw new Error(`Failed to get chat summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Creates an initial welcome message for a new step
     */
    async createInitialWelcomeMessage(userId, taskId, subtaskId, stepId, taskName, stepObjective) {
        try {
            console.log('👋 ChatService: Creating initial welcome message');
            const welcomeMessage = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant',
                content: `Welcome to the task "${taskName}". How can I assist you with step "${stepObjective}"?`
            };
            await this.addChatMessage(userId, taskId, subtaskId, stepId, welcomeMessage);
            // Return as UI message
            const uiMessage = {
                ...welcomeMessage,
                timestamp: new Date()
            };
            console.log('✅ ChatService: Created initial welcome message');
            return uiMessage;
        }
        catch (error) {
            console.error('❌ ChatService: Failed to create welcome message:', error);
            throw error;
        }
    }
    /**
     * Deletes all chat messages for a specific step
     */
    async deleteChatHistory(userId, taskId, subtaskId, stepId) {
        try {
            console.log('🗑️ ChatService: Deleting chat history for', { userId, taskId, subtaskId, stepId });
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            // Reset the document instead of deleting to maintain structure
            const emptyChatDocument = {
                messages: [],
                messageCount: 0,
                lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp()
            };
            await chatDocRef.set(emptyChatDocument);
            console.log('✅ ChatService: Chat history deleted');
        }
        catch (error) {
            console.error('❌ ChatService: Failed to delete chat history:', error);
            throw new Error(`Failed to delete chat history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Tests connection to Firestore for chat operations
     */
    async testConnection() {
        try {
            console.log('🔌 ChatService: Testing Firestore connection...');
            // Create a test document reference
            const testDoc = db.collection('chat_messages').doc('test').collection('step_chats').doc('connection_test');
            // Try to write a test document
            await testDoc.set({
                test: true,
                timestamp: fbAdmin.firestore.FieldValue.serverTimestamp(),
                service: 'ChatService'
            });
            console.log('✅ ChatService: Connection test successful');
            return true;
        }
        catch (error) {
            console.error('❌ ChatService: Connection test failed:', error);
            return false;
        }
    }
}
// Export singleton instance
export const chatService = new ChatService();
