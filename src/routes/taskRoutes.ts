import { Router } from 'express';
import { TaskController } from '../controller/taskController.js';
import { AgentService } from '../services/agentService.js';
import { AuthService } from '../services/authService.js';
import { AuthMiddleware } from '../middleware/authMiddleware.js';

const router = Router();
const agentService = new AgentService();
const taskController = new TaskController(agentService);

// Initialize auth middleware
const authService = new AuthService();
const authMiddleware = new AuthMiddleware(authService);

// Protected routes
router.get('/', authMiddleware.requireAuth, (req, res) => taskController.getTasks(req, res));
router.get('/team-members', authMiddleware.requireAuth, (req, res) => taskController.getTeamMembers(req, res));

// Lecturer-only route for managing tasks ** future implementation **
router.post('/', authMiddleware.requireLecturer, async (req, res, next) => {
  try {
    // Add logic for creating/managing tasks (lecturer only)
    res.json({ message: 'Task creation endpoint - lecturer only' });
  } catch (err) {
    next(err);
  }
});

export { router as taskRouter };