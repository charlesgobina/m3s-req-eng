// adminConfig.ts
import fbAdmin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { config } from 'dotenv';

config();

const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set');
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountJson);
} catch (error) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON contains invalid JSON');
}

if (!serviceAccount.project_id) {
    throw new Error('Service account JSON must contain a project_id field');
}

initializeApp({
    credential: fbAdmin.credential.cert(serviceAccount),
});

const db: Firestore = fbAdmin.firestore();
const auth: Auth = fbAdmin.auth();

export { db, auth, fbAdmin };