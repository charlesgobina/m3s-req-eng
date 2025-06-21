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
  } catch (err) {
    next(err);
  }
});

router.get('/history/:sessionId/:taskId', authMiddleware.requireAuth, (req, res) => 
  chatController.getChatHistory(req, res)
);

export { router as chatRouter };