// Private chats list + start a new one.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { chat, useChat } from '../chat';
import { Avatar, Header, Empty, RoleTag, Btn, timeLabel, s as ui, showError } from '../components';
import { C, themed } from '../theme';

export default function MessagesScreen({ onOpen }) {
  const st = useChat();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(() => chat.request('users.search', { q }).then(r => setResults(r.list)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, searching]);

  const openUser = async u => {
    try { const r = await chat.requestHere('dm.open', { userId: u.id }); setSearching(false); setQ(''); onOpen(r.room, r.other); }
    catch (e) { showError(e); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Messages" subtitle="Private chats between players"
        right={<Btn small kind={searching ? 'default' : 'pri'} title={searching ? 'Cancel' : '+ New'} onPress={() => setSearching(!searching)} />} />
      {searching ? (
        <View style={{ flex: 1, padding: 14 }}>
          <TextInput style={ui.input} placeholder="Search players" placeholderTextColor={C.muted} value={q} onChangeText={setQ} autoFocus autoCapitalize="none" />
          <FlatList data={results} keyExtractor={u => u.id} style={{ marginTop: 10 }}
            ListEmptyComponent={<Empty text={q ? 'No players found.' : 'Players appear here once they have opened the chat.'} />}
            renderItem={({ item: u }) => (
              <TouchableOpacity style={styles.row} onPress={() => openUser(u)}>
                <Avatar user={u} />
                <Text style={styles.name}>{u.name}</Text><RoleTag user={u} />
                {u.online && <View style={styles.dot} />}
              </TouchableOpacity>)} />
        </View>
      ) : (
        <FlatList data={st.dms.filter(d => d.platform === st.platform)} keyExtractor={d => d.room}
          ListEmptyComponent={<Empty text="No private chats yet. Tap + New, or tap a player's name in General." />}
          renderItem={({ item: d }) => {
            const unread = chat.unread(d);
            return (
              <TouchableOpacity style={styles.row} onPress={() => onOpen(d.room, d.other)}>
                <Avatar user={d.other} size={44} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.name, unread && { fontWeight: '800' }]}>{d.other.name}</Text><RoleTag user={d.other} />
                  </View>
                  <Text style={styles.sub}>{timeLabel(d.lastAt)}</Text>
                </View>
                {unread ? <View style={styles.badge}><Text style={styles.badgeTxt}>new</Text></View> : null}
              </TouchableOpacity>);
          }} />
      )}
    </View>
  );
}

const styles = themed(C => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { color: C.fg, fontSize: 16, fontWeight: '600' },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.ok, marginLeft: 'auto' },
  badge: { backgroundColor: C.orange, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTxt: { color: C.white, fontSize: 11, fontWeight: '800' },
}));
