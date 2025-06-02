import { Router } from 'express';
const router = Router();
// Endpoint to receive project context from frontend
router.post('/update', (req, res) => {
    try {
        const projectContext = req.body;
        // In a real implementation, you might want to store this in a session or database
        // For now, we'll just acknowledge receipt
        res.json({
            message: 'Project context received successfully',
            contextReceived: true
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export { router as contextRouter };
