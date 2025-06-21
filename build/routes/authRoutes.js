import { Router } from 'express';
import { AuthController } from '../controller/authController.js';
import { AuthService } from '../services/authService.js';
import { AuthMiddleware } from '../middleware/authMiddleware.js';
const router = Router();
// Initialize services and controllers
const authService = new AuthService();
const authController = new AuthController(authService);
const authMiddleware = new AuthMiddleware(authService);
// Public routes (no authentication required)
router.post('/signup', async (req, res, next) => {
    try {
        await authController.signup(req, res);
    }
    catch (err) {
        next(err);
    }
});
router.post('/login', async (req, res, next) => {
    try {
        await authController.login(req, res);
    }
    catch (err) {
        next(err);
    }
});
router.post('/verify-token', async (req, res, next) => {
    try {
        await authController.verifyToken(req, res);
    }
    catch (err) {
        next(err);
    }
});
// Protected routes (authentication required)
router.get('/profile', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await authController.getProfile(req, res);
    }
    catch (err) {
        next(err);
    }
});
router.put('/profile', authMiddleware.requireAuth, async (req, res, next) => {
    try {
        await authController.updateProfile(req, res);
    }
    catch (err) {
        next(err);
    }
});
export { router as authRouter };
