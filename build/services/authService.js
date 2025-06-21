import { auth, db } from '../config/adminConfig.js';
export class AuthService {
    async signup(userData) {
        try {
            // Create user in Firebase Auth
            const userRecord = await auth.createUser({
                email: userData.email,
                password: userData.password,
                displayName: `${userData.firstName} ${userData.lastName}`,
            });
            // Create user document in Firestore
            const user = {
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
        }
        catch (error) {
            throw new Error(`Signup failed: ${error.message}`);
        }
    }
    async login(loginData) {
        try {
            // Get user by email
            const userRecord = await auth.getUserByEmail(loginData.email);
            // Get user data from Firestore
            const userDoc = await db.collection('users').doc(userRecord.uid).get();
            if (!userDoc.exists) {
                throw new Error('User profile not found');
            }
            const userData = userDoc.data();
            const user = {
                id: userRecord.uid,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                role: userData.role,
            };
            // Generate custom token
            const customToken = await auth.createCustomToken(userRecord.uid);
            return { user, customToken };
        }
        catch (error) {
            throw new Error(`Login failed: ${error.message}`);
        }
    }
    async verifyToken(idToken) {
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
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                role: userData.role,
            };
        }
        catch (error) {
            throw new Error(`Token verification failed: ${error.message}`);
        }
    }
    async getUserById(uid) {
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (!userDoc.exists) {
                return null;
            }
            const userData = userDoc.data();
            return {
                id: uid,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                role: userData.role,
            };
        }
        catch (error) {
            throw new Error(`Failed to get user: ${error.message}`);
        }
    }
    async updateUserProfile(uid, updateData) {
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
        }
        catch (error) {
            throw new Error(`Failed to update user profile: ${error.message}`);
        }
    }
    async deleteUser(uid) {
        try {
            // Delete from Firebase Auth
            await auth.deleteUser(uid);
            // Delete from Firestore
            await db.collection('users').doc(uid).delete();
        }
        catch (error) {
            throw new Error(`Failed to delete user: ${error.message}`);
        }
    }
}
