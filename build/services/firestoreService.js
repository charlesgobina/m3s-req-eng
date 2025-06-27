import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
dotenv.config();
class FirestoreService {
    db;
    constructor() {
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        };
        const app = initializeApp(firebaseConfig);
        this.db = getFirestore(app);
    }
    // Add a new task
    async addTask(taskId, task) {
        try {
            const taskRef = doc(this.db, 'tasks', taskId, 'task', 'data');
            await setDoc(taskRef, {
                ...task,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log(`Task ${taskId} added successfully to Firestore`);
        }
        catch (error) {
            console.error('Error adding task to Firestore:', error);
            throw new Error(`Failed to add task: ${error}`);
        }
    }
    // Get a task by ID
    async getTask(taskId) {
        try {
            const taskRef = doc(this.db, 'tasks', taskId, 'task', 'data');
            const taskSnap = await getDoc(taskRef);
            if (taskSnap.exists()) {
                const data = taskSnap.data();
                // Remove Firestore metadata before returning
                const { createdAt, updatedAt, ...taskData } = data;
                return taskData;
            }
            else {
                return null;
            }
        }
        catch (error) {
            console.error('Error getting task from Firestore:', error);
            throw new Error(`Failed to get task: ${error}`);
        }
    }
    // Update an existing task
    async updateTask(taskId, task) {
        try {
            const taskRef = doc(this.db, 'tasks', taskId, 'task', 'data');
            await updateDoc(taskRef, {
                ...task,
                updatedAt: new Date()
            });
            console.log(`Task ${taskId} updated successfully in Firestore`);
        }
        catch (error) {
            console.error('Error updating task in Firestore:', error);
            throw new Error(`Failed to update task: ${error}`);
        }
    }
    // Delete a task
    async deleteTask(taskId) {
        try {
            const taskRef = doc(this.db, 'tasks', taskId, 'task', 'data');
            await deleteDoc(taskRef);
            console.log(`Task ${taskId} deleted successfully from Firestore`);
        }
        catch (error) {
            console.error('Error deleting task from Firestore:', error);
            throw new Error(`Failed to delete task: ${error}`);
        }
    }
    // Check if task exists
    async taskExists(taskId) {
        try {
            const taskRef = doc(this.db, 'tasks', taskId, 'task', 'data');
            const taskSnap = await getDoc(taskRef);
            return taskSnap.exists();
        }
        catch (error) {
            console.error('Error checking task existence:', error);
            return false;
        }
    }
}
export default new FirestoreService();
