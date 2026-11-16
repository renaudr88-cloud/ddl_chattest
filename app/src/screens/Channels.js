// Chat rooms staff make, next to General / Tournament. Each room has an access setting:
//   open     every player can join with one tap
//   request  players ask to join, staff let them in
//   invite   only players staff invite (they accept the invitation)
// Rules: firebase/firestore.rules (channels/{id}); messages in rooms/ch:<id>/messages, members only.
import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Modal, Pressable, TouchableOpacity } from 'react-native';
import { chat, useChat } from '../chat';
import { Btn, ConfirmBtn, Empty, DartsmindName, Avatar, toast, showError, s as ui } from '../components';
import { PLATFORMS, platformInfo } from '../platforms';
import { C, themed } from '../theme';
import { usePlayerSearch, SearchStatus } from './Premier';

export const ACCESS = {
  open: ['🌐 Open', 'Every player can join'],
  request: ['✋ On request', 'Players ask, staff let them in'],
  invite: ['✉️ Invite only', 'Only players staff invite'],
};
const EMOJIS = ['💬', '🎯', '🏆', '🛡', '🔥', '⭐', '🎉', '👥', '📣', '🎮', '🇬🇧', '🇳🇱', '🇧🇪', '🇺🇸'];
export const channelsHere = st => (st.channels || []).filter(c => c.platform === 'all' || c.platform === st.platform);
const count = c => c.members.filter(m => m.s === 'member').length;

// The "＋ Rooms" page in the Chat tab: invitations, my rooms, rooms to join; staff make and manage rooms.
export default function ChannelsScreen({ header, onOpen, staff }) {
  const st = useChat();
  const [create, setCreate] = useState(false);
  const [manage, setManage] = useState(null);
  const list = channelsHere(st);
  const invited = list.filter(c => c.my === 'invited');
  const mine = list.filter(c => c.my === 'member');
  const others = list.filter(c => !['member', 'invited', 'removed'].includes(c.my) && (staff || c.access !== 'invite'));

  const join = async c => {
    try {
      const r = await chat.request('channel.join', { id: c.id });
      if (r.status === 'member') { toast(`You are in: ${c.name}.`); onOpen(c.id); } else toast('Request sent. Staff will let you in.');
    } catch (e) { showError(e); }
  };
  const leave = (c, msg) => chat.request('channel.leave', { id: c.id }).then(() => toast(msg)).catch(showError);

  const card = (c, buttons) => (
    <View key={c.id} style={ui.card}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{c.name}</Text>
          <Text style={styles.sub}>{ACCESS[c.access]?.[0]} · {count(c)} member{count(c) === 1 ? '' : 's'}{c.platform !== 'all' ? ' · ' + platformInfo(c.platform).name : ''}</Text>
        </View>
      </View>
      {!!c.desc && <Text style={{ color: C.muted }}>{c.desc}</Text>}
      <View style={ui.row}>{buttons}</View>
    </View>);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 }}>
        {staff && <Btn kind="pri" title="＋ New chat room" onPress={() => setCreate(true)} />}

        {!!invited.length && <Text style={[ui.section, { marginTop: 4, marginBottom: 0 }]}>Invitations</Text>}
        {invited.map(c => card(c, <>
          <Btn kind="pri" title="✅ Accept" onPress={() => join(c)} style={{ flexGrow: 1 }} />
          <Btn title="Decline" onPress={() => leave(c, 'Invitation declined.')} />
        </>))}

        <Text style={[ui.section, { marginTop: 4, marginBottom: 0 }]}>Your chat rooms</Text>
        {mine.length ? mine.map(c => card(c, <>
          <Btn kind="pri" title="Open" onPress={() => onOpen(c.id)} style={{ flexGrow: 1 }} />
          {staff ? <Btn title="Manage" onPress={() => setManage(c.id)} /> : <Btn title="Leave" onPress={() => leave(c, `You left ${c.name}.`)} />}
        </>)) : <Empty text={staff ? 'Make a chat room with the button above.' : 'You are not in a chat room yet.'} />}

        {!!others.length && <Text style={[ui.section, { marginTop: 4, marginBottom: 0 }]}>{staff ? 'Other chat rooms' : 'Chat rooms you can join'}</Text>}
        {others.map(c => card(c, c.my === 'pending' ? <>
          <Text style={[styles.sub, { flexGrow: 1 }]}>⏳ Request sent. Staff will let you in.</Text>
          <Btn small title="Cancel" onPress={() => leave(c, 'Request taken back.')} />
        </> : <>
          {staff ? <Btn kind="pri" title="Open" onPress={() => onOpen(c.id)} style={{ flexGrow: 1 }} />
            : <Btn kind="pri" title={c.access === 'open' ? '➕ Join' : '✋ Ask to join'} onPress={() => join(c)} style={{ flexGrow: 1 }} />}
          {staff && <Btn title="Manage" onPress={() => setManage(c.id)} />}
        </>))}
      </ScrollView>
      <EditSheet visible={create} onClose={() => setCreate(false)} onDone={id => { setCreate(false); onOpen(id); }} />
      <ManageSheet id={manage} onClose={() => setManage(null)} />
    </View>
  );
}

