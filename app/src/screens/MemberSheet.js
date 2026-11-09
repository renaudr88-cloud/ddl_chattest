// Tap any player: private chat, and for staff: mute / kick / ban.
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { chat, useChat } from '../chat';
import { Avatar, Btn, ConfirmBtn, RoleTag, toast, showError, s as ui } from '../components';
import { statusOf } from './AdminScreen';
import { C, themed } from '../theme';

export default function MemberSheet({ user, onClose, onChat }) {
  const st = useChat();
  if (!user) return null;
  const member = st.members.find(m => m.id === user.id) || user;
  const s = statusOf(member.sanction);
  const self = user.id === st.me?.id;
  const canMod = st.me?.role === 'admin' && !self && user.role !== 'admin';

  const mod = async (action, minutes) => {
    try {
      const r = await chat.request('mod', { action, userId: user.id, minutes });
      chat.set(x => ({ members: x.members.map(m => m.id === user.id ? { ...m, sanction: r.sanction } : m) }));
      toast(`${user.name}: ${statusOf(r.sanction).label}`);
      onClose();
    } catch (e) { showError(e); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={ui.row}>
            <Avatar user={user} size={48} />
            <View>
              <View style={ui.row}><Text style={styles.name}>{user.name}</Text><RoleTag user={user} /></View>
              <Text style={{ color: C.muted }}>{user.role === 'admin' ? 'DDL staff' : 'Player'}{member.sanction ? ' · ' + s.label : ''}</Text>
            </View>
          </View>
          {!self && <Btn kind="pri" title="Private chat" onPress={() => onChat(user)} />}
          {canMod && <>
            <Text style={[ui.section, { marginBottom: 0 }]}>Moderation</Text>
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
          <Btn title="Close" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, gap: 12 },
  name: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexBasis: '47%', flexGrow: 1 },
}));
