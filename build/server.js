import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chatRoutes.js';
import { taskRouter } from './routes/taskRoutes.js';
import { validationRouter } from './routes/validationRoutes.js';
import { contextRouter } from './routes/contextRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
// Routes
app.use('/api/chat', chatRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/validation', validationRouter);
app.use('/api/context', contextRouter);
// Error handling middleware (should be last)
app.use(errorHandler);
app.listen(PORT, () => {
    console.log(`Requirements Engineering Learning Server running on port ${PORT}`);
});