// Under the room name in a chat room: members count, Manage (staff) or Leave (players).
export function ChannelBar({ c, staff, onLeft }) {
  const [manage, setManage] = useState(false);
  const pending = c.members.filter(m => m.s === 'pending').length;
  const leave = () => chat.request('channel.leave', { id: c.id }).then(() => { toast(`You left ${c.name}.`); onLeft(); }).catch(showError);
  return (
    <>
      <View style={styles.bar}>
        <Text style={styles.barTxt}>{c.emoji} {ACCESS[c.access]?.[0]} · {count(c)} member{count(c) === 1 ? '' : 's'}</Text>
        {staff ? <TouchableOpacity onPress={() => setManage(true)} accessibilityRole="button">
          <Text style={[styles.barTxt, pending && { color: C.orange }]}>{pending ? `✋ ${pending} waiting · ` : ''}Manage ›</Text></TouchableOpacity>
          : <ConfirmBtn small title="Leave" confirmTitle="Leave this room?" onConfirm={leave} />}
      </View>
      <ManageSheet id={manage ? c.id : null} onClose={() => setManage(false)} />
    </>
  );
}

// Staff: make a new room or change one.
function EditSheet({ visible, room, onClose, onDone }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [emoji, setEmoji] = useState('💬');
  const [platform, setPlatform] = useState('all');
  const [access, setAccess] = useState('open');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setName(room?.name || ''); setDesc(room?.desc || ''); setEmoji(room?.emoji || '💬');
    setPlatform(room?.platform || 'all'); setAccess(room?.access || 'open');
  }, [visible]);
  const save = async () => {
    setBusy(true);
    try {
      if (room) { await chat.request('channel.edit', { id: room.id, name, desc, emoji, platform, access }); toast('Saved.'); onDone(room.id); }
      else { const r = await chat.request('channel.create', { name, desc, emoji, platform, access }); toast(`Chat room ${name.trim()} is ready.`); onDone(r.id); }
    } catch (e) { showError(e); }
    setBusy(false);
  };
  const platforms = [['all', 'All platforms'], ...PLATFORMS.map(p => [p.key, p.name])];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{room ? 'Change chat room' : 'New chat room'}</Text>
            <TextInput style={ui.input} placeholder="Name, e.g. Season 8 captains" placeholderTextColor={C.muted} value={name} onChangeText={setName} maxLength={40} />
            <TextInput style={[ui.input, { minHeight: 60 }]} placeholder="What is this room for? (optional)" placeholderTextColor={C.muted} value={desc} onChangeText={setDesc} maxLength={200} multiline />
            <Text style={styles.label}>Icon</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{EMOJIS.map(e => (
              <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[styles.emoji, emoji === e && styles.emojiOn]} accessibilityLabel={'Icon ' + e}>
                <Text style={{ fontSize: 22 }}>{e}</Text></TouchableOpacity>))}</View>
            <Text style={styles.label}>Who can join?</Text>
            {Object.entries(ACCESS).map(([k, [label, help]]) => (
              <TouchableOpacity key={k} onPress={() => setAccess(k)} style={[styles.option, access === k && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ checked: access === k }}>
                <Text style={[styles.optTitle, access === k && { color: C.orangeSoft }]}>{label}</Text>
                <Text style={styles.sub}>{help}</Text>
              </TouchableOpacity>))}
            <Text style={styles.label}>Shown in</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{platforms.map(([k, l]) => (
              <TouchableOpacity key={k} onPress={() => setPlatform(k)} style={[styles.pill, platform === k && styles.optionOn]}>
                <Text style={[styles.optTitle, platform === k && { color: C.orangeSoft }]}>{l}</Text></TouchableOpacity>))}</View>
            <View style={ui.row}>
              <Btn title="Cancel" onPress={onClose} />
              <Btn kind="pri" title={room ? 'Save' : 'Make chat room'} loading={busy} disabled={!name.trim()} onPress={save} style={{ flexGrow: 1 }} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Staff: requests, members, invite players, change or delete the room.
