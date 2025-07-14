import { db, fbAdmin } from '../config/adminConfig.js';
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import retriever from "../utils/retriever.js";
import { combineDocuments } from "../utils/combineDocuments.js";
import { AgentService } from "./agentService.js";
import dotenv from "dotenv";
dotenv.config();
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
    welcomeModel;
    agentService;
    constructor() {
        // Initialize LLM for welcome message generation
        this.welcomeModel = new ChatGroq({
            model: "gemma2-9b-it",
            temperature: 0.3,
            apiKey: process.env.GROQ_API_KEY,
            streaming: false,
        });
        // Initialize AgentService for accessing team members and context
        this.agentService = new AgentService();
    }
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
            // Log the exact Firestore path being queried
            const chatDocId = this.createChatDocumentId(taskId, subtaskId, stepId);
            const firestorePath = `chat_messages/${userId}/step_chats/${chatDocId}`;
            console.log('🔍 EXACT FIRESTORE PATH:', firestorePath);
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            console.log('🔍 FIRESTORE DOC REF PATH:', chatDocRef.path);
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                console.log('📭 ChatService: No chat document found, returning empty array');
                return [];
            }
            const chatData = chatDoc.data();
            const messages = chatData.messages || [];
            // Log what we actually retrieved
            console.log('🔍 FIRESTORE DATA RETRIEVED:', {
                messageCount: messages.length,
                documentId: chatDoc.id,
                documentPath: chatDoc.ref.path,
                firstMessageSample: messages.length > 0 ? {
                    id: messages[0].id,
                    role: messages[0].role,
                    content: messages[0].content.substring(0, 50) + '...',
                    timestamp: messages[0].timestamp
                } : null
            });
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
    async createInitialWelcomeMessage(userId, taskId, subtaskId, stepId) {
        try {
            console.log('👋 ChatService: Creating initial welcome message');
            // Get user name from Firebase Auth
            const userName = await this.getUserName(userId);
            // Find the step information from task list
            const stepInfo = await this.getStepInformation(taskId, subtaskId, stepId);
            if (!stepInfo) {
                throw new Error(`Step not found: ${stepId} in task ${taskId}, subtask ${subtaskId}`);
            }
            // Generate context-aware welcome message using LLM
            const contextAwareContent = await this.generateContextAwareWelcomeMessage(stepInfo, userName);
            const welcomeMessage = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant',
                content: contextAwareContent
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
     * Gets step information from the task list
     */
    async getStepInformation(taskId, subtaskId, stepId) {
        try {
            await this.agentService.initialize();
            const tasks = this.agentService.getLearningTasksList();
            const task = tasks.find(t => t.id === taskId);
            if (!task)
                return null;
            const subtask = task.subtasks.find(st => st.id === subtaskId);
            if (!subtask)
                return null;
            const step = subtask.steps.find(s => s.id === stepId);
            if (!step)
                return null;
            return {
                task,
                subtask,
                step
            };
        }
        catch (error) {
            console.error('❌ ChatService: Error getting step information:', error);
            return null;
        }
    }
    /**
     * Gets user name from Firebase Auth
     */
    async getUserName(userId) {
        try {
            const userRecord = await fbAdmin.auth().getUser(userId);
            return userRecord.displayName || userRecord.email?.split('@')[0] || 'Student';
        }
        catch (error) {
            console.error('❌ ChatService: Error getting user name:', error);
            return 'Student';
        }
    }
    /**
     * Retrieves project-specific context for the task
     */
    async retrieveProjectContext(taskQuery) {
        try {
            const relevantDocs = await retriever._getRelevantDocuments(taskQuery);
            if (relevantDocs.length === 0) {
                return "No specific project context found.";
            }
            return combineDocuments(relevantDocs);
        }
        catch (error) {
            console.error('❌ ChatService: Error retrieving project context:', error);
            return "No project context available.";
        }
    }
    /**
     * Detects if an agent is involved in the task and gets their details
     */
    getAgentInvolvement(stepInfo) {
        const primaryAgent = stepInfo.step.primaryAgent;
        if (!primaryAgent) {
            return { isAgentInvolved: false, agent: null };
        }
        // Get team members from agent service
        const teamMembers = this.agentService.getTeamMembersList();
        const agent = teamMembers.find(member => member.role === primaryAgent);
        if (!agent) {
            return { isAgentInvolved: false, agent: null };
        }
        // Check if the agent is mentioned in step description or details
        const fullText = `${stepInfo.step.step || ''} ${stepInfo.subtask.description || ''}`.toLowerCase();
        const agentName = agent.name.toLowerCase();
        const agentRole = agent.role.toLowerCase();
        const isAgentInvolved = fullText.includes(agentName) ||
            fullText.includes(agentRole) ||
            fullText.includes('interview') ||
            fullText.includes('talk to') ||
            fullText.includes('speak with');
        return { isAgentInvolved, agent };
    }
    /**
     * Generates a context-aware welcome message using LLM
     */
    async generateContextAwareWelcomeMessage(stepInfo, userName) {
        try {
            // Check if an agent is involved
            const { isAgentInvolved, agent } = this.getAgentInvolvement(stepInfo);
            let systemPrompt = '';
            let humanPrompt = '';
            if (isAgentInvolved && agent) {
                // Agent-perspective welcome message
                systemPrompt = `You are ${agent.name}, a ${agent.role}. You are about to interact with a student in a requirements engineering learning task. 

Your personality: ${agent.personality}
Your communication style: ${agent.communicationStyle}
Your work approach: ${agent.workApproach}

DETAILED PERSONA:
${agent.detailedPersona}

Write a warm welcome message from your perspective that:
1. Introduces yourself personally to the student by name
2. EXPLICITLY explains what the student will be doing in this specific step
3. Explains your role and involvement in what they'll be doing
4. Sets clear expectations for the activity/exercise they're about to complete
5. Maintains your authentic personality and communication style
6. Makes the student feel prepared and excited for the specific task ahead

Focus primarily on making it crystal clear what the student will actually be doing in this step. Be natural, authentic to your character, and educational.`;
                humanPrompt = `Create a welcome message for this scenario:

Student Name: ${userName || 'Student'}
Task: ${stepInfo.task.name}
Subtask: ${stepInfo.subtask.name}
Step ID: ${stepInfo.step.id}
Step: ${stepInfo.step.step || ''}
Step Objective: ${stepInfo.step.objective}
Subtask Description: ${stepInfo.subtask.description || ''}
Your Role: ${stepInfo.step.primaryAgent}

CRITICAL: The main focus should be explaining exactly what the student will be doing in this step. If you're involved in the activity (like being interviewed, providing input, etc.), explain that clearly from your perspective as ${agent.name}. Make it actionable and specific.`;
            }
            else {
                // Generic educational welcome message
                systemPrompt = `You are a helpful educational assistant for a requirements engineering course. Create personalized welcome messages that:
1. Welcome the student warmly by name
2. EXPLICITLY explain what the student will be doing in this specific step
3. Provide clear, actionable guidance on the task ahead
4. Give specific expectations for what they need to accomplish
5. Keep the tone professional but friendly and approachable

Focus primarily on making it crystal clear what the student will actually be doing in this step. Be specific and actionable.`;
                humanPrompt = `Create a welcome message for this learning step:

Student Name: ${userName || 'Student'}
Task: ${stepInfo.task.name}
Subtask: ${stepInfo.subtask.name}
Step ID: ${stepInfo.step.id}
Step: ${stepInfo.step.step || ''}
Step Objective: ${stepInfo.step.objective}
Subtask Description: ${stepInfo.subtask.description || ''}

CRITICAL: The main focus should be explaining exactly what the student will be doing in this step. Be specific, actionable, and help them understand the concrete actions they need to take.`;
            }
            const response = await this.welcomeModel.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(humanPrompt)
            ]);
            // Extract content from response
            let content = '';
            if (typeof response === 'object' && response !== null && 'content' in response) {
                content = response.content.toString().trim();
            }
            else {
                content = typeof response === 'string' ? response.trim() : String(response).trim();
            }
            // Fallback to default message if LLM fails
            if (!content || content.length < 10) {
                const fallbackName = userName ? ` ${userName}` : '';
                const stepText = stepInfo.step.step || stepInfo.subtask.name || 'this step';
                if (isAgentInvolved && agent) {
                    content = `Hi${fallbackName}! I'm ${agent.name}, and I'm here to help you with ${stepText}. In this step, you'll be ${stepInfo.step.objective.toLowerCase()}. I'll be involved in this process, so let's work together to accomplish your learning goals!`;
                }
                else {
                    content = `Welcome${fallbackName}! In this step, you'll be working on: ${stepText}. Your objective is to ${stepInfo.step.objective.toLowerCase()}. I'm here to guide you through exactly what you need to do. Ready to get started?`;
                }
            }
            return content;
        }
        catch (error) {
            console.error('❌ ChatService: Error generating context-aware welcome message:', error);
            // Fallback to a basic but still context-aware message
            const fallbackName = userName ? ` ${userName}` : '';
            const stepText = stepInfo?.step?.step || stepInfo?.subtask?.name || 'this step';
            return `Welcome${fallbackName}! In this step, you'll be working on: ${stepText}. Your objective is to ${stepInfo?.step?.objective?.toLowerCase() || 'complete the learning task'}. I'm here to guide you through exactly what you need to do. Let's get started!`;
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
