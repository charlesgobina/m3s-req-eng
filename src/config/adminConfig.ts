// adminConfig.ts
import fbAdmin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');

initializeApp({
    credential: fbAdmin.credential.cert(serviceAccount),
});

const db: Firestore = fbAdmin.firestore();
const auth: Auth = fbAdmin.auth();

export { db, auth, fbAdmin };