// Staff only: member list with live status, and the moderation log.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { chat, useChat } from '../chat';
import { Avatar, Header, Chip, Segmented, Empty, RoleTag, timeLabel, clock, showError, s as ui } from '../components';
import { C, themed } from '../theme';
import { ReportsList } from './Report';

export function statusOf(s) {
  const t = Date.now();
  if (!s) return { k: 'ok', label: 'Active', color: C.ok };
  if (s.banned) return { k: 'banned', label: 'Banned', color: C.bad };
  if (s.kicked_until > t) return { k: 'kicked', label: 'Kicked till ' + clock(s.kicked_until), color: C.warn };
  if (s.muted_until > t) return { k: 'muted', label: 'Muted till ' + clock(s.muted_until), color: C.warn };
  return { k: 'ok', label: 'Active', color: C.ok };
}

const ACTION = { mute: 'muted', unmute: 'unmuted', kick: 'kicked', unkick: 'let back in', ban: 'banned', unban: 'unbanned', delete: 'deleted a message from', swap_delete: 'deleted a listing from', friendly_delete: 'removed a friendly from', staff_add: 'made chat staff:', premier_add: 'put in the Premier League chat:', premier_remove: 'took out of the Premier League chat:', staff_remove: 'removed chat staff:', pin: 'pinned a message from', room_close: 'closed a chat', room_open: 'opened a chat again',
  raffle_approved: 'let into the raffle chat:', raffle_declined: 'declined raffle access for', raffle_removed: 'removed from the raffle chat:' };

export default function AdminScreen({ onBack, onUser, startTab }) {
  const st = useChat();
  const [tab, setTab] = useState(startTab || 'stats');
  const nReports = (st.reports || []).length;
  const [q, setQ] = useState('');

  useEffect(() => {
    chat.request('admin.members').then(r => chat.set({ members: r.list, log: r.log })).catch(showError);
  }, [st.status]);

  const members = st.members.filter(m => !q || m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Moderation" subtitle={`${st.online} online now`} onBack={onBack} />
      <View style={{ padding: 14, gap: 10 }}>
        <Segmented options={[['stats', 'Stats'], ['members', 'Members'], ['reports', nReports ? `Reports (${nReports})` : 'Reports'], ['log', 'Log']]} value={tab} onChange={setTab} />
        {tab === 'members' && <>
          <TextInput style={ui.input} placeholder="Search members" placeholderTextColor={C.muted} value={q} onChangeText={setQ} />
          <Text style={{ color: C.muted, fontSize: 12 }}>Tap a player to mute, kick or ban. Delete a message: tap Delete next to it in the chat, or hold the message → 🗑 Delete.</Text>
        </>}
      </View>
      {tab === 'stats' ? <Stats /> : tab === 'reports' ? <ReportsList onUser={onUser} /> : tab === 'members' ? (
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

// How many people use the chat. Counted live from the chat accounts (everyone who logged in at least once).
function Stats() {
  const [n, setN] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); chat.request('admin.stats').then(setN).catch(showError).finally(() => setBusy(false)); };
  useEffect(load, []);
  if (!n) return <Text style={{ color: C.muted, textAlign: 'center', padding: 20 }}>{busy ? 'Counting…' : 'No numbers.'}</Text>;
  const v = x => (x == null ? '–' : x.toLocaleString());
  const pct = x => (x == null || !n.total ? '' : Math.round((x / n.total) * 100) + '% of all');
  const Tile = ({ value, label, sub, big }) => (
    <View style={[styles.tile, big && styles.tileBig]}>
      <Text style={[styles.tileVal, big && { fontSize: 40 }]}>{v(value)}</Text>
      <Text style={[styles.tileLbl, big && { color: C.white }]}>{label}</Text>
      {!!sub && <Text style={[styles.tileSub, big && { color: C.barMuted }]}>{sub}</Text>}
    </View>);
  const dev = n.devices || {};
  const devTotal = (dev.ios || 0) + (dev.android || 0) + (dev.desktop || 0);
  const Bar = ({ label, value, color }) => (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: C.fg, fontWeight: '700' }}>{label}</Text><Text style={{ color: C.muted }}>{v(value)}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${devTotal ? Math.round(((value || 0) / devTotal) * 100) : 0}%`, backgroundColor: color }]} /></View>
    </View>);
  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 }}>
      <View style={styles.tiles}>
        <Tile big value={n.total} label="Players in the chat" sub="logged in at least once" />
        <Tile big value={n.online} label="Online now" sub="last 5 minutes" />
      </View>
      <Text style={ui.section}>Active</Text>
      <View style={styles.tiles}>
        <Tile value={n.today} label="Today" sub={pct(n.today)} />
        <Tile value={n.week} label="This week" sub={pct(n.week)} />
        <Tile value={n.month} label="This month" sub={pct(n.month)} />
      </View>
      <Text style={ui.section}>App</Text>
      <View style={styles.tiles}>
        <Tile value={n.installed} label="📲 Installed" sub="on home screen / desktop" />
        <Tile value={n.push} label="🔔 Notifications on" sub="get DDL reminders" />
      </View>
      <Text style={ui.section}>Devices</Text>
      <View style={[styles.tile, { alignItems: 'stretch', gap: 10 }]}>
        <Bar label="📱 iPhone / iPad" value={dev.ios} color="#8fb3ff" />
        <Bar label="🤖 Android" value={dev.android} color="#3ddc84" />
        <Bar label="💻 Computer" value={dev.desktop} color={C.orange} />
      </View>
      <Text style={{ color: C.muted, fontSize: 12 }}>Installed, notifications and devices are known from this update on: players are counted the next time they open the chat.</Text>
      <TouchableOpacity onPress={load} style={{ alignSelf: 'center', padding: 8 }}><Text style={{ color: C.orangeSoft, fontWeight: '800' }}>{busy ? 'Counting…' : '↻ Refresh'}</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = themed(C => ({
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: C.panel, borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  tileBig: { paddingVertical: 16, backgroundColor: C.navy2, borderColor: C.navy2 },
  tileVal: { color: C.orange, fontSize: 28, fontWeight: '900' },
  tileLbl: { color: C.fg, fontWeight: '800', fontSize: 13, textAlign: 'center', marginTop: 2 },
  tileSub: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 2 },
  track: { height: 10, borderRadius: 5, backgroundColor: C.bg, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { color: C.fg, fontSize: 15, fontWeight: '600' },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  log: { color: C.fg, fontSize: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
}));
