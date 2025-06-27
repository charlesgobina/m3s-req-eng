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

// Protected routes - PRESERVE ORIGINAL FUNCTIONALITY
router.get('/', authMiddleware.requireAuth, (req, res) => taskController.getTasks(req, res));
router.get('/team-members', authMiddleware.requireAuth, (req, res) => taskController.getTeamMembers(req, res));

// Firestore task management routes (using /firestore prefix to avoid conflicts)
router.post('/firestore', authMiddleware.requireLecturer, async (req, res, next) => {
  try {
    await taskController.addTask(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/firestore/:taskId', authMiddleware.requireAuth, async (req, res, next) => {
  try {
    await taskController.getTaskById(req, res);
  } catch (err) {
    next(err);
  }
});

router.put('/firestore/:taskId', authMiddleware.requireLecturer, async (req, res, next) => {
  try {
    await taskController.updateTask(req, res);
  } catch (err) {
    next(err);
  }
});

router.delete('/firestore/:taskId', authMiddleware.requireLecturer, async (req, res, next) => {
  try {
    await taskController.deleteTask(req, res);
  } catch (err) {
    next(err);
  }
});

export { router as taskRouter };