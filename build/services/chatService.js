import { db, fbAdmin } from "../config/adminConfig.js";
import { agentService } from "./index.js";
import { ChatGroq } from "@langchain/groq";
import { MemoryService } from "./memoryService.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import dotenv from "dotenv";
import { AgentFactory } from "./agentFactory.js";
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
    model;
    constructor() {
        // Use singleton AgentService instance instead of creating new one
        console.log('🔗 ChatService: Using singleton AgentService instance');
        this.model = new ChatGroq({
            // model: "gemma2-9b-it",
            model: "llama-3.3-70b-versatile",
            temperature: 0,
            apiKey: process.env.GROQ_API_KEY,
            streaming: true,
        });
        // use ChatOpenAI for OpenAI models
        // this.model = new ChatOpenAI({
        //   model: "gpt-4-1106-preview",
        //   temperature: 0,
        //   streaming: true,
        //   openAIApiKey: process.env.OPENAI_API_KEY,
        // });
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
        console.log("🔗 Creating document reference:", {
            userId,
            taskId,
            subtaskId,
            stepId,
            chatDocId,
            fullPath: `chat_messages/${userId}/step_chats/${chatDocId}`,
        });
        return db
            .collection("chat_messages")
            .doc(userId)
            .collection("step_chats")
            .doc(chatDocId);
    }
    /**
     * Retrieves all chat messages for a specific step
     */
    async getChatMessages(userId, taskId, subtaskId, stepId) {
        try {
            console.log("💬 ChatService: Loading messages for", {
                userId,
                taskId,
                subtaskId,
                stepId,
            });
            // Log the exact Firestore path being queried
            const chatDocId = this.createChatDocumentId(taskId, subtaskId, stepId);
            const firestorePath = `chat_messages/${userId}/step_chats/${chatDocId}`;
            console.log("🔍 EXACT FIRESTORE PATH:", firestorePath);
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            console.log("🔍 FIRESTORE DOC REF PATH:", chatDocRef.path);
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                console.log("📭 ChatService: No chat document found, returning empty array");
                return [];
            }
            const chatData = chatDoc.data();
            const messages = chatData.messages || [];
            // Log what we actually retrieved
            console.log("🔍 FIRESTORE DATA RETRIEVED:", {
                messageCount: messages.length,
                documentId: chatDoc.id,
                documentPath: chatDoc.ref.path,
                firstMessageSample: messages.length > 0
                    ? {
                        id: messages[0].id,
                        role: messages[0].role,
                        content: messages[0].content.substring(0, 50) + "...",
                        timestamp: messages[0].timestamp,
                    }
                    : null,
            });
            // Convert Firestore timestamps to Date objects for UI
            const uiMessages = messages.map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp instanceof Date
                    ? msg.timestamp
                    : msg.timestamp.toDate(),
                agentRole: msg.agentRole,
            }));
            console.log(`✅ ChatService: Loaded ${uiMessages.length} messages`);
            return uiMessages;
        }
        catch (error) {
            console.error("❌ ChatService: Failed to load messages:", error);
            throw new Error(`Failed to load chat messages: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    /**
     * Generates a welcome message for a new step
     * @param userId - The ID of the user
     * @param taskId - The ID of the task
     * @param subtaskId - The ID of the subtask
     * @param stepId - The ID of the step
     * @returns A welcome message
     */
    async createInitialWelcomeMessage(userId, taskId, subtaskId, stepId) {
        let welcomeMessage = {
            id: "",
            role: "user",
            content: "",
            timestamp: new Date(),
            isWelcomeMessage: true,
        };
        // get learning task details using singleton AgentService
        const taskDetails = agentService
            .getLearningTasksList()
            .find((task) => task.id === taskId);
        const stepDetails = taskDetails?.subtasks
            ?.find((subtask) => subtask.id === subtaskId)
            ?.steps?.find((step) => step.id === stepId);
        const subtaskDetails = taskDetails?.subtasks.find((subtask) => subtask.id === subtaskId);
        const message = `Give me information about this step: ${stepDetails?.step} which is part of the subtask: ${subtaskDetails?.name} and task: ${taskDetails?.name}.`;
        welcomeMessage.id = `welcome_${Date.now()}`; // Generate a unique ID based on timestamp
        welcomeMessage.role = "assistant"; // Set role to assistant
        welcomeMessage.timestamp = new Date(); // Set current timestamp
        welcomeMessage.agentRole = "Team Lead"; // Use agent role from step details if available
        if (stepDetails && taskDetails && subtaskDetails) {
            welcomeMessage.content = await this.createWelcomeLLMPipeline(userId, welcomeMessage.agentRole, stepDetails, taskDetails, subtaskDetails, message, this.model);
        }
        // Save the welcome message to the chat
        await this.addChatMessage(userId, taskId, subtaskId, stepId, welcomeMessage);
        return welcomeMessage;
    }
    // build welcome llm pipeline
    async createWelcomeLLMPipeline(userId, agentRole, stepDetails, taskDetails, subtaskDetails, message, model) {
        const agentFactory = new AgentFactory(model);
        const memoryService = new MemoryService(model);
        const comprehensiveContext = await memoryService.getUniversalContext(userId, agentRole, message, taskDetails.id, subtaskDetails.id, stepDetails.id);
        const welcomeAgentDetails = agentFactory
            .getTeamMembers()
            .find((member) => member.role === "Team Lead");
        if (!welcomeAgentDetails) {
            throw new Error("Team Lead team member not found");
        }
        const allTeamMembers = agentService.getTeamMembersList();
        try {
            const promptSys = `You are a Team Lead - a warm, helpful assistant that introduces students to new learning steps. You respond to questions and do not attach anything supplementary to your answers

        Your role:
        - Welcome the student to the current step
        - Clearly explain what they need to do
        - Introduce the team member they'll be working with
        - Keep the tone encouraging and professional

        Current Context:
        - Task: ${taskDetails.name}
        - Subtask: ${subtaskDetails.name} 
        - Step: ${stepDetails.step}
        - Team member the student will work with: ${this.getPrimaryAgentName(stepDetails.primaryAgent, allTeamMembers)}

        Communication Style: ${welcomeAgentDetails.communicationStyle}

        Instructions:
        1. Start with a brief, friendly welcome
        2. Explain the current step's objective clearly
        3. Introduce the team member they'll work with (if it's you as Alex the Team Lead, mention that directly).
        4. Encourage questions and engagement
        5. Keep it concise but informative

        ${comprehensiveContext
                ? `Relevant project context: ${comprehensiveContext}`
                : ""}`;
            const promptUser = `Create a welcome message for this step. Include:
        - What the student will learn or accomplish
        - Who they'll be working with
        - Any relevant context from previous steps
        Keep it engaging but focused.`;
            const aiMsg = await model.invoke([
                new SystemMessage(promptSys),
                new HumanMessage(promptUser),
            ]);
            return aiMsg.content.toString();
        }
        catch (error) {
            console.error("❌ Failed to create welcome LLM pipeline:", error);
            throw new Error(`Failed to create welcome message: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    getPrimaryAgentName(primaryAgentRole, teamMembers) {
        const agent = teamMembers.find((member) => member.role === primaryAgentRole);
        return agent ? agent.name || agent.role : "one of our team members";
    }
    /**
     * Adds a new chat message to the step's chat collection
     */
    async addChatMessage(userId, taskId, subtaskId, stepId, message) {
        try {
            console.log("💬 ChatService: Adding message", {
                userId,
                taskId,
                subtaskId,
                stepId,
                messageRole: message.role,
                messageLength: message.content.length,
            });
            // Validate required fields
            if (!message.id || !message.role || !message.content) {
                throw new Error("Message missing required fields: id, role, or content");
            }
            // Clean the message object and ensure timestamp
            // Note: Cannot use serverTimestamp() inside arrayUnion, use actual timestamp
            const cleanMessage = {
                id: message.id,
                role: message.role,
                content: message.content,
                timestamp: message.timestamp || new Date(),
                ...(message.agentRole && { agentRole: message.agentRole }),
            };
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            // Check if document exists
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                // Create new chat document
                const newChatDocument = {
                    messages: [cleanMessage],
                    messageCount: 1,
                    lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp(),
                };
                await chatDocRef.set(newChatDocument);
                console.log("✅ ChatService: Created new chat document with first message");
            }
            else {
                // Update existing document
                await chatDocRef.update({
                    messages: fbAdmin.firestore.FieldValue.arrayUnion(cleanMessage),
                    messageCount: fbAdmin.firestore.FieldValue.increment(1),
                    lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp(),
                });
                console.log("✅ ChatService: Added message to existing chat document");
            }
        }
        catch (error) {
            console.error("❌ ChatService: Failed to add message:", error);
            throw new Error(`Failed to add chat message: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    /**
     * Gets chat summary statistics for a step
     */
    async getChatSummary(userId, taskId, subtaskId, stepId) {
        try {
            console.log("📊 ChatService: Getting chat summary for", {
                userId,
                taskId,
                subtaskId,
                stepId,
            });
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            const chatDoc = await chatDocRef.get();
            if (!chatDoc.exists) {
                console.log("📭 ChatService: No chat document found for summary");
                return null;
            }
            const chatData = chatDoc.data();
            const summary = {
                chatMessageCount: chatData.messageCount || 0,
                lastChatAt: chatData.lastUpdated,
            };
            console.log("✅ ChatService: Retrieved chat summary:", summary);
            return summary;
        }
        catch (error) {
            console.error("❌ ChatService: Failed to get chat summary:", error);
            throw new Error(`Failed to get chat summary: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    /**
     * Gets user name from Firebase Auth
     */
    async getUserName(userId) {
        try {
            const userRecord = await fbAdmin.auth().getUser(userId);
            return (userRecord.displayName || userRecord.email?.split("@")[0] || "Student");
        }
        catch (error) {
            console.error("❌ ChatService: Error getting user name:", error);
            return "Student";
        }
    }
    /**
     * Deletes all chat messages for a specific step
     */
    async deleteChatHistory(userId, taskId, subtaskId, stepId) {
        try {
            console.log("🗑️ ChatService: Deleting chat history for", {
                userId,
                taskId,
                subtaskId,
                stepId,
            });
            const chatDocRef = this.getChatDocumentRef(userId, taskId, subtaskId, stepId);
            // Reset the document instead of deleting to maintain structure
            const emptyChatDocument = {
                messages: [],
                messageCount: 0,
                lastUpdated: fbAdmin.firestore.FieldValue.serverTimestamp(),
            };
            await chatDocRef.set(emptyChatDocument);
            console.log("✅ ChatService: Chat history deleted");
        }
        catch (error) {
            console.error("❌ ChatService: Failed to delete chat history:", error);
            throw new Error(`Failed to delete chat history: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    /**
     * Tests connection to Firestore for chat operations
     */
    async testConnection() {
        try {
            console.log("🔌 ChatService: Testing Firestore connection...");
            // Create a test document reference
            const testDoc = db
                .collection("chat_messages")
                .doc("test")
                .collection("step_chats")
                .doc("connection_test");
            // Try to write a test document
            await testDoc.set({
                test: true,
                timestamp: fbAdmin.firestore.FieldValue.serverTimestamp(),
                service: "ChatService",
            });
            console.log("✅ ChatService: Connection test successful");
            return true;
        }
        catch (error) {
            console.error("❌ ChatService: Connection test failed:", error);
            return false;
        }
    }
}
// const chatServicer = new ChatService();
// chatServicer.createInitialWelcomeMessage(
//   "user123",
//   "home",
//   "getting_to_know_you",
//   "personal_introduction"
// );
// Export singleton instance
export const chatService = new ChatService();
