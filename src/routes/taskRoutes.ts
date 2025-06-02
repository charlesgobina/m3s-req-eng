import { Router } from 'express';
import { TaskController } from '../controller/taskController.js';
import { AgentService } from '../services/agentService.js';

const router = Router();
const agentService = new AgentService();
const taskController = new TaskController(agentService);

router.get('/', (req, res) => taskController.getTasks(req, res));
router.get('/team-members', (req, res) => taskController.getTeamMembers(req, res));

export { router as taskRouter };