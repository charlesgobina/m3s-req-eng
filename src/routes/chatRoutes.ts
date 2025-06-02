import { Router } from 'express';
import { ChatController } from '../controller/chatController.js';
import { AgentService } from '../services/agentService.js';

const router = Router();
const agentService = new AgentService();
const chatController = new ChatController(agentService);

// Initialize the agent service
agentService.initialize();

router.post('/stream', async (req, res, next) => {
  try {
	await chatController.streamChat(req, res);
  } catch (err) {
	next(err);
  }
});
router.get('/history/:sessionId/:taskId', (req, res) => chatController.getChatHistory(req, res));

export { router as chatRouter };
