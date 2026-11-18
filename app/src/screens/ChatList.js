// The Chat tab's start page (like WhatsApp): every group chat in a list with its last message,
// the time and how many new messages there are. Tap a chat to open it; "Discover chat rooms" finds others.
// The rooms are already followed live by chat.js (General, Tournament, Premier, Raffles, my chat rooms),
// so this list costs no extra database reads.
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useChat, mentionCount, blockedSet } from '../chat';
import { timeLabel, s as ui } from '../components';
import { C, themed } from '../theme';

// entries: [{ key, room, label, icon, sub, badge }]  key = what HomeScreen opens, room = the Firestore room
export default function ChatList({ header, fixed, rooms, invites, onOpen, onDiscover }) {
  const st = useChat();
  const [q, setQ] = useState('');
  const hide = useMemo(() => blockedSet(st), [st.blockedUsers]);
  const ql = q.trim().toLowerCase();
  const match = e => !ql || e.label.toLowerCase().includes(ql);

  const row = e => {
    const list = (st.rooms[e.room] || []).filter(m => !hide.has(m.user.id));
    const last = list[list.length - 1];
    const read = st.read[e.room];
    // New = messages from others after the last one I saw. A room I never opened shows no number.
    const fresh = read ? list.filter(m => m.ts > read && m.user.id !== st.me?.id).length : 0;
    const tags = mentionCount(st, e.room) + (e.badge || 0);
    const preview = !last ? (e.sub || 'No messages yet')
      : `${last.user.id === st.me?.id ? 'You' : last.user.name}: ${last.poll ? '📊 ' + last.poll.q : last.text || '📷 Picture'}`;
    return (
      <TouchableOpacity key={e.key} onPress={() => onOpen(e.key)} style={styles.row} accessibilityRole="button"
        accessibilityLabel={`${e.label}${fresh ? `, ${fresh} new` : ''}`}>
        <View style={styles.icon}><Text style={{ fontSize: 22 }}>{e.icon}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.name} numberOfLines={1}>{e.label}</Text>
            <View style={{ flex: 1 }} />
            {!!last && <Text style={[styles.time, (fresh || tags) && { color: C.orangeSoft }]}>{timeLabel(last.ts)}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.preview, (fresh || tags) && { color: C.fg }]} numberOfLines={1}>{preview}</Text>
            {!!tags && <View style={styles.badge}><Text style={styles.badgeTxt}>@{tags > 1 ? ' ' + tags : ''}</Text></View>}
            {!!fresh && <View style={styles.badge}><Text style={styles.badgeTxt}>{fresh > 99 ? '99+' : fresh}</Text></View>}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const fixedHere = fixed.filter(match);
  const roomsHere = rooms.filter(match);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 14, paddingBottom: 4 }}>
          <TextInput style={ui.input} value={q} onChangeText={setQ} placeholder="🔍  Search chats" placeholderTextColor={C.muted}
            accessibilityLabel="Search chats" autoCorrect={false} />
        </View>
        {fixedHere.length > 0 && <Text style={styles.section}>DDL chats</Text>}
        {fixedHere.map(row)}
        {roomsHere.length > 0 && <Text style={styles.section}>My chat rooms</Text>}
        {roomsHere.map(row)}
        {!fixedHere.length && !roomsHere.length && <Text style={{ color: C.muted, padding: 16 }}>No chat with that name.</Text>}
        <TouchableOpacity onPress={onDiscover} style={styles.discover} accessibilityRole="button">
          <Text style={styles.discoverTxt}>＋ Discover chat rooms</Text>
          {!!invites && <View style={styles.badge}><Text style={styles.badgeTxt}>{invites}</Text></View>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = themed(C => ({
  section: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, minHeight: 64 },
  icon: { width: 46, height: 46, borderRadius: 13, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  name: { color: C.fg, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  time: { color: C.muted, fontSize: 12 },
  preview: { color: C.muted, fontSize: 14, flex: 1 },
  badge: { backgroundColor: C.orange, borderRadius: 11, minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: C.white, fontSize: 12, fontWeight: '900' },
  discover: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, minHeight: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.orange },
  discoverTxt: { color: C.orangeSoft, fontSize: 15, fontWeight: '800' },
}));
