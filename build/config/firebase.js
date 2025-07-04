import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import dotenv from 'dotenv';
dotenv.config();
// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};
// Initialize Firebase app (singleton pattern)
let app;
let db;
export function getFirebaseApp() {
    if (!app) {
        if (getApps().length === 0) {
            app = initializeApp(firebaseConfig);
        }
        else {
            app = getApps()[0];
        }
    }
    return app;
}
export function getFirebaseFirestore() {
    if (!db) {
        db = getFirestore(getFirebaseApp());
    }
    return db;
}
// Validate Firebase configuration
export function validateFirebaseConfig() {
    const requiredVars = [
        'FIREBASE_API_KEY',
        'FIREBASE_AUTH_DOMAIN',
        'FIREBASE_PROJECT_ID',
        'FIREBASE_STORAGE_BUCKET',
        'FIREBASE_MESSAGING_SENDER_ID',
        'FIREBASE_APP_ID'
    ];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        console.error('Missing Firebase configuration variables:', missingVars);
        return false;
    }
    console.log('✅ Firebase configuration validated');
    return true;
}
// Test Firebase connection
export async function testFirebaseConnection() {
    try {
        if (!validateFirebaseConfig()) {
            return false;
        }
        const firestore = getFirebaseFirestore();
        // Try to create a test document reference (doesn't write anything)
        const testRef = firestore.collection('_test').doc('connection');
        console.log('✅ Firebase connection test passed');
        return true;
    }
    catch (error) {
        console.error('❌ Firebase connection test failed:', error);
        return false;
    }
}
