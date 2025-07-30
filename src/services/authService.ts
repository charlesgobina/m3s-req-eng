import { auth, db } from '../config/adminConfig.js';
import { UserRecord } from 'firebase-admin/auth';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'lecturer';
  courseId?: string; // Optional, if user is associated with a course
  isRegistrationApproved?: boolean; // Only for students
  // additional field for lecturer to check if they are approved
  isLecturerApproved?: boolean; // Only for lecturers
}

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'student' | 'lecturer';
  courseId?: string; // Optional, if user is associated with a course
}

export interface LoginData {
  email: string;
  password: string;
}

export class AuthService {
  async signup(userData: SignupData): Promise<{ user: User; customToken: string }> {
    try {
      // Create user in Firebase Auth
      const userRecord: UserRecord = await auth.createUser({
        email: userData.email,
        password: userData.password,
        displayName: `${userData.firstName} ${userData.lastName}`,
      });
      // Create user document in Firestore
      const user: User = { // kinda redundant, will check this out later
        id: userRecord.uid,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role,
        courseId: userData.courseId, // Optional, if user is associated with a course
      };

      const firestoreData: any = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role,
        courseId: userData.courseId, // Optional, if user is associated with a course
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Only add isRegistrationApproved for students
      if (userData.role === 'student') {
        user.isRegistrationApproved = false;
        firestoreData.isRegistrationApproved = false;
      }

      // Only add isLecturerApproved for lecturers
      if (userData.role === 'lecturer') {
        user.isLecturerApproved = false;
        firestoreData.isLecturerApproved = false;
      }

      await db.collection('users').doc(userRecord.uid).set(firestoreData);

      // Generate custom token for immediate login
      const customToken = await auth.createCustomToken(userRecord.uid);

      return { user, customToken };
    } catch (error: any) {
      throw new Error(`Signup failed: ${error.message}`);
    }
  }

  async login(loginData: LoginData): Promise<{ user: User; customToken: string }> {
    try {
      // Use Firebase Auth REST API to verify email/password
      const apiKey = process.env.FIREBASE_API_KEY;
      if (!apiKey) {
        throw new Error('Firebase API key not configured');
      }

      const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
      
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginData.email,
          password: loginData.password,
          returnSecureToken: true,
        }),
      });

      const authResult = await response.json();

      if (!response.ok) {
        // Handle Firebase Auth errors
        if (authResult.error?.message?.includes('EMAIL_NOT_FOUND')) {
          throw new Error('user-not-found');
        }
        if (authResult.error?.message?.includes('INVALID_PASSWORD')) {
          throw new Error('wrong-password');
        }
        if (authResult.error?.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
          throw new Error('wrong-password');
        }
        throw new Error(authResult.error?.message || 'Authentication failed');
      }

      // Get user data from Firestore using the verified user ID
      const userDoc = await db.collection('users').doc(authResult.localId).get();
      
      if (!userDoc.exists) {
        throw new Error('User profile not found');
      }

      const userData = userDoc.data();
      const user: User = {
        id: authResult.localId,
        firstName: userData!.firstName,
        lastName: userData!.lastName,
        email: userData!.email,
        role: userData!.role,
        courseId: userData!.courseId,
      };

      // Only add isRegistrationApproved for students
      if (userData!.role === 'student') {
        user.isRegistrationApproved = userData!.isRegistrationApproved;
        
        // Check if student registration is approved
        if (!user.isRegistrationApproved) {
          throw new Error('registration-not-approved');
        }
      }

      // Only add isLecturerApproved for lecturers
      if (userData!.role === 'lecturer') {
        user.isLecturerApproved = userData!.isLecturerApproved;
        // Check if lecturer registration is approved
        if (!user.isLecturerApproved) {
          throw new Error('lecturer-not-approved');
        }
      }

      // Generate custom token for the verified user
      const customToken = await auth.createCustomToken(authResult.localId);

      return { user, customToken };
    } catch (error: any) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async verifyToken(idToken: string): Promise<User> {
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      
      // Get user data from Firestore
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      
      if (!userDoc.exists) {
        throw new Error('User profile not found');
      }

      const userData = userDoc.data();
      const user: User = {
        id: decodedToken.uid,
        firstName: userData!.firstName,
        lastName: userData!.lastName,
        email: userData!.email,
        role: userData!.role,
        courseId: userData!.courseId,
      };

      // Only add isRegistrationApproved for students
      if (userData!.role === 'student') {
        user.isRegistrationApproved = userData!.isRegistrationApproved;
      }

      return user;
    } catch (error: any) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  async getUserById(uid: string): Promise<User | null> {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      
      if (!userDoc.exists) {
        return null;
      }

      const userData = userDoc.data();
      const user: User = {
        id: uid,
        firstName: userData!.firstName,
        lastName: userData!.lastName,
        email: userData!.email,
        role: userData!.role,
        courseId: userData!.courseId,
      };

      // Only add isRegistrationApproved for students
      if (userData!.role === 'student') {
        user.isRegistrationApproved = userData!.isRegistrationApproved;
      }

      return user;
    } catch (error: any) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  async updateUserProfile(uid: string, updateData: Partial<Omit<User, 'id' | 'email'>>): Promise<User> {
    try {
      const updateObj = {
        ...updateData,
        updatedAt: new Date(),
      };

      await db.collection('users').doc(uid).update(updateObj);
      
      const updatedUser = await this.getUserById(uid);
      if (!updatedUser) {
        throw new Error('User not found after update');
      }

      return updatedUser;
    } catch (error: any) {
      throw new Error(`Failed to update user profile: ${error.message}`);
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      // Delete from Firebase Auth
      await auth.deleteUser(uid);
      
      // Delete from Firestore
      await db.collection('users').doc(uid).delete();
    } catch (error: any) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }
}