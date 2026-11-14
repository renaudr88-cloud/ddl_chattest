// Push notifications from the DDL website (web version of the chat).
// The website already sends web push to every subscription in its push_subscriptions table
// (push-functions.php, sendPushToPlayer). Here the chat adds this phone/computer to that same list
// via php/chat-push-subscribe.php, so the website's notifications also arrive from DDL Chat.
// public/sw-push.js shows them and opens the chat when tapped.
import { Platform } from 'react-native';
import { chat } from './chat';

const SW = '/sw-push.js';

export function pushSupported() {
  return Platform.OS === 'web' && typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iPhone/iPad only allow web push once the chat is on the home screen.
export function needsHomeScreen() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return ios && !standalone;
}

async function registration() {
  const reg = await navigator.serviceWorker.register(SW, { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

// Is this device already getting notifications?
export async function pushStatus() {
  if (!pushSupported()) return needsHomeScreen() ? 'homescreen' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

function keyBytes(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function pushOn() {
  if (!pushSupported()) throw new Error(needsHomeScreen()
    ? 'On iPhone: tap Share → "Add to Home Screen", open DDL Chat from there, then turn this on.'
    : 'This browser cannot show notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
  const { publicKey } = await chat.site('chat-push-subscribe.php');
  if (!publicKey) throw new Error('Notifications are not set up on the DDL website yet.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await chat.site('chat-push-subscribe.php', { method: 'POST', body: { subscription: sub.toJSON() } });
}

export async function pushOff() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await chat.site('chat-push-subscribe.php', { method: 'POST', body: { remove: endpoint } }).catch(() => {});
}

// Keep the service worker installed so a subscription keeps working after updates.
export function pushBoot() {
  if (pushSupported()) navigator.serviceWorker.getRegistration('/').then(r => r && r.update()).catch(() => {});
}
