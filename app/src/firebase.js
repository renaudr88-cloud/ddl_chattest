// Firebase connection: Auth (who you are) and Firestore (all chat data, live).
import { Platform } from 'react-native';
import { initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseConfig, FIREBASE_READY } from './firebaseConfig';

export { FIREBASE_READY };
export const app = FIREBASE_READY ? initializeApp(firebaseConfig) : null;

// Stay logged in after closing the app: on phones the login is kept in AsyncStorage, in the browser by Firebase itself.
export const auth = !app ? null : Platform.OS === 'web'
  ? FirebaseAuth.getAuth(app)
  : FirebaseAuth.initializeAuth(app, { persistence: FirebaseAuth.getReactNativePersistence(AsyncStorage) });

// Long polling works on every network (some mobile networks and Expo Go block the default stream).
export const db = !app ? null : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
