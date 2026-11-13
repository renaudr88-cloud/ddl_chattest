import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { C, R, themed } from './theme';

const AV_COLORS = ['#1E6FD9', '#FB5801', '#1E8E5A', '#8B3FD9', '#C2185B', '#00838F', '#6D4C41', '#3949AB'];
const colorFor = id => AV_COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const initials = n => String(n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export function Avatar({ user, size = 36, onPress }) {
  const body = user?.avatar
    ? <Image source={{ uri: user.avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={[s.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(user?.id) }]}>
        <Text style={[s.avTxt, { fontSize: size * 0.4 }]}>{initials(user?.name)}</Text>
      </View>;
  return onPress ? <TouchableOpacity onPress={onPress} accessibilityLabel={user?.name}>{body}</TouchableOpacity> : body;
}

// Platform logo (Dartsmind, Scolia, ...). Without an approved logo: initial on the platform colour.
export function PlatformLogo({ platform, size = 24 }) {
  if (platform.logo) return <Image source={platform.logo} style={{ width: size, height: size, borderRadius: size * 0.22 }} accessibilityIgnoresInvertColors />;
  return <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: platform.color, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.55 }}>{platform.name[0]}</Text>
  </View>;
}

// Chat rooms under the header: General / Tournament / Raffles. Each item: [key, label, badge?]
export function RoomPicker({ rooms, value, onChange }) {
  return (
    <View style={s.rooms} accessibilityRole="tablist">
      {rooms.map(([k, label, badge]) => {
        const on = value === k;
        return (
          <TouchableOpacity key={k} onPress={() => onChange(k)} style={[s.room, on && s.roomOn]}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}>
            <Text style={[s.roomTxt, on && { color: C.white }]}>{label}</Text>
            {!!badge && <View style={s.roomBadge}><Text style={s.roomBadgeTxt}>{badge}</Text></View>}
          </TouchableOpacity>);
      })}
    </View>
  );
}

