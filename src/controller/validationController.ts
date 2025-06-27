import { Request, Response } from 'express';
import { AgentService } from '../services/agentService.js';
import { ValidationRequest } from '../types/index.js';

export class ValidationController {
  private agentService: AgentService;

  constructor(agentService: AgentService) {
    this.agentService = agentService;
  }

  async validateSubmission(req: Request, res: Response) {
    try {
      const { submission, taskId, subtask, step, sessionId, projectContext }: ValidationRequest = req.body;

      if (!submission || !taskId || !sessionId || !step) {
        return res.status(400).json({ error: 'Missing required fields' });
      } 

      const result = await this.agentService.validateSubmission(
        submission, taskId, subtask!, step, sessionId
      );

      res.json(result);
    } catch (error: any) {
      console.error('Validation error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}