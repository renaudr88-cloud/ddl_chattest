// Raffle chat (Dartsmind only): players ask for access, staff approve or decline.
import { useState } from 'react';
import { View, Text, ScrollView, Modal, Pressable, TouchableOpacity } from 'react-native';
import { chat, useChat } from '../chat';
import { Btn, Header, Empty, timeLabel, toast, showError, s as ui } from '../components';
import { C, themed } from '../theme';

// What a player sees before staff let them in.
export function RaffleGate({ header }) {
  const st = useChat();
  const status = st.raffle?.status;
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    try { await chat.request('raffle.request'); toast('Request sent. A staff member will look at it.'); }
    catch (e) { showError(e); }
    setBusy(false);
  };
  const text = {
    pending: ['Request sent', 'A DDL staff member will check your request. You can use the other chats in the meantime.'],
    declined: ['Not approved', 'Your request was not approved. Ask in the Help desk if you want to know why, or send a new request.'],
    removed: ['No access anymore', 'Staff removed your access to the raffle chat. You can send a new request.'],
  }[status] || ['Raffles', 'The raffle chat is for approved Dartsmind players. Ask for access and a staff member will let you in.'];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {header}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <Text style={{ fontSize: 46 }}>{status === 'pending' ? '⏳' : '🎟️'}</Text>
        <Text style={{ color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center' }}>{text[0]}</Text>
        <Text style={{ color: C.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>{text[1]}</Text>
        {status !== 'pending' && <Btn kind="pri" title={status ? 'Ask again' : 'Ask for access'} loading={busy} onPress={ask} style={{ alignSelf: 'stretch' }} />}
      </View>
    </View>
  );
}

// Staff: a bar in the raffle chat with the open requests, and a list to approve, decline or remove.
export function RaffleStaffBar() {
  const st = useChat();
  const [open, setOpen] = useState(false);
  const requests = st.raffle?.requests || [];
  const pending = requests.filter(r => r.status === 'pending');
  const approved = requests.filter(r => r.status === 'approved');
  const decide = (uid, status) => chat.request('raffle.decide', { uid, status }).catch(showError);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={[styles.bar, pending.length && styles.barHot]} accessibilityRole="button">
        <Text style={styles.barTxt}>
          {pending.length ? `🎟️ ${pending.length} access request${pending.length === 1 ? '' : 's'} waiting` : `🎟️ Raffle access · ${approved.length} approved`}
        </Text>
        <Text style={styles.barTxt}>Manage ›</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Raffle access</Text>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 8 }}>
              <Text style={[ui.section, { marginTop: 0, marginBottom: 2 }]}>Waiting · {pending.length}</Text>
              {!pending.length && <Text style={{ color: C.muted }}>No open requests.</Text>}
              {pending.map(r => (
                <View key={r.id} style={styles.row}>
                  <View style={{ flex: 1 }}><Text style={styles.name}>{r.name}</Text><Text style={styles.sub}>{timeLabel(r.ts)}</Text></View>
                  <Btn small kind="pri" title="Approve" onPress={() => decide(r.id, 'approved')} />
                  <Btn small kind="danger" title="Decline" onPress={() => decide(r.id, 'declined')} />
                </View>))}
              <Text style={[ui.section, { marginBottom: 2 }]}>Approved · {approved.length}</Text>
              {approved.map(r => (
                <View key={r.id} style={styles.row}>
                  <Text style={[styles.name, { flex: 1 }]}>{r.name}</Text>
                  <Btn small kind="danger" title="Remove" onPress={() => decide(r.id, 'removed')} />
                </View>))}
            </ScrollView>
            <Btn title="Close" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themed(C => ({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.navy2 },
  barHot: { backgroundColor: C.orange },
  barTxt: { color: C.white, fontWeight: '800', fontSize: 13 },
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, gap: 12 },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { color: C.fg, fontWeight: '700', fontSize: 15 },
  sub: { color: C.muted, fontSize: 12 },
}));
