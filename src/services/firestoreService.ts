import { db } from '../config/adminConfig.js';
import { LearningTask } from '../types/index.js';

class FirestoreService {
  constructor() {
    console.log('🔥 FirestoreService: Initialized with Firebase Admin SDK');
  }

  // Add a new task
  async addTask(taskId: string, task: LearningTask): Promise<void> {
    try {
      const taskRef = db.collection('tasks').doc(taskId).collection('task').doc('data');
      await taskRef.set({
        ...task,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`Task ${taskId} added successfully to Firestore`);
    } catch (error) {
      console.error('Error adding task to Firestore:', error);
      throw new Error(`Failed to add task: ${error}`);
    }
  }

  // Get a task by ID
  async getTask(taskId: string): Promise<LearningTask | null> {
    try {
      const taskRef = db.collection('tasks').doc(taskId).collection('task').doc('data');
      const taskSnap = await taskRef.get();
      
      if (taskSnap.exists) {
        const data = taskSnap.data();
        if (data) {
          // Remove Firestore metadata before returning
          const { createdAt, updatedAt, ...taskData } = data;
          return taskData as LearningTask;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting task from Firestore:', error);
      throw new Error(`Failed to get task: ${error}`);
    }
  }

  // Update an existing task
  async updateTask(taskId: string, task: Partial<LearningTask>): Promise<void> {
    try {
      const taskRef = db.collection('tasks').doc(taskId).collection('task').doc('data');
      await taskRef.update({
        ...task,
        updatedAt: new Date()
      });
      
      console.log(`Task ${taskId} updated successfully in Firestore`);
    } catch (error) {
      console.error('Error updating task in Firestore:', error);
      throw new Error(`Failed to update task: ${error}`);
    }
  }

  // Delete a task
  async deleteTask(taskId: string): Promise<void> {
    try {
      const taskRef = db.collection('tasks').doc(taskId).collection('task').doc('data');
      await taskRef.delete();
      
      console.log(`Task ${taskId} deleted successfully from Firestore`);
    } catch (error) {
      console.error('Error deleting task from Firestore:', error);
      throw new Error(`Failed to delete task: ${error}`);
    }
  }

  // Check if task exists
  async taskExists(taskId: string): Promise<boolean> {
    try {
      const taskRef = db.collection('tasks').doc(taskId).collection('task').doc('data');
      const taskSnap = await taskRef.get();
      return taskSnap.exists;
    } catch (error) {
      console.error('Error checking task existence:', error);
      return false;
    }
  }
}

export default new FirestoreService();