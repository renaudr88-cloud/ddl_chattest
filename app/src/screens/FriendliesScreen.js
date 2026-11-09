// "Looking for a friendly": one simple card per player (FT3 / FT5 / Other). Others tap Accept → private chat opens.
import { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { chat, useChat, isMuted } from '../chat';
import { hasBad } from '../filter';
import { Avatar, Header, Btn, Chip, Pick, Empty, Notice, timeLabel, toast, showError, s as ui } from '../components';
import { C } from '../theme';

export default function FriendliesScreen({ onOpenDM, onUser }) {
  const st = useChat();
  const [format, setFormat] = useState('FT3');
  const [custom, setCustom] = useState('');
  const [game, setGame] = useState('501');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const muted = isMuted(st.me);
  const admin = st.me?.role === 'admin';
  const open = st.friendlies.filter(f => f.status === 'open');
  const matched = st.friendlies.filter(f => f.status === 'matched');
  const mineOpen = open.find(f => f.user.id === st.me?.id);

  const post = async () => {
    if (format === 'Other' && !custom.trim()) return toast('Describe the format, for example "Best of 7 sets".', true);
    if (hasBad(custom + ' ' + note)) return toast('Blocked: that contains a word that is not allowed.', true);
    setBusy(true);
    try { await chat.request('friendly.post', { format, custom, game, note }); setNote(''); setCustom(''); toast('You are now looking for a friendly.'); }
    catch (e) { showError(e); }
    setBusy(false);
  };
  const accept = async f => {
    try { const r = await chat.request('friendly.accept', { id: f.id }); toast(`Friendly accepted. Chat with ${r.other.name} is open.`); onOpenDM(r.room, r.other); }
    catch (e) { showError(e); }
  };
  const cancel = f => chat.request('friendly.cancel', { id: f.id }).catch(showError);

  const card = f => {
    const mine = f.user.id === st.me?.id;
    return (
      <View key={f.id} style={[ui.card, f.status !== 'open' && { opacity: 0.55 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: C.orangeSoft, fontSize: 34, fontWeight: '900' }}>{f.format === 'Other' ? f.custom : f.format}</Text>
          <Chip solid label={f.status === 'open' ? 'Open' : 'Matched'} color={f.status === 'open' ? C.ok : C.navy2} />
        </View>
        <View style={ui.row}><Chip label={f.game} />{f.matchedWith && <Chip label={'vs ' + f.matchedWith.name} />}</View>
        {!!f.note && <Text style={{ color: C.muted }}>{f.note}</Text>}
        <View style={ui.row}><Avatar user={f.user} onPress={() => onUser(f.user)} />
          <View><Text style={{ color: C.fg, fontWeight: '700' }}>{f.user.name}</Text><Text style={{ color: C.muted, fontSize: 12 }}>{timeLabel(f.ts)}</Text></View></View>
        {f.status === 'open' && <View style={ui.row}>
          {mine ? <Btn small title="Stop looking" onPress={() => cancel(f)} /> : <>
            <Btn small kind="pri" title="Accept" disabled={muted} onPress={() => accept(f)} />
            <Btn small title="Message" onPress={() => onUser(f.user, true)} /></>}
          {admin && !mine && <Btn small kind="danger" title="Remove" onPress={() => cancel(f)} />}
        </View>}
      </View>);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Friendlies" subtitle={`${open.length} player${open.length === 1 ? '' : 's'} looking for a game`} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={ui.card}>
          <Text style={[ui.section, { marginTop: 0, marginBottom: 0 }]}>{mineOpen ? 'Update your friendly' : 'Looking for a friendly'}</Text>
          <Pick options={['FT3', 'FT5', 'Other']} value={format} onChange={setFormat} />
          {format === 'Other' && <TextInput style={ui.input} placeholder="e.g. Best of 7 sets" placeholderTextColor={C.muted} value={custom} onChangeText={setCustom} maxLength={40} />}
          <Pick options={['501', '301', 'Cricket']} value={game} onChange={setGame} />
          <TextInput style={ui.input} placeholder="Note (optional): platform, time…" placeholderTextColor={C.muted} value={note} onChangeText={setNote} maxLength={120} />
          {muted && <Notice text="You are muted and cannot post right now." />}
          <Btn kind="pri" title={mineOpen ? 'Update' : "I'm looking for a friendly"} loading={busy} disabled={muted} onPress={post} />
        </View>
        {open.length ? open.map(card) : <Empty text="Nobody is looking right now. Be the first." />}
        {!!matched.length && <Text style={ui.section}>Recently matched</Text>}
        {matched.map(card)}
      </ScrollView>
    </View>
  );
}
