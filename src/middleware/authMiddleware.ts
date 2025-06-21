import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    role: 'student' | 'lecturer';
  };
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  // Middleware to verify JWT token
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) { // check the format of the authorization header
        res.status(401).json({
          error: 'Authorization header missing or invalid format. Use: Bearer <token>'
        });
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      if (!idToken) {
        res.status(401).json({
          error: 'Token not provided'
        });
        return;
      }

      // Verify the token and get user data
      const user = await this.authService.verifyToken(idToken);

      // Attach user info to request object
      req.user = {
        uid: user.id,
        email: user.email,
        role: user.role
      };

      next();
    } catch (error: any) {
      console.error('Authentication error:', error);
      
      if (error.message.includes('Token verification failed')) {
        res.status(401).json({
          error: 'Invalid or expired token'
        });
        return;
      }

      res.status(500).json({
        error: 'Authentication failed'
      });
      return;
    }
  };

  // Middleware to check if user has required role
  authorize = (roles: Array<'student' | 'lecturer'>) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        res.status(401).json({
          error: 'User not authenticated'
        });
        return;
      }

      if (!roles.includes(req.user.role)) {
        res.status(403).json({
          error: `Access denied. Required roles: ${roles.join(', ')}`
        });
        return;
      }

      next();
    };
  };

  // Middleware to check if user is a lecturer
  requireLecturer = this.authorize(['lecturer']);

  // Middleware to check if user is a student
  requireStudent = this.authorize(['student']);

  // Middleware to allow both students and lecturers
  requireAuth = this.authenticate;
}