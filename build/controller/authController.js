export class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async signup(req, res) {
        try {
            const { firstName, lastName, email, password, role, courseId } = req.body;
            console.log('Signup request received:', { firstName, lastName, email, role, courseId });
            // Validate required fields
            if (!firstName || !lastName || !email || !password || !role || !courseId) {
                return res.status(400).json({
                    error: 'All fields are required: firstName, lastName, email, password, role, courseId'
                });
            }
            // Validate role
            if (role !== 'student' && role !== 'lecturer') {
                return res.status(400).json({
                    error: 'Role must be either "student" or "lecturer"'
                });
            }
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    error: 'Invalid email format'
                });
            }
            // Validate password strength
            if (password.length < 6) {
                return res.status(400).json({
                    error: 'Password must be at least 6 characters long'
                });
            }
            const result = await this.authService.signup({
                firstName,
                lastName,
                email,
                password,
                role,
                courseId // Optional, if user is associated with a course
            });
            res.status(201).json({
                message: 'User created successfully',
                user: result.user,
                customToken: result.customToken
            });
        }
        catch (error) {
            console.error('Signup error:', error);
            // Handle Firebase specific errors
            if (error.message.includes('email-already-exists')) {
                return res.status(409).json({
                    error: 'Email already exists'
                });
            }
            if (error.message.includes('weak-password')) {
                return res.status(400).json({
                    error: 'Password is too weak'
                });
            }
            res.status(500).json({
                error: error.message || 'Signup failed'
            });
        }
    }
    async login(req, res) {
        try {
            const { email, password } = req.body;
            // Validate required fields
            if (!email || !password) {
                return res.status(400).json({
                    error: 'Email and password are required'
                });
            }
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    error: 'Invalid email format'
                });
            }
            const result = await this.authService.login({ email, password });
            res.status(200).json({
                message: 'Login successful',
                user: result.user,
                customToken: result.customToken
            });
        }
        catch (error) {
            console.error('Login error:', error);
            // Handle Firebase specific errors
            if (error.message.includes('user-not-found')) {
                return res.status(404).json({
                    error: 'User not found'
                });
            }
            if (error.message.includes('wrong-password')) {
                return res.status(401).json({
                    error: 'Invalid credentials'
                });
            }
            if (error.message.includes('registration-not-approved')) {
                return res.status(403).json({
                    error: 'Your registration has not been approved yet. Please contact your lecturer.'
                });
            }
            if (error.message.includes('lecturer-not-approved')) {
                return res.status(403).json({
                    error: 'Your lecturer registration has not been approved yet. Please contact an administrator.'
                });
            }
            res.status(500).json({
                error: error.message || 'Login failed'
            });
        }
    }
    async verifyToken(req, res) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 'Authorization header missing or invalid format'
                });
            }
            const idToken = authHeader.split('Bearer ')[1];
            const user = await this.authService.verifyToken(idToken);
            res.status(200).json({
                message: 'Token verified successfully',
                user
            });
        }
        catch (error) {
            console.error('Token verification error:', error);
            if (error.message.includes('Token verification failed')) {
                return res.status(401).json({
                    error: 'Invalid or expired token'
                });
            }
            res.status(500).json({
                error: error.message || 'Token verification failed'
            });
        }
    }
    async getProfile(req, res) {
        try {
            // Extract user ID from the verified token (set by auth middleware)
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({
                    error: 'User not authenticated'
                });
            }
            const user = await this.authService.getUserById(userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User profile not found'
                });
            }
            res.status(200).json({
                message: 'Profile retrieved successfully',
                user
            });
        }
        catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                error: error.message || 'Failed to get profile'
            });
        }
    }
    async updateProfile(req, res) {
        try {
            const userId = req.user?.uid;
            if (!userId) {
                return res.status(401).json({
                    error: 'User not authenticated'
                });
            }
            const { firstName, lastName, role } = req.body;
            const updateData = {};
            if (firstName)
                updateData.firstName = firstName;
            if (lastName)
                updateData.lastName = lastName;
            if (role && (role === 'student' || role === 'lecturer')) {
                updateData.role = role;
            }
            if (Object.keys(updateData).length === 0) {
                return res.status(400).json({
                    error: 'No valid fields to update'
                });
            }
            const updatedUser = await this.authService.updateUserProfile(userId, updateData);
            res.status(200).json({
                message: 'Profile updated successfully',
                user: updatedUser
            });
        }
        catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                error: error.message || 'Failed to update profile'
            });
        }
    }
}
