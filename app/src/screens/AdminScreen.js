// Staff only: member list with live status, and the moderation log.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { chat, useChat } from '../chat';
import { Avatar, Header, Chip, Segmented, Empty, RoleTag, timeLabel, clock, showError, s as ui } from '../components';
import { C, themed } from '../theme';

export function statusOf(s) {
  const t = Date.now();
  if (!s) return { k: 'ok', label: 'Active', color: C.ok };
  if (s.banned) return { k: 'banned', label: 'Banned', color: C.bad };
  if (s.kicked_until > t) return { k: 'kicked', label: 'Kicked till ' + clock(s.kicked_until), color: C.warn };
  if (s.muted_until > t) return { k: 'muted', label: 'Muted till ' + clock(s.muted_until), color: C.warn };
  return { k: 'ok', label: 'Active', color: C.ok };
}

const ACTION = { mute: 'muted', unmute: 'unmuted', kick: 'kicked', unkick: 'let back in', ban: 'banned', unban: 'unbanned', delete: 'deleted a message from', swap_delete: 'deleted a listing from' };

export default function AdminScreen({ onBack, onUser }) {
  const st = useChat();
  const [tab, setTab] = useState('members');
  const [q, setQ] = useState('');

  useEffect(() => {
    chat.request('admin.members').then(r => chat.set({ members: r.list, log: r.log })).catch(showError);
  }, [st.status]);

  const members = st.members.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Moderation" subtitle={`${st.online} online now`} onBack={onBack} />
      <View style={{ padding: 14, gap: 10 }}>
        <Segmented options={[['members', 'Members'], ['log', 'Log']]} value={tab} onChange={setTab} />
        {tab === 'members' && <TextInput style={ui.input} placeholder="Search members" placeholderTextColor={C.muted} value={q} onChangeText={setQ} />}
      </View>
      {tab === 'members' ? (
        <FlatList data={members} keyExtractor={m => m.id} ListEmptyComponent={<Empty text="No members yet." />}
          renderItem={({ item: m }) => {
            const s = statusOf(m.sanction);
            return (
              <TouchableOpacity style={styles.row} onPress={() => onUser(m)}>
                <Avatar user={m} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text style={styles.name}>{m.name}</Text><RoleTag user={m} /></View>
                  <Text style={styles.sub}>{m.online ? 'Online' : 'Last seen ' + timeLabel(m.lastSeen)}</Text>
                </View>
                <Chip solid label={s.label} color={s.color} />
              </TouchableOpacity>);
          }} />
      ) : (
        <FlatList data={st.log} keyExtractor={l => String(l.id)} contentContainerStyle={{ paddingHorizontal: 16 }}
          ListEmptyComponent={<Empty text="No moderation actions yet." />}
          renderItem={({ item: l }) => (
            <Text style={styles.log}><Text style={{ color: C.muted }}>{timeLabel(l.ts)} · </Text>
              <Text style={{ fontWeight: '700' }}>{l.admin.name}</Text> {ACTION[l.action] || l.action} <Text style={{ fontWeight: '700' }}>{l.target?.name || ''}</Text>
              {l.detail ? <Text style={{ color: C.muted }}> ({l.detail})</Text> : null}</Text>)} />
      )}
    </View>
  );
}

const styles = themed(C => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { color: C.fg, fontSize: 15, fontWeight: '600' },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  log: { color: C.fg, fontSize: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
}));
