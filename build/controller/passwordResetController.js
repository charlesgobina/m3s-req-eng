import { AuthService } from '../services/authService.js';
export class PasswordResetController {
    authService;
    constructor() {
        this.authService = AuthService.getInstance();
    }
    async requestPasswordReset(req, res) {
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is required'
                });
            }
            if (!email.includes('@')) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format'
                });
            }
            await this.authService.sendPasswordResetEmail(email);
            res.status(200).json({
                success: true,
                message: 'Password reset email sent successfully'
            });
        }
        catch (error) {
            console.error('Password reset request error:', error);
            if (error.message.includes('email-not-found')) {
                return res.status(404).json({
                    success: false,
                    message: 'No user found with this email address'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Failed to send password reset email. Please try again later.'
            });
        }
    }
    async verifyResetCode(req, res) {
        try {
            const { oobCode } = req.body;
            if (!oobCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Reset code is required'
                });
            }
            const email = await this.authService.verifyPasswordResetCode(oobCode);
            res.status(200).json({
                success: true,
                email: email,
                message: 'Reset code is valid'
            });
        }
        catch (error) {
            console.error('Reset code verification error:', error);
            if (error.message.includes('invalid-reset-code')) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid reset code'
                });
            }
            if (error.message.includes('expired-reset-code')) {
                return res.status(400).json({
                    success: false,
                    message: 'Reset code has expired. Please request a new password reset.'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Failed to verify reset code. Please try again.'
            });
        }
    }
    async confirmPasswordReset(req, res) {
        try {
            const { oobCode, newPassword } = req.body;
            if (!oobCode || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Reset code and new password are required'
                });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }
            await this.authService.confirmPasswordReset(oobCode, newPassword);
            res.status(200).json({
                success: true,
                message: 'Password reset successful'
            });
        }
        catch (error) {
            console.error('Password reset confirmation error:', error);
            if (error.message.includes('invalid-reset-code')) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid reset code'
                });
            }
            if (error.message.includes('expired-reset-code')) {
                return res.status(400).json({
                    success: false,
                    message: 'Reset code has expired. Please request a new password reset.'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Failed to reset password. Please try again.'
            });
        }
    }
}
