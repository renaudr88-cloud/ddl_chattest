// Chat extras: polls, the pinned message of a channel, and search in a chat.
import { useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, TouchableOpacity, ScrollView } from 'react-native';
import { chat } from '../chat';
import { hasBad } from '../filter';
import { Btn, toast, showError, s as ui } from '../components';
import { C, themed } from '../theme';

// ---------- polls ----------
export function PollComposer({ visible, room, onClose }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const set = (i, v) => setOpts(o => o.map((x, j) => (j === i ? v : x)));
  const post = async () => {
    const options = opts.map(o => o.trim()).filter(Boolean);
    if (!q.trim()) return toast('Write a question.', true);
    if (options.length < 2) return toast('Give at least 2 answers.', true);
    if (hasBad(q + ' ' + options.join(' '))) return toast('Blocked: a word that is not allowed in the DDL community.', true);
    setBusy(true);
    try { await chat.request('poll.post', { room, q, options }); setQ(''); setOpts(['', '']); onClose(); toast('Poll posted. 📊'); }
    catch (e) { showError(e); }
    setBusy(false);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>📊 New poll</Text>
            <TextInput style={ui.input} placeholder="Question, e.g. Who plays the Friday Cup?" placeholderTextColor={C.muted} value={q} onChangeText={setQ} maxLength={120} />
            {opts.map((o, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput style={[ui.input, { flex: 1 }]} placeholder={`Answer ${i + 1}`} placeholderTextColor={C.muted} value={o} onChangeText={v => set(i, v)} maxLength={50} />
                {opts.length > 2 && <TouchableOpacity onPress={() => setOpts(x => x.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Remove answer"><Text style={{ color: C.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>}
              </View>))}
            {opts.length < 6 && <Btn small title="+ Add an answer" onPress={() => setOpts(x => [...x, ''])} />}
            <Btn kind="pri" title="Post poll" loading={busy} onPress={post} />
            <Btn title="Cancel" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Inside a message: the question, the answers with live bars; tap an answer to vote (tap again to take it back).
export function PollCard({ m, meId, canVote }) {
  const counts = m.poll.options.map(() => 0);
  for (const v of Object.values(m.votes || {})) if (Number.isInteger(v) && counts[v] !== undefined) counts[v]++;
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = m.votes?.[meId];
  const vote = i => canVote && chat.request('poll.vote', { id: m.id, choice: i }).catch(showError);
  return (
    <View style={{ gap: 6, marginTop: 2 }}>
      <Text style={styles.q}>📊 {m.poll.q}</Text>
      {m.poll.options.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        return (
          <TouchableOpacity key={i} onPress={() => vote(i)} style={[styles.opt, mine === i && styles.optMine]} accessibilityRole="button"
            accessibilityLabel={`${o}, ${counts[i]} votes${mine === i ? ', your vote' : ''}`}>
            <View style={[styles.fill, { width: `${pct}%` }, mine === i && { backgroundColor: C.orange + '55' }]} />
            <Text style={styles.optTxt} numberOfLines={2}>{mine === i ? '✓ ' : ''}{o}</Text>
            <Text style={styles.optNum}>{counts[i]}</Text>
          </TouchableOpacity>);
      })}
      <Text style={styles.small}>{total} vote{total === 1 ? '' : 's'}{canVote ? ' · tap to vote' : ''}</Text>
    </View>
  );
}

// ---------- pinned message ----------
export function PinBar({ pin, staff, onClear, onJump }) {
  const [open, setOpen] = useState(false);
  if (!pin) return null;
  return (
    <View style={styles.pin}>
      <TouchableOpacity style={{ flex: 1 }} onPress={() => { setOpen(!open); onJump?.(); }} accessibilityRole="button" accessibilityLabel="Pinned message">
        <Text style={styles.pinHead}>📌 Pinned{pin.name ? ' · ' + pin.name : ''}</Text>
        <Text style={styles.pinTxt} numberOfLines={open ? 12 : 1}>{pin.text}</Text>
      </TouchableOpacity>
      {staff && <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityLabel="Unpin"><Text style={{ color: C.barMuted, fontSize: 16 }}>✕</Text></TouchableOpacity>}
    </View>
  );
}

// ---------- search in this chat ----------
export function SearchBar({ q, setQ, count, onOlder, more, onClose }) {
  return (
    <View style={styles.search}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput style={[ui.input, { flex: 1, paddingVertical: 8 }]} autoFocus placeholder="Search in this chat: words or a name" placeholderTextColor={C.muted}
          value={q} onChangeText={setQ} autoCapitalize="none" />
        <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close search"><Text style={{ color: C.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>
      </View>
      {q.trim().length > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={styles.small}>{count} found{more ? ' in the loaded messages' : ''}</Text>
          {more && <TouchableOpacity onPress={onOlder}><Text style={{ color: C.orangeSoft, fontWeight: '800', fontSize: 13 }}>Search older messages ↓</Text></TouchableOpacity>}
        </View>)}
    </View>
  );
}

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, maxHeight: '90%' },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  q: { color: C.fg, fontWeight: '900', fontSize: 15 },
  opt: { minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  optMine: { borderColor: C.orange },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.line },
  optTxt: { color: C.fg, flex: 1, fontWeight: '700', fontSize: 14, paddingVertical: 8 },
  optNum: { color: C.muted, fontWeight: '800' },
  small: { color: C.muted, fontSize: 12 },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.navy2, borderBottomWidth: 2, borderBottomColor: C.orange },
  pinHead: { color: C.orangeSoft, fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  pinTxt: { color: C.white, fontSize: 14 },
  search: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.line },
}));
