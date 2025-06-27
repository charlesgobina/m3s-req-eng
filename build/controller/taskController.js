import firestoreService from '../services/firestoreService.js';
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
    // Add a new task to Firestore
    async addTask(req, res) {
        try {
            const { taskId, task } = req.body;
            // Validate required fields
            if (!taskId || !task) {
                return res.status(400).json({
                    error: 'Missing required fields: taskId and task are required'
                });
            }
            // Validate task structure
            if (!task.id || !task.name || !task.description || !task.phase || !task.objective) {
                return res.status(400).json({
                    error: 'Invalid task structure: id, name, description, phase, and objective are required'
                });
            }
            // Check if task already exists
            const taskExists = await firestoreService.taskExists(taskId);
            if (taskExists) {
                return res.status(409).json({
                    error: `Task with ID ${taskId} already exists`
                });
            }
            // Add task to Firestore
            await firestoreService.addTask(taskId, task);
            res.status(201).json({
                message: 'Task added successfully',
                taskId: taskId,
                path: `tasks/${taskId}/task`
            });
        }
        catch (error) {
            console.error('Error adding task:', error);
            res.status(500).json({
                error: 'Internal server error',
                details: error.message
            });
        }
    }
    // Get a task by ID from Firestore
    async getTaskById(req, res) {
        try {
            const { taskId } = req.params;
            if (!taskId) {
                return res.status(400).json({
                    error: 'Task ID is required'
                });
            }
            const task = await firestoreService.getTask(taskId);
            if (!task) {
                return res.status(404).json({
                    error: `Task with ID ${taskId} not found`
                });
            }
            res.json({
                taskId: taskId,
                task: task,
                path: `tasks/${taskId}/task`
            });
        }
        catch (error) {
            console.error('Error getting task:', error);
            res.status(500).json({
                error: 'Internal server error',
                details: error.message
            });
        }
    }
    // Update an existing task in Firestore
    async updateTask(req, res) {
        try {
            const { taskId } = req.params;
            const { task } = req.body;
            if (!taskId || !task) {
                return res.status(400).json({
                    error: 'Task ID and task data are required'
                });
            }
            // Check if task exists
            const taskExists = await firestoreService.taskExists(taskId);
            if (!taskExists) {
                return res.status(404).json({
                    error: `Task with ID ${taskId} not found`
                });
            }
            // Update task in Firestore
            await firestoreService.updateTask(taskId, task);
            res.json({
                message: 'Task updated successfully',
                taskId: taskId,
                path: `tasks/${taskId}/task`
            });
        }
        catch (error) {
            console.error('Error updating task:', error);
            res.status(500).json({
                error: 'Internal server error',
                details: error.message
            });
        }
    }
    // Delete a task from Firestore
    async deleteTask(req, res) {
        try {
            const { taskId } = req.params;
            if (!taskId) {
                return res.status(400).json({
                    error: 'Task ID is required'
                });
            }
            // Check if task exists
            const taskExists = await firestoreService.taskExists(taskId);
            if (!taskExists) {
                return res.status(404).json({
                    error: `Task with ID ${taskId} not found`
                });
            }
            // Delete task from Firestore
            await firestoreService.deleteTask(taskId);
            res.json({
                message: 'Task deleted successfully',
                taskId: taskId
            });
        }
        catch (error) {
            console.error('Error deleting task:', error);
            res.status(500).json({
                error: 'Internal server error',
                details: error.message
            });
        }
    }
}
