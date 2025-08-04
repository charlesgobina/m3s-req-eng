import { Router } from 'express';
import { ChatController } from '../controller/chatController.js';
import { agentService, authService } from '../services/index.js';
import { AuthMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Use singleton instances instead of creating new ones
const chatController = new ChatController(agentService);
const authMiddleware = new AuthMiddleware(authService);

console.log('🔗 ChatRoutes: Using singleton AgentService and AuthService instances');

// Protected routes - require authentication
router.post('/stream', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await chatController.streamChat(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/history/:sessionId/:taskId', authMiddleware.requireAuth, (req, res) => 
  chatController.getChatHistory(req, res)
);

// New chat service routes with authentication protection

// Get chat messages for a specific step
router.get('/messages/:taskId/:subtaskId/:stepId', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await chatController.getChatMessages(req, res);
  } catch (err) {
    next(err);
  }
});

// Add a new chat message
router.post('/messages', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await chatController.addChatMessage(req, res);
  } catch (err) {
    next(err);
  }
});

// Get chat summary for a step
router.get('/summary/:taskId/:subtaskId/:stepId', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await chatController.getChatSummary(req, res);
  } catch (err) {
    next(err);
  }
});

// Create initial welcome message for a step
router.post('/welcome', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await chatController.createWelcomeMessage(req, res);
  } catch (err) {
    next(err);
  }
});

// Delete chat history for a step
router.delete('/history/:taskId/:subtaskId/:stepId', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await chatController.deleteChatHistory(req, res);
  } catch (err) {
    next(err);
  }
});

// Test chat service connection (admin only - could add additional auth check)
router.get('/test', (req, res) => 
  chatController.testConnection(req, res)
);

export { router as chatRouter };