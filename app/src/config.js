import { Platform } from 'react-native';
import Constants from 'expo-constants';

// TEST_MODE = true: the app talks to the test server on your own computer (`npm run dev` in server/).
//   No database and no PHP needed. Log in with any name and any password.
//   The computer's address is found automatically from Expo, so the phone just needs the same Wi-Fi.
// TEST_MODE = false: the app uses the real DDL servers below.
export const TEST_MODE = true;

const LIVE = {
  WS_URL: 'wss://chat.ddl-online.com/chat',              // the socket Stevey opened (server/server.js)
  LOGIN_URL: 'https://ddl-online.com/chat-login.php',    // php/chat-login.php
  UPLOAD_URL: 'https://ddl-online.com/chat-upload.php',  // php/chat-upload.php
};

// Expo knows which computer the app was loaded from ("192.168.1.20:8081"); the test server runs there on port 8080.
const host = Platform.OS === 'web'
  ? window.location.hostname
  : (Constants.expoConfig?.hostUri || '').split(':')[0] || 'localhost';
const TEST = {
  WS_URL: `ws://${host}:8080/chat`,
  LOGIN_URL: `http://${host}:8080/dev-login`,
  UPLOAD_URL: `http://${host}:8080/dev-upload`,
};

export const { WS_URL, LOGIN_URL, UPLOAD_URL } = TEST_MODE ? TEST : LIVE;
