import { Router } from 'express';
import { ValidationController } from '../controller/validationController.js';
import { AgentService } from '../services/agentService.js';
import { AuthService } from '../services/authService.js';
import { AuthMiddleware } from '../middleware/authMiddleware.js';
const router = Router();
const agentService = new AgentService();
const validationController = new ValidationController(agentService);
// Initialize auth middleware
const authService = new AuthService();
const authMiddleware = new AuthMiddleware(authService);
// Student-only validation endpoint
router.post('/validate', authMiddleware.requireStudent, async (req, res, next) => {
    try {
        await validationController.validateSubmission(req, res);
    }
    catch (err) {
        next(err);
    }
});
export { router as validationRouter };
