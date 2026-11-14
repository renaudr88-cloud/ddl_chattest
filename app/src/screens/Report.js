// Report a player (or one of their messages) to DDL staff, and block / unblock players.
// Staff see the open reports in Moderation → Reports.
import { useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, TouchableOpacity, ScrollView } from 'react-native';
import { chat, useChat, blockedSet, REPORT_REASONS } from '../chat';
import { Btn, toast, showError, timeLabel, s as ui } from '../components';
import { C, themed } from '../theme';

// target = { user: {id, name}, room?, message? }
export function ReportSheet({ target, onClose }) {
  const st = useChat();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!target) return null;
  const { user, room, message } = target;
  const already = blockedSet(st).has(user.id);
  const send = async () => {
    setBusy(true);
    try {
      await chat.request('report', { user, room, message, reason, note });
      if (alsoBlock && !already) await chat.request('block', { user, on: true });
      toast(alsoBlock && !already ? `Thanks. DDL staff will look at it, and ${user.name} is blocked.` : 'Thanks. DDL staff will look at it.');
      onClose();
    } catch (e) { showError(e); }
    setBusy(false);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>🚩 Report {user.name}</Text>
            {!!message && <Text style={styles.quote} numberOfLines={3}>“{message.text || '📷 Picture'}”</Text>}
            <Text style={{ color: C.muted }}>What is wrong? Only DDL staff see your report. {user.name} does not see who reported.</Text>
            <View style={styles.reasons}>
              {REPORT_REASONS.map(r => (
                <TouchableOpacity key={r} onPress={() => setReason(r)} style={[styles.reason, reason === r && styles.reasonOn]} accessibilityRole="radio" accessibilityState={{ checked: reason === r }}>
                  <Text style={[styles.reasonTxt, reason === r && { color: C.white }]}>{r}</Text>
                </TouchableOpacity>))}
            </View>
            <TextInput style={[ui.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline maxLength={300}
              placeholder="More details (optional)" placeholderTextColor={C.muted} value={note} onChangeText={setNote} />
            {!already && (
              <TouchableOpacity onPress={() => setAlsoBlock(!alsoBlock)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: alsoBlock }}>
                <View style={[styles.box, alsoBlock && styles.boxOn]}>{alsoBlock && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}</View>
                <Text style={{ color: C.fg, flex: 1 }}>Also block {user.name} (you no longer see their messages)</Text>
              </TouchableOpacity>)}
            <Btn kind="pri" title="Send report" disabled={!reason} loading={busy} onPress={send} />
            <Btn title="Cancel" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Block / unblock with one tap (with a second tap to confirm blocking).
export function BlockButton({ user, style, onDone }) {
  const st = useChat();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = blockedSet(st).has(user.id);
  const go = async () => {
    if (!on && !armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    try {
      await chat.request('block', { user, on: !on });
      toast(on ? `${user.name} is unblocked.` : `${user.name} is blocked. You no longer see their messages.`);
      setArmed(false); onDone?.();
    } catch (e) { showError(e); }
    setBusy(false);
  };
  return <Btn kind={on ? 'default' : 'danger'} style={style} loading={busy}
    title={on ? '✅ Unblock' : armed ? 'Tap again to block' : '🚫 Block'} onPress={go} />;
}

// Settings: the players I blocked.
export function BlockedList() {
  const st = useChat();
  const list = st.blockedUsers || [];
  if (!list.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.section}>Blocked players · {list.length}</Text>
      {list.map(u => (
        <View key={u.id} style={styles.row}>
          <Text style={{ color: C.fg, flex: 1, fontWeight: '700' }} numberOfLines={1}>{u.name}</Text>
          <Btn small title="Unblock" onPress={() => chat.request('block', { user: u, on: false }).then(() => toast(`${u.name} is unblocked.`)).catch(showError)} />
        </View>))}
    </View>
  );
}

// Staff: open reports, newest first.
export function ReportsList({ onUser }) {
  const st = useChat();
  const list = st.reports || [];
  const close = (r, status) => chat.request('report.close', { id: r.id, status })
    .then(() => toast(status === 'dismissed' ? 'Report dismissed.' : 'Report marked as handled.')).catch(showError);
  if (!list.length) return <Text style={{ color: C.muted, padding: 16, textAlign: 'center' }}>No open reports. 👍</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
      {list.map(r => (
        <View key={r.id} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={styles.reasonTag}>{r.reason}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>{timeLabel(r.ts)}</Text>
          </View>
          <Text style={{ color: C.fg }}>
            <Text style={{ fontWeight: '800' }} onPress={() => onUser?.({ id: r.targetId, name: r.targetName, role: 'player' })}>{r.targetName}</Text>
            <Text style={{ color: C.muted }}> reported by {r.byName || 'a player'}{r.room ? ' · ' + roomLabel(r.room) : ''}</Text>
          </Text>
          {!!r.text && <Text style={styles.quote} numberOfLines={4}>“{r.text}”</Text>}
          {!!r.note && <Text style={{ color: C.fg, fontSize: 13 }}>Note: {r.note}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small title="Open player" style={{ flex: 1 }} onPress={() => onUser?.({ id: r.targetId, name: r.targetName, role: 'player' })} />
            <Btn small kind="pri" title="Handled" style={{ flex: 1 }} onPress={() => close(r, 'handled')} />
            <Btn small title="Dismiss" style={{ flex: 1 }} onPress={() => close(r, 'dismissed')} />
          </View>
        </View>))}
    </ScrollView>
  );
}
const roomLabel = room => {
  const [k, p] = room.split(':');
  const kind = { general: 'General', tournament: 'Tournament', premier: 'Premier League', raffle: 'Raffles', dm: 'Private chat' }[k] || k;
  return p ? `${kind} (${p[0].toUpperCase() + p.slice(1)})` : kind;
};

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, maxHeight: '90%' },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  quote: { color: C.fg, backgroundColor: C.bg, borderLeftWidth: 3, borderLeftColor: C.orange, padding: 10, borderRadius: 8, fontStyle: 'italic' },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  reasonOn: { backgroundColor: C.orange, borderColor: C.orange },
  reasonTxt: { color: C.fg, fontWeight: '700' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.orange, borderColor: C.orange },
  section: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  card: { backgroundColor: C.panel, borderRadius: 14, padding: 12, gap: 8, borderLeftWidth: 4, borderLeftColor: C.bad },
  reasonTag: { color: C.white, backgroundColor: C.bad, fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
}));