export function Btn({ title, onPress, kind = 'default', small, disabled, loading, style }) {
  const k = { pri: s.pri, danger: s.danger, ghost: s.ghost, default: s.def }[kind];
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} style={[s.btn, k, small && s.small, (disabled || loading) && { opacity: 0.45 }, style]}>
      {loading ? <ActivityIndicator color={C.white} /> :
        <Text style={[s.btnTxt, small && { fontSize: 13 }, kind === 'danger' && { color: C.bad }, (kind === 'default' || kind === 'ghost') && { color: C.fg }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Chip({ label, color, solid }) {
  return <View style={[s.chip, solid && { backgroundColor: color || C.navy2, borderColor: 'transparent' }]}>
    <Text style={[s.chipTxt, solid && { color: C.white, fontWeight: '700', letterSpacing: 0.8 }]}>{solid ? label.toUpperCase() : label}</Text>
  </View>;
}

export function Header({ title, subtitle, onBack, right }) {
  return (
    <View style={s.header}>
      {onBack && <TouchableOpacity onPress={onBack} style={s.back} accessibilityLabel="Back"><Text style={s.backTxt}>‹</Text></TouchableOpacity>}
      <View style={{ flex: 1 }}>
        <Text style={s.hTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={s.hSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export const Notice = ({ text, tone = 'warn' }) =>
  <View style={[s.notice, { borderColor: tone === 'bad' ? C.bad : C.warn }]}><Text style={s.noticeTxt}>{text}</Text></View>;

export const Empty = ({ text }) => <Text style={s.empty}>{text}</Text>;

export const RoleTag = ({ user }) => user?.role === 'admin' ? <Text style={s.role}>STAFF</Text> : null;

export function Segmented({ options, value, onChange }) {
  return <View style={s.seg}>{options.map(([k, l]) =>
    <TouchableOpacity key={k} onPress={() => onChange(k)} style={[s.segBtn, value === k && s.segOn]}>
      <Text style={[s.segTxt, value === k && { color: C.white }]}>{l}</Text>
    </TouchableOpacity>)}</View>;
}

// Big format picker (FT3 / FT5 / Other, Sell / Swap / Wanted)
export function Pick({ options, value, onChange }) {
  return <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{options.map(o =>
    <TouchableOpacity key={o} onPress={() => onChange(o)} style={[s.pick, value === o && s.pickOn]}>
      <Text style={[s.pickTxt, value === o && { color: C.orangeSoft }]}>{o}</Text>
    </TouchableOpacity>)}</View>;
}

export function Lightbox({ uri, onClose }) {
  return <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={s.lightbox} onPress={onClose}>
      {uri && <Image source={{ uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
    </Pressable>
  </Modal>;
}

// Two-tap confirm for destructive actions (no system dialogs needed)
export function ConfirmBtn({ title, confirmTitle, onConfirm, small }) {
  const [armed, setArmed] = useState(false);
  return <Btn small={small} kind={armed ? 'pri' : 'danger'} title={armed ? confirmTitle : title}
    style={armed && { backgroundColor: C.bad, borderColor: C.bad }}
    onPress={() => armed ? (setArmed(false), onConfirm()) : (setArmed(true), setTimeout(() => setArmed(false), 4000))} />;
}

// Global toast: call toast('Saved') from anywhere; <ToastHost/> is mounted once in App.js
let showToast = null;
export const toast = (msg, bad) => showToast?.(msg, bad);
export function ToastHost() {
  const [t, setT] = useState(null);
  const timer = useRef();
  useEffect(() => { showToast = (msg, bad) => { clearTimeout(timer.current); setT({ msg, bad }); timer.current = setTimeout(() => setT(null), 3200); }; return () => { showToast = null; }; }, []);
  if (!t) return null;
  return <View pointerEvents="none" style={[s.toast, t.bad && { backgroundColor: C.bad }]}><Text style={{ color: C.white, fontSize: 14 }}>{t.msg}</Text></View>;
}
// Turn a server error into a toast
export const showError = e => toast(e?.message || 'Something went wrong. Try again.', true);

export function timeLabel(ts) {
  const d = new Date(ts), today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return today ? hm : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm;
}
export const clock = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const s = themed(C => ({
  av: { alignItems: 'center', justifyContent: 'center' },
  avTxt: { color: C.white, fontWeight: '800' },
  btn: { borderRadius: R.sm + 2, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  small: { paddingVertical: 7, paddingHorizontal: 12 },
  def: { backgroundColor: C.panel, borderColor: C.line },
  pri: { backgroundColor: C.orange, borderColor: C.orange },
  danger: { backgroundColor: 'transparent', borderColor: C.line },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  btnTxt: { color: C.white, fontWeight: '700', fontSize: 15 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  chipTxt: { color: C.muted, fontSize: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.navy, borderBottomWidth: 3, borderBottomColor: C.orange },
  back: { paddingRight: 6 },
  backTxt: { color: C.white, fontSize: 34, lineHeight: 34, fontWeight: '300' },
  hTitle: { color: C.white, fontSize: 21, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  hSub: { color: C.barMuted, fontSize: 12, marginTop: 2 },
  notice: { borderWidth: 1, borderRadius: R.sm, padding: 10, backgroundColor: C.noticeBg, marginBottom: 8 },
  noticeTxt: { color: C.fg, fontSize: 13 },
  empty: { color: C.muted, textAlign: 'center', padding: 40 },
  role: { color: C.white, backgroundColor: C.orange, fontSize: 9, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: C.line, borderRadius: R.sm + 2, overflow: 'hidden', alignSelf: 'flex-start' },
  segBtn: { paddingVertical: 7, paddingHorizontal: 12, backgroundColor: C.panel },
  segOn: { backgroundColor: C.navy2 },
  segTxt: { color: C.muted, fontWeight: '700', fontSize: 13 },
  pick: { borderWidth: 2, borderColor: C.line, borderRadius: R.sm + 2, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: C.bg },
  pickOn: { borderColor: C.orange, backgroundColor: 'rgba(251,88,1,0.12)' },
  pickTxt: { color: C.fg, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 14, gap: 10 },
  input: { backgroundColor: C.bg, color: C.fg, borderWidth: 1, borderColor: C.line, borderRadius: R.sm + 2, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  label: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
  section: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 110, backgroundColor: C.navy2, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line, zIndex: 99, elevation: 10 },
  rooms: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.navy, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  room: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)' },
  roomOn: { backgroundColor: C.orange },
  roomTxt: { color: C.barMuted, fontWeight: '800', fontSize: 13 },
  roomBadge: { backgroundColor: C.white, borderRadius: 8, minWidth: 16, paddingHorizontal: 4, alignItems: 'center' },
  roomBadgeTxt: { color: C.navy, fontSize: 10, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
}));
