import { chatService } from "../services/chatService.js";
export class ChatController {
    agentService;
    constructor(agentService) {
        this.agentService = agentService;
    }
    async streamChat(req, res) {
        try {
            const { message, taskId, subtask, step, sessionId, agentRole, } = req.body;
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({ error: "User not authenticated" });
            }
            if (!message || !taskId || !sessionId || !step) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            // Set up SSE headers
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Cache-Control",
            });
            // Route to appropriate agent if not specified
            let selectedAgent = agentRole;
            if (!selectedAgent) {
                selectedAgent = await this.agentService.routeToAgent(message, taskId);
                res.write(`data: {"type": "agent_selected", "agent": "${selectedAgent}"}\n\n`);
            }
            // Start streaming chat response
            res.write(`data: {"type": "response_start", "agent": "${selectedAgent}"}\n\n`);
            // Get the stream
            const responseStream = await this.agentService.chatWithAgent(message, taskId, subtask, step, selectedAgent, sessionId);
            console.log("Starting stream consumption..."); // Debug log
            // Process the stream
            for await (const chunk of responseStream) {
                console.log("Controller received chunk:", chunk); // Debug log
                res.write(`data: ${JSON.stringify({
                    type: "content",
                    content: chunk,
                    agent: selectedAgent,
                })}\n\n`);
                // Ensure data is sent immediately
            }
            res.write(`data: {"type": "response_end"}\n\n`);
            res.end();
        }
        catch (error) {
            console.error("Chat streaming error:", error);
            res.write(`data: {"type": "error", "message": "${error.message}"}\n\n`);
            res.end();
        }
    }
    async getChatHistory(req, res) {
        try {
            const { sessionId, taskId } = req.params;
            // In a real implementation, you'd fetch chat history from database
            res.json({ chatHistory: [], sessionId, taskId });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    // New chat-specific endpoints using the dedicated chat service
    /**
     * Get chat messages for a specific step
     * GET /api/chat/messages/:taskId/:subtaskId/:stepId
     */
    async getChatMessages(req, res) {
        try {
            const { taskId, subtaskId, stepId } = req.params;
            const userId = req.user?.uid;
            console.log("###############################");
            console.log(userId);
            console.log();
            console.log("#################################");
            if (!userId) {
                return res.status(401).json({
                    error: "User not authenticated"
                });
            }
            if (!taskId || !subtaskId || !stepId) {
                return res.status(400).json({
                    error: "Missing required parameters: taskId, subtaskId, stepId"
                });
            }
            const messages = await chatService.getChatMessages(userId, taskId, subtaskId, stepId);
            console.log("Fetched chat messages:", messages); // Debug log
            res.json({
                success: true,
                messages,
                messageCount: messages.length
            });
        }
        catch (error) {
            console.error("Error fetching chat messages:", error);
            res.status(500).json({
                error: "Failed to fetch chat messages",
                details: error.message
            });
        }
    }
    /**
     * Add a new chat message
     * POST /api/chat/messages
     */
    async addChatMessage(req, res) {
        try {
            const { taskId, subtaskId, stepId, message } = req.body;
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({
                    error: "User not authenticated"
                });
            }
            if (!taskId || !subtaskId || !stepId || !message) {
                return res.status(400).json({
                    error: "Missing required fields: taskId, subtaskId, stepId, message"
                });
            }
            // Validate message structure
            if (!message.id || !message.role || !message.content) {
                return res.status(400).json({
                    error: "Message missing required fields: id, role, content"
                });
            }
            await chatService.addChatMessage(userId, taskId, subtaskId, stepId, message);
            res.json({
                success: true,
                message: "Chat message added successfully"
            });
        }
        catch (error) {
            console.error("Error adding chat message:", error);
            res.status(500).json({
                error: "Failed to add chat message",
                details: error.message
            });
        }
    }
    /**
     * Get chat summary for a step
     * GET /api/chat/summary/:taskId/:subtaskId/:stepId
     */
    async getChatSummary(req, res) {
        try {
            const { taskId, subtaskId, stepId } = req.params;
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({
                    error: "User not authenticated"
                });
            }
            if (!taskId || !subtaskId || !stepId) {
                return res.status(400).json({
                    error: "Missing required parameters: taskId, subtaskId, stepId"
                });
            }
            const summary = await chatService.getChatSummary(userId, taskId, subtaskId, stepId);
            res.json({
                success: true,
                summary
            });
        }
        catch (error) {
            console.error("Error fetching chat summary:", error);
            res.status(500).json({
                error: "Failed to fetch chat summary",
                details: error.message
            });
        }
    }
    /**
     * Create initial welcome message for a step
     * POST /api/chat/welcome
     */
    async createWelcomeMessage(req, res) {
        try {
            const { taskId, subtaskId, stepId } = req.body;
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({
                    error: "User not authenticated"
                });
            }
            if (!taskId || !subtaskId || !stepId) {
                return res.status(400).json({
                    error: "Missing required fields: taskId, subtaskId, stepId"
                });
            }
            const welcomeMessage = await chatService.createInitialWelcomeMessage(userId, taskId, subtaskId, stepId);
            res.json({
                success: true,
                message: welcomeMessage
            });
        }
        catch (error) {
            console.error("Error creating welcome message:", error);
            res.status(500).json({
                error: "Failed to create welcome message",
                details: error.message
            });
        }
    }
    /**
     * Delete chat history for a step
     * DELETE /api/chat/history/:taskId/:subtaskId/:stepId
     */
    async deleteChatHistory(req, res) {
        try {
            const { taskId, subtaskId, stepId } = req.params;
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({
                    error: "User not authenticated"
                });
            }
            if (!taskId || !subtaskId || !stepId) {
                return res.status(400).json({
                    error: "Missing required parameters: taskId, subtaskId, stepId"
                });
            }
            await chatService.deleteChatHistory(userId, taskId, subtaskId, stepId);
            res.json({
                success: true,
                message: "Chat history deleted successfully"
            });
        }
        catch (error) {
            console.error("Error deleting chat history:", error);
            res.status(500).json({
                error: "Failed to delete chat history",
                details: error.message
            });
        }
    }
    /**
     * Test chat service connection
     * GET /api/chat/test
     */
    async testConnection(req, res) {
        try {
            const isConnected = await chatService.testConnection();
            res.json({
                success: true,
                connected: isConnected,
                message: isConnected ? "Chat service connection successful" : "Chat service connection failed"
            });
        }
        catch (error) {
            console.error("Error testing chat service connection:", error);
            res.status(500).json({
                error: "Failed to test chat service connection",
                details: error.message
            });
        }
    }
}
