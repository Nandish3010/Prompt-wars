import * as admin from 'firebase-admin';

/**
 * Initializes Firebase Admin SDK for server-side operations (Firestore/Storage).
 * Uses Application Default Credentials (ADC) — works in Cloud Run automatically.
 */
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    storageBucket: `${process.env.GOOGLE_CLOUD_PROJECT}.appspot.com`,
  });
}

export const db      = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

export const storage = admin.storage().bucket();
export const timestamp = admin.firestore.FieldValue.serverTimestamp;
export { admin };
