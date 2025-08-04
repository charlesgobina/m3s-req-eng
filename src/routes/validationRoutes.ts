import { Router } from 'express';
import { ValidationController } from '../controller/validationController.js';
import { agentService, authService } from '../services/index.js';
import { AuthMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// Use singleton instances instead of creating new ones
const validationController = new ValidationController(agentService);
const authMiddleware = new AuthMiddleware(authService);

console.log('🔗 ValidationRoutes: Using singleton AgentService and AuthService instances');

// Student-only validation endpoint
router.post('/validate', authMiddleware.requireAuth, authMiddleware.requireStudent, async (req, res, next) => {
  try {
    await validationController.validateSubmission(req, res);
  } catch (err) {
    next(err);
  }
});

export { router as validationRouter };