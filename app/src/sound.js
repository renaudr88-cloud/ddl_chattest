// A short "ping" for things meant for you: a private message, an @tag, a notification from the website.
// Web: made with the Web Audio API (no sound file needed). Phone app: the push notifications will bring the sound.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ddl-chat-sound';
let on = true, ctx = null, last = 0;
AsyncStorage.getItem(KEY).then(v => { if (v === '0') on = false; }).catch(() => {});

export const soundOn = () => on;
export function setSound(v) { on = !!v; AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {}); if (on) ping(true); }

export function ping(force) {
  if ((!on && !force) || Platform.OS !== 'web' || typeof window === 'undefined') return;
  const now = Date.now();
  if (!force && now - last < 1500) return;   // a burst of messages = one ping
  last = now;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    for (const [freq, start] of [[880, 0], [1320, 0.11]]) {   // two soft tones, like a dart hitting the board
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(0.25, t + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t + start); o.stop(t + start + 0.25);
    }
  } catch {}
}

// Is the player looking at the app right now? (Web: the tab is visible.)
export const visible = () => Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible';
