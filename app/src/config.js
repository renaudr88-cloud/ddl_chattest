// TEST_MODE = true: test version on your Firebase project.
//   Players pick a name (Firebase "Anonymous" sign-in). Staff type the staff code as password
//   (set it in Firestore: collection "config", document "staff", field "code").
// TEST_MODE = false: players log in with their ddl-online.com account (php/chat-login.php),
//   pictures are shrunk by the app and stored in Firestore (no upload server needed).
export const TEST_MODE = true;

const LIVE = {
  LOGIN_URL: 'https://ddl-online.com/chat-login.php',    // php/chat-login.php
  UPLOAD_URL: 'https://ddl-online.com/chat-upload.php',  // php/chat-upload.php
};

export const LOGIN_URL = TEST_MODE ? '' : LIVE.LOGIN_URL;
export const UPLOAD_URL = TEST_MODE ? '' : LIVE.UPLOAD_URL;
