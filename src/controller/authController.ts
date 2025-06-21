import { Request, Response } from 'express';
import { AuthService, SignupData, LoginData } from '../services/authService.js';

export class AuthController {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async signup(req: Request, res: Response) {
    try {
      const { firstName, lastName, email, password, role }: SignupData = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !password || !role) {
        return res.status(400).json({
          error: 'All fields are required: firstName, lastName, email, password, role'
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
        role
      });

      res.status(201).json({
        message: 'User created successfully',
        user: result.user,
        customToken: result.customToken
      });
    } catch (error: any) {
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

  async login(req: Request, res: Response) {
    try {
      const { email, password }: LoginData = req.body;

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
    } catch (error: any) {
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

      res.status(500).json({
        error: error.message || 'Login failed'
      });
    }
  }

  async verifyToken(req: Request, res: Response) {
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
    } catch (error: any) {
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

  async getProfile(req: Request, res: Response) {
    try {
      // Extract user ID from the verified token (set by auth middleware)
      const userId = (req as any).user?.uid;
      
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
    } catch (error: any) {
      console.error('Get profile error:', error);
      res.status(500).json({
        error: error.message || 'Failed to get profile'
      });
    }
  }

  async updateProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.uid;
      
      if (!userId) {
        return res.status(401).json({
          error: 'User not authenticated'
        });
      }

      const { firstName, lastName, role } = req.body;
      const updateData: any = {};

      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
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
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({
        error: error.message || 'Failed to update profile'
      });
    }
  }
}