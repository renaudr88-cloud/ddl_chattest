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

// Where is the test server?
// - Phone with Expo Go: Expo knows which computer the app came from ("192.168.1.20:8081"); the server runs there on 8080.
// - Browser with `npx expo start` (port 8081): same computer, port 8080.
// - Browser opened from the test server itself or a share link (see README, "Let others test"): same address as the page.
function testBase() {
  if (Platform.OS === 'web') {
    const { protocol, hostname, host, port } = window.location;
    return port === '8081' ? `http://${hostname}:8080` : `${protocol}//${host}`;
  }
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0] || 'localhost';
  return `http://${host}:8080`;
}
const base = testBase();
const TEST = {
  WS_URL: base.replace(/^http/, 'ws') + '/chat',
  LOGIN_URL: base + '/dev-login',
  UPLOAD_URL: base + '/dev-upload',
};

export const { WS_URL, LOGIN_URL, UPLOAD_URL } = TEST_MODE ? TEST : LIVE;
