import { Router } from 'express';
import { PasswordResetController } from '../controller/passwordResetController.js';
const router = Router();
const passwordResetController = new PasswordResetController();
router.post('/request', async (req, res, next) => {
    try {
        await passwordResetController.requestPasswordReset(req, res);
    }
    catch (err) {
        next(err);
    }
});
router.post('/verify', async (req, res, next) => {
    try {
        await passwordResetController.verifyResetCode(req, res);
    }
    catch (err) {
        next(err);
    }
});
router.post('/confirm', async (req, res, next) => {
    try {
        await passwordResetController.confirmPasswordReset(req, res);
    }
    catch (err) {
        next(err);
    }
});
export default router;
