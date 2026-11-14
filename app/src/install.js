// "Install DDL Chat": the web version can be put on the home screen like an app (public/manifest.json).
// Android and computers (Chrome / Edge) offer an install prompt we can show with one tap;
// iPhone / iPad only allow it by hand from Safari (Share → Add to Home Screen).
import { Platform } from 'react-native';

let deferred = null;           // the browser's install prompt, kept until the player taps "Install"
const listeners = new Set();
const web = Platform.OS === 'web' && typeof window !== 'undefined';

if (web) {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; listeners.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });
}

export const onInstallChange = f => { listeners.add(f); return () => listeners.delete(f); };

// Already opened as an installed app?
export function isInstalled() {
  if (!web) return true;   // the phone apps are installed by definition
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

// 'ios' | 'android' | 'desktop'
export function deviceKind() {
  if (!web) return Platform.OS === 'ios' ? 'ios' : 'android';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// On iPhone only Safari can add to the home screen.
export function iosNotSafari() {
  if (!web) return false;
  const ua = navigator.userAgent || '';
  return deviceKind() === 'ios' && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

export const canPrompt = () => !!deferred;

// Show the browser's own install dialog. Returns true when the player accepted.
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  listeners.forEach(f => f());
  return choice?.outcome === 'accepted';
}
