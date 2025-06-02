export class TaskController {
    agentService;
    constructor(agentService) {
        this.agentService = agentService;
    }
    async getTasks(req, res) {
        try {
            const tasks = this.agentService.getLearningTasksList();
            res.json({ tasks });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async getTeamMembers(req, res) {
        try {
            const teamMembers = this.agentService.getTeamMembersList();
            res.json({ teamMembers });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
