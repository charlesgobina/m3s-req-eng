import { Request, Response } from 'express';
import { AgentService } from '../services/agentService.js';

export class TaskController {
  private agentService: AgentService;

  constructor(agentService: AgentService) {
    this.agentService = agentService;
  }

  async getTasks(req: Request, res: Response) {
    try {
      const tasks = this.agentService.getLearningTasksList();
      res.json({ tasks });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async getTeamMembers(req: Request, res: Response) {
    try {
      const teamMembers = this.agentService.getTeamMembersList();
      res.json({ teamMembers });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}