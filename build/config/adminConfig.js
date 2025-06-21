// adminConfig.ts
import fbAdmin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
initializeApp({
    credential: fbAdmin.credential.cert(serviceAccount),
});
const db = fbAdmin.firestore();
const auth = fbAdmin.auth();
export { db, auth, fbAdmin };