function ManageSheet({ id, onClose }) {
  const st = useChat();
  const c = (st.channels || []).find(x => x.id === id);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(false);
  const { found, status } = usePlayerSearch(q, !!c);
  useEffect(() => { if (!id) setQ(''); }, [id]);
  if (!c) return null;
  const set = (user, s, msg) => chat.request('channel.member', { id: c.id, user, s }).then(() => msg && toast(msg)).catch(showError);
  const place = uid => c.members.find(m => m.id === uid)?.s;
  const groups = [['pending', '✋ Asking to join'], ['invited', '✉️ Invited'], ['member', '👥 Members'], ['removed', '⛔ Removed']];
  const del = () => chat.request('channel.delete', { id: c.id }).then(() => { toast('Chat room deleted.'); onClose(); }).catch(showError);
  return (
    <Modal visible={!!id} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{c.emoji} {c.name}</Text>
            <Text style={styles.sub}>{ACCESS[c.access][0]} · {ACCESS[c.access][1]}</Text>
            <View style={ui.row}>
              <Btn small title="✏️ Change" onPress={() => setEdit(true)} />
              <ConfirmBtn small title="🗑 Delete room" confirmTitle="Delete for everyone?" onConfirm={del} />
            </View>
            <TextInput style={ui.input} placeholder={c.access === 'invite' ? 'Invite a player: name or Dartsmind name' : 'Add a player: name or Dartsmind name'}
              placeholderTextColor={C.muted} value={q} onChangeText={setQ} autoCapitalize="none" />
            <SearchStatus q={q} status={status} count={found.length} />
            {found.map(u => {
              const s = place(u.id);
              return (
                <View key={u.id} style={styles.row}>
                  <Avatar user={u} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{u.name}</Text>
                    {!!u.dartsmind && <DartsmindName name={u.dartsmind} size={14} style={styles.sub} />}
                  </View>
                  {s === 'member' ? <Text style={styles.sub}>✅ In</Text> : s === 'invited' ? <Text style={styles.sub}>✉️ Invited</Text>
                    : <>
                      <Btn small kind="pri" title="Invite" onPress={() => set({ id: u.id, name: u.name }, 'invited', `${u.name} is invited.`)} />
                      <Btn small title="Add" onPress={() => set({ id: u.id, name: u.name }, 'member', `${u.name} is in.`)} />
                    </>}
                </View>);
            })}
            {q.trim().length < 2 && groups.map(([s, label]) => {
              const list = c.members.filter(m => m.s === s);
              if (!list.length) return null;
              return (
                <View key={s} style={{ gap: 2 }}>
                  <Text style={[ui.section, { marginTop: 8, marginBottom: 2 }]}>{label} · {list.length}</Text>
                  {list.map(m => (
                    <View key={m.id} style={styles.row}>
                      <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{m.name}{m.id === st.me?.id ? ' (you)' : ''}</Text>
                      {s === 'pending' && <><Btn small kind="pri" title="Let in" onPress={() => set(m, 'member', `${m.name} is in.`)} />
                        <Btn small title="Decline" onPress={() => set(m, null, 'Request declined.')} /></>}
                      {s === 'invited' && <Btn small title="Take back" onPress={() => set(m, null)} />}
                      {s === 'member' && m.id !== st.me?.id && <Btn small kind="danger" title="Remove" onPress={() => set(m, 'removed', `${m.name} was removed.`)} />}
                      {s === 'removed' && <Btn small title="Allow again" onPress={() => set(m, null, `${m.name} can join again.`)} />}
                    </View>))}
                </View>);
            })}
            <Btn title="Close" onPress={onClose} />
          </ScrollView>
          <EditSheet visible={edit} room={c} onClose={() => setEdit(false)} onDone={() => setEdit(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(C => ({
  name: { color: C.fg, fontWeight: '800', fontSize: 16 },
  sub: { color: C.muted, fontSize: 13 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.navy2 },
  barTxt: { color: C.white, fontWeight: '800', fontSize: 13 },
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  label: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 4 },
  emoji: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  emojiOn: { borderColor: C.orange, borderWidth: 2, backgroundColor: 'rgba(251,88,1,0.12)' },
  option: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, gap: 2 },
  optionOn: { borderColor: C.orange, borderWidth: 2, backgroundColor: 'rgba(251,88,1,0.08)' },
  optTitle: { color: C.fg, fontWeight: '800', fontSize: 15 },
  pill: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
}));
