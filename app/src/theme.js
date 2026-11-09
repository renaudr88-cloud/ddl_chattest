// DDL brand colours (from the crest: navy #011E51, orange #FB5801) in two app backgrounds:
// "navy" (default) and "white". The player picks one in Settings; the choice is saved on the phone.
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BRAND = {
  navy: '#011E51',      // header and tab bar stay navy in both themes
  navy2: '#0A2B66',
  orange: '#FB5801',
  white: '#FFFFFF',
  barMuted: '#93A3C2',  // secondary text on the navy bars
  ok: '#1E8E5A',
  warn: '#C98A1E',
  bad: '#E05252',
};

export const PALETTES = {
  navy: {
    ...BRAND,
    orangeSoft: '#FF8A45',
    bg: '#061331',
    panel: '#0C1A3D',
    line: '#1D2E56',
    fg: '#EEF2FA',
    muted: '#93A3C2',
    bubble: '#14264D',
    mine: '#4A2410',
    noticeBg: 'rgba(201,138,30,0.12)',
  },
  white: {
    ...BRAND,
    orangeSoft: '#D24800',
    bg: '#F4F6FA',
    panel: '#FFFFFF',
    line: '#DCE2EC',
    fg: '#0D1A33',
    muted: '#5B6A85',
    bubble: '#E8EDF5',
    mine: '#FFE3D1',
    bad: '#C53030',
    noticeBg: 'rgba(201,138,30,0.14)',
  },
};

export const THEMES = [
  ['navy', 'DDL blue'],
  ['white', 'White'],
];

const KEY = 'ddl-chat-theme';
let current = 'navy';
const listeners = new Set();

export const getTheme = () => current;

export function setTheme(name) {
  if (!PALETTES[name] || name === current) return;
  current = name;
  listeners.forEach(fn => fn(name));
  AsyncStorage.setItem(KEY, name).catch(() => {});
}

export async function loadTheme() {
  try { const v = await AsyncStorage.getItem(KEY); if (PALETTES[v] && v !== current) { current = v; listeners.forEach(fn => fn(v)); } } catch {}
  return current;
}

// Re-renders the calling component when the theme changes.
export function useTheme() {
  const [t, setT] = useState(current);
  useEffect(() => { listeners.add(setT); setT(current); return () => listeners.delete(setT); }, []);
  return t;
}

// C.bg, C.fg … always return the colour of the active theme.
export const C = new Proxy({}, { get: (_, k) => PALETTES[current][k] });

// Like StyleSheet.create, but built per theme: themed(C => ({ box: { backgroundColor: C.panel } }))
export function themed(fn) {
  const cache = {};
  return new Proxy({}, {
    get: (_, k) => {
      if (!cache[current]) cache[current] = StyleSheet.create(fn(PALETTES[current]));
      return cache[current][k];
    },
  });
}

export const R = { sm: 8, md: 12, lg: 16 };
