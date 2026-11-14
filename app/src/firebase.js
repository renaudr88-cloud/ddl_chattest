// Firebase connection: Auth (who you are) and Firestore (all chat data, live).
import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig, FIREBASE_READY } from './firebaseConfig';

export { FIREBASE_READY };
export const app = FIREBASE_READY ? initializeApp(firebaseConfig) : null;

// Stay logged in after closing the app: on phones the login is kept in AsyncStorage, in the browser by Firebase itself.
export const auth = !app ? null : Platform.OS === 'web'
  ? FirebaseAuth.getAuth(app)
  : FirebaseAuth.initializeAuth(app, { persistence: FirebaseAuth.getReactNativePersistence(AsyncStorage) });

// Long polling works on every network (some mobile networks and Expo Go block the default stream).
// In the browser the chat is also kept on the phone itself (IndexedDB): reopening shows the messages at once,
// and only what is new comes from the internet. Without that storage (private window) it simply works online.
function makeDb() {
  const base = { experimentalAutoDetectLongPolling: true };
  if (Platform.OS === 'web') {
    try { return initializeFirestore(app, { ...base, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
    catch {}
  }
  return initializeFirestore(app, base);
}
export const db = !app ? null : makeDb();
