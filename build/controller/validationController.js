export class ValidationController {
    agentService;
    constructor(agentService) {
        this.agentService = agentService;
    }
    async validateSubmission(req, res) {
        try {
            const { submission, taskId, subtask, step, sessionId, projectContext } = req.body;
            if (!submission || !taskId || !sessionId || !step) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
            const result = await this.agentService.validateSubmission(submission, taskId, subtask, step, sessionId);
            res.json(result);
        }
        catch (error) {
            console.error('Validation error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}
