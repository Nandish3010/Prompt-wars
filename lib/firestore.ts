/**
 * Client-side Firestore operations for reading incident history.
 *
 * The server (route.ts) writes via Firebase Admin SDK.
 * This module reads via the client Firebase SDK — two distinct SDK usages.
 *
 * Google service: Firebase Firestore (client-side reads)
 */
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { firebaseApp }   from './firebase';
import { DispatchReport } from '@/shared/dispatch';

const db = getFirestore(firebaseApp);

/**
 * Returns the 5 most recent dispatch reports from Firestore, newest first.
 * @returns array of up to 5 DispatchReport objects
 */
export async function getRecentDispatches(): Promise<DispatchReport[]> {
  const q    = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(5));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as DispatchReport);
}
