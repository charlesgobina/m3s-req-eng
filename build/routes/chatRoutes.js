import { Router } from 'express';
import { ChatController } from '../controller/chatController.js';
import { AgentService } from '../services/agentService.js';
import { AuthService } from '../services/authService.js';
import { AuthMiddleware } from '../middleware/authMiddleware.js';
const router = Router();
const agentService = new AgentService();
const chatController = new ChatController(agentService);
// Initialize auth middleware
const authService = new AuthService();
const authMiddleware = new AuthMiddleware(authService);
// Initialize the agent service
agentService.initialize();
// Protected routes - require authentication
router.post('/stream', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await chatController.streamChat(req, res);
    }
    catch (err) {
        next(err);
    }
});
router.get('/history/:sessionId/:taskId', authMiddleware.requireAuth, (req, res) => chatController.getChatHistory(req, res));
// New chat service routes with authentication protection
// Get chat messages for a specific step
router.get('/messages/:taskId/:subtaskId/:stepId', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await chatController.getChatMessages(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Add a new chat message
router.post('/messages', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await chatController.addChatMessage(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Get chat summary for a step
router.get('/summary/:taskId/:subtaskId/:stepId', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await chatController.getChatSummary(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Create initial welcome message for a step
router.post('/welcome', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await chatController.createWelcomeMessage(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Delete chat history for a step
router.delete('/history/:taskId/:subtaskId/:stepId', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await chatController.deleteChatHistory(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Test chat service connection (admin only - could add additional auth check)
router.get('/test', authMiddleware.requireAuth, (req, res) => chatController.testConnection(req, res));
export { router as chatRouter };
