import { auth, db } from '../config/adminConfig.js';
import { UserRecord } from 'firebase-admin/auth';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'student' | 'lecturer';
}

export interface SignupData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'student' | 'lecturer';
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
      const user: User = {
        id: userRecord.uid,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role,
      };

      await db.collection('users').doc(userRecord.uid).set({
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        role: userData.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Generate custom token for immediate login
      const customToken = await auth.createCustomToken(userRecord.uid);

      return { user, customToken };
    } catch (error: any) {
      throw new Error(`Signup failed: ${error.message}`);
    }
  }

  async login(loginData: LoginData): Promise<{ user: User; customToken: string }> {
    try {
      // Get user by email
      const userRecord = await auth.getUserByEmail(loginData.email);
      
      // Get user data from Firestore
      const userDoc = await db.collection('users').doc(userRecord.uid).get();
      
      if (!userDoc.exists) {
        throw new Error('User profile not found');
      }

      const userData = userDoc.data();
      const user: User = {
        id: userRecord.uid,
        firstName: userData!.firstName,
        lastName: userData!.lastName,
        email: userData!.email,
        role: userData!.role,
      };

      // Generate custom token
      const customToken = await auth.createCustomToken(userRecord.uid);

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
      return {
        id: decodedToken.uid,
        firstName: userData!.firstName,
        lastName: userData!.lastName,
        email: userData!.email,
        role: userData!.role,
      };
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
      return {
        id: uid,
        firstName: userData!.firstName,
        lastName: userData!.lastName,
        email: userData!.email,
        role: userData!.role,
      };
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