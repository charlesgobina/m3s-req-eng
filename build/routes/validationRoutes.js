import { Router } from 'express';
import { ValidationController } from '../controller/validationController.js';
import { AgentService } from '../services/agentService.js';
const router = Router();
const agentService = new AgentService();
const validationController = new ValidationController(agentService);
router.post('/validate', async (req, res, next) => {
    try {
        await validationController.validateSubmission(req, res);
    }
    catch (err) {
        next(err);
    }
});
export { router as validationRouter };
