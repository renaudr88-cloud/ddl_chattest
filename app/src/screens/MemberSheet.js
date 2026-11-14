// Tap any player: private chat. Staff see every action they can take on that player in one place:
// group chats (Premier League, Raffle), moderation (mute / kick / ban), chat staff, and the website pages.
import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Linking, StyleSheet } from 'react-native';
import { chat, useChat } from '../chat';
import { Avatar, Btn, ConfirmBtn, RoleTag, toast, showError, s as ui } from '../components';
import { statusOf } from './AdminScreen';
import { LOGIN_URL } from '../config';
import { C, themed } from '../theme';

const siteUrl = file => LOGIN_URL.replace('chat-login.php', file);

export default function MemberSheet({ user, onClose, onChat }) {
  const st = useChat();
  const [staff, setStaff] = useState(null);   // is this player chat staff (made by a DDL admin)?
  const [busy, setBusy] = useState('');
  const ddlUser = !!user && String(user.id).startsWith('ddl-');
  const ddlAdmin = !!st.me?.ddlAdmin && !!user && user.id !== st.me?.id && ddlUser;
  useEffect(() => {
    setStaff(null);
    if (ddlAdmin) chat.request('staff.get', { userId: user.id }).then(r => setStaff(r.staff)).catch(() => {});
  }, [user?.id, ddlAdmin]);
  if (!user) return null;
  const member = st.members.find(m => m.id === user.id) || user;
  const s = statusOf(member.sanction);
  const self = user.id === st.me?.id;
  const isStaffMe = st.me?.role === 'admin';
  const canMod = isStaffMe && !self && user.role !== 'admin';
  const siteId = ddlUser ? String(user.id).replace(/^ddl-/, '') : '';

  // Group chats (Dartsmind)
  const inPremier = (st.premier?.members || []).some(m => m.id === user.id);
  const raffle = (st.raffle?.requests || []).find(r => r.id === user.id);
  const raffleIn = raffle?.status === 'approved';

  const run = async (key, fn, done) => {
    setBusy(key);
    try { await fn(); toast(done); } catch (e) { showError(e); }
    setBusy('');
  };

  const mod = async (action, minutes) => {
    try {
      const r = await chat.request('mod', { action, userId: user.id, minutes });
      chat.set(x => ({ members: x.members.map(m => m.id === user.id ? { ...m, sanction: r.sanction } : m) }));
      toast(`${user.name}: ${statusOf(r.sanction).label}`);
      onClose();
    } catch (e) { showError(e); }
  };

  const setRole = async on => {
    try {
      await chat.request('staff.set', { user: { id: user.id, name: user.name }, on });
      toast(on ? `${user.name} is now chat staff.` : `${user.name} is no longer chat staff.`);
      onClose();
    } catch (e) { showError(e); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            <View style={ui.row}>
              <Avatar user={user} size={48} />
              <View style={{ flex: 1 }}>
                <View style={ui.row}><Text style={styles.name}>{user.name}</Text><RoleTag user={user} /></View>
                <Text style={{ color: C.muted }}>{user.role === 'admin' ? 'DDL staff' : 'Player'}{member.sanction ? ' · ' + s.label : ''}</Text>
              </View>
            </View>
            {!self && <Btn kind="pri" title="Private chat" onPress={() => onChat(user)} />}

            {isStaffMe && !self && <>
              <Text style={styles.section}>Group chats · Dartsmind</Text>
              <View style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineTitle}>🏅 Premier League</Text>
                  <Text style={styles.lineSub}>{user.role === 'admin' ? 'Staff can always see it' : inPremier ? 'In the chat' : 'Not in the chat'}</Text>
                </View>
                {user.role !== 'admin' && (inPremier
                  ? <Btn small kind="danger" title="Remove" loading={busy === 'prem'}
                      onPress={() => run('prem', () => chat.request('premier.remove', { user: { id: user.id, name: user.name } }), `${user.name} removed from the Premier League chat.`)} />
                  : <Btn small kind="pri" title="Add" loading={busy === 'prem'}
                      onPress={() => run('prem', () => chat.request('premier.add', { user: { id: user.id, name: user.name } }), `${user.name} added to the Premier League chat.`)} />)}
              </View>
              <View style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineTitle}>🎟️ Raffles</Text>
                  <Text style={styles.lineSub}>{user.role === 'admin' ? 'Staff can always see it'
                    : raffleIn ? 'Has access' : raffle?.status === 'pending' ? 'Asked for access' : 'No access'}</Text>
                </View>
                {user.role !== 'admin' && (raffleIn
                  ? <Btn small kind="danger" title="Remove" loading={busy === 'raf'}
                      onPress={() => run('raf', () => chat.request('raffle.decide', { uid: user.id, status: 'removed' }), `${user.name} no longer has raffle access.`)} />
                  : <Btn small kind="pri" title={raffle?.status === 'pending' ? 'Approve' : 'Give access'} loading={busy === 'raf'}
                      onPress={() => run('raf', () => chat.request('raffle.grant', { user: { id: user.id, name: user.name } }), `${user.name} has raffle access.`)} />)}
              </View>
            </>}

            {canMod && <>
              <Text style={styles.section}>Moderation · all chats</Text>
              <View style={styles.grid}>
                {s.k === 'muted' ? <Btn small title="Unmute" onPress={() => mod('unmute')} style={styles.cell} /> : <>
                  <Btn small title="Mute 10 min" onPress={() => mod('mute', 10)} style={styles.cell} />
                  <Btn small title="Mute 1 hour" onPress={() => mod('mute', 60)} style={styles.cell} />
                  <Btn small title="Mute 24 h" onPress={() => mod('mute', 1440)} style={styles.cell} /></>}
                {s.k === 'kicked' ? <Btn small title="Let back in" onPress={() => mod('unkick')} style={styles.cell} />
                  : <Btn small title="Kick (30 min)" onPress={() => mod('kick', 30)} style={styles.cell} />}
                {s.k === 'banned' ? <Btn small title="Unban" onPress={() => mod('unban')} style={styles.cell} />
                  : <View style={styles.cell}><ConfirmBtn small title="Ban" confirmTitle="Tap again to ban" onConfirm={() => mod('ban')} /></View>}
              </View>
              <Text style={{ color: C.muted, fontSize: 12 }}>Mute: can read, can't post. Kick: removed for 30 minutes. Ban: removed until unbanned.</Text>
            </>}

            {ddlAdmin && staff !== null && <>
              <Text style={styles.section}>Chat staff</Text>
              {staff
                ? <ConfirmBtn title="Remove chat staff" confirmTitle={`Tap again: ${user.name} is no longer staff`} onConfirm={() => setRole(false)} />
                : user.role !== 'admin'
                  ? <ConfirmBtn title="Make chat staff" confirmTitle={`Tap again: make ${user.name} staff`} onConfirm={() => setRole(true)} />
                  : <Text style={styles.lineSub}>Admin on the DDL website: always staff in the chat.</Text>}
            </>}

            {isStaffMe && siteId !== '' && <>
              <Text style={styles.section}>DDL website</Text>
              <View style={styles.grid}>
                <Btn small title="Player profile ↗" style={styles.cell} onPress={() => Linking.openURL(siteUrl('player-card.php?id=' + siteId))} />
                {st.me?.ddlAdmin && <Btn small title="Edit player ↗" style={styles.cell} onPress={() => Linking.openURL(siteUrl('edit-player.php?id=' + siteId))} />}
              </View>
            </>}

            <Btn title="Close" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, maxHeight: '88%' },
  name: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  section: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 12, padding: 12 },
  lineTitle: { color: C.fg, fontSize: 15, fontWeight: '800' },
  lineSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexBasis: '47%', flexGrow: 1 },
}));
