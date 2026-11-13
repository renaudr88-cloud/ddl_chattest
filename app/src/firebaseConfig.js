// Paste the config of your Firebase project here:
// Firebase console > Project settings (gear icon) > Your apps > Web app > "SDK setup and configuration" > Config.
// These values are not secret: they only say which project to talk to. Access is controlled by firebase/firestore.rules.
export const firebaseConfig = {
  apiKey: 'PASTE-HERE',
  authDomain: 'PASTE-HERE.firebaseapp.com',
  projectId: 'PASTE-HERE',
  storageBucket: 'PASTE-HERE.firebasestorage.app',
  messagingSenderId: 'PASTE-HERE',
  appId: 'PASTE-HERE',
};

export const FIREBASE_READY = !firebaseConfig.apiKey.includes('PASTE');
