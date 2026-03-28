/**
 * Firebase client-side app initialization.
 *
 * Singleton pattern — prevents re-initialization during Next.js hot reload.
 * All client-side Firebase services (Firestore, Analytics) import from here.
 *
 * Google service: Firebase (client SDK)
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey:        process.env['NEXT_PUBLIC_FIREBASE_API_KEY'],
  authDomain:    process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
  projectId:     process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
  appId:         process.env['NEXT_PUBLIC_FIREBASE_APP_ID'],
  measurementId: process.env['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'],
};

export const firebaseApp: FirebaseApp = getApps().length
  ? getApps()[0]!
  : initializeApp(firebaseConfig);
