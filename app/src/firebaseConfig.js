// Paste the config of your Firebase project here:
// Firebase console > Project settings (gear icon) > Your apps > Web app > "SDK setup and configuration" > Config.
// These values are not secret: they only say which project to talk to. Access is controlled by firebase/firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyA3zZCWwLU1NBDWtIdAYqhyOgiXLGOniRM',
  authDomain: 'ddl-chat-858ec.firebaseapp.com',
  projectId: 'ddl-chat-858ec',
  storageBucket: 'ddl-chat-858ec.firebasestorage.app',
  messagingSenderId: '236290089444',
  appId: '1:236290089444:web:b0b9f4b5355911155427f1',
  measurementId: 'G-B54JWTR4KQ',
};

export const FIREBASE_READY = !firebaseConfig.apiKey.includes('PASTE');
