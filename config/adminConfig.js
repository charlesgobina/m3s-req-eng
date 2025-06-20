// admin config
import fbAdmin from 'firebase-admin';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccount.json');

initializeApp({
    credential: fbAdmin.credential.cert(serviceAccount),
    // credential: applicationDefault(),
    // databaseURL: process.env.DATABASE_URL, // for realtime database
});

const db = fbAdmin.firestore();
const auth = fbAdmin.auth();
// const bucket = fbAdmin.storage().bucket()

export { db, auth, fbAdmin };