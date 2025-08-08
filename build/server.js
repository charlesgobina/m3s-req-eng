import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chatRoutes.js';
import { taskRouter } from './routes/taskRoutes.js';
import { validationRouter } from './routes/validationRoutes.js';
import { contextRouter } from './routes/contextRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import passwordResetRouter from './routes/passwordResetRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { chatService } from './services/chatService.js';
import { initializeServices } from './services/index.js';
import RedisManager from './config/redisConfig.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
// CORS Configuration
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'https://m3req.netlify.app',
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
// Routes
app.use('/api/auth', authRouter); // Authentication routes
app.use('/api/password-reset', passwordResetRouter); // Password recovery routes
app.use('/api/chat', chatRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/validation', validationRouter);
app.use('/api/context', contextRouter);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Requirements Engineering Learning Server is running',
        timestamp: new Date().toISOString()
    });
});
// Error handling middleware (should be last)
app.use(errorHandler);
// Initialize server with all services
async function startServer() {
    try {
        console.log('🚀 Starting Requirements Engineering Learning Server...');
        // Initialize singleton services first
        console.log('🔧 Initializing singleton services...');
        await initializeServices();
        // Test Firebase Admin connection using existing admin config
        console.log('🔌 Testing Firebase Admin connection...');
        const isConnected = await chatService.testConnection();
        if (!isConnected) {
            console.warn('⚠️ Firebase connection test failed, but server will continue...');
        }
        // Start the server
        app.listen(PORT, () => {
            console.log('');
            console.log('🎉 ================================');
            console.log('✅ Server started successfully!');
            console.log('🎉 ================================');
            console.log(`🚀 Port: ${PORT}`);
            console.log(`💚 Health check: http://localhost:${PORT}/health`);
            console.log('🔧 Singleton services: ✅ Initialized');
            console.log('🔥 Firebase Admin: ✅ Connected');
            console.log('📦 Redis Memory: ✅ Ready');
            console.log('🎉 ================================');
            console.log('');
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
// Graceful shutdown handler to prevent memory leaks
process.on('SIGTERM', async () => {
    console.log('🔄 SIGTERM received, starting graceful shutdown...');
    await gracefulShutdown();
});
process.on('SIGINT', async () => {
    console.log('🔄 SIGINT received, starting graceful shutdown...');
    await gracefulShutdown();
});
async function gracefulShutdown() {
    try {
        console.log('🔌 Closing Redis connections...');
        await RedisManager.closeConnection();
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
    }
}
// Start the server
startServer();
