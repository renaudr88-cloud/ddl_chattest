// General, tournament and raffle chat, and private chats (same screen, different room).
// Type @ and a few letters to tag a player.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, Image, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { chat, useChat, isMuted, CAN_UPLOAD } from '../chat';
import { hasBad } from '../filter';
import { Avatar, Header, Notice, RoleTag, Lightbox, Empty, timeLabel, clock, toast, showError } from '../components';
import { C, R, themed, useTheme } from '../theme';
import { TournamentCard } from './Tournaments';

export default function ChatScreen({ room, title, subtitle, onBack, onUser, right, below }) {
  const st = useChat();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [img, setImg] = useState(null);       // local uri before upload
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [tags, setTags] = useState([]);       // people tagged in the message being written: [{id, name}]
  const [suggest, setSuggest] = useState([]); // names shown while typing @…
  const searchTimer = useRef(null);
  const list = st.rooms[room];
  const muted = isMuted(st.me);
  const admin = st.me?.role === 'admin';

  useEffect(() => {
    chat.activeRoom = room;
    if (!list && st.status === 'online') chat.loadRoom(room).catch(showError);
    else if (list?.length) chat.markRead(room, list[list.length - 1].ts);
    return () => { if (chat.activeRoom === room) chat.activeRoom = null; };
  }, [room, st.status]);

  const data = useMemo(() => (list ? [...list].reverse() : []), [list]);

  // People who recently talked here come first in the @ list; the rest is found by name.
  const recent = useMemo(() => {
    const seen = new Map();
    for (const m of [...(list || [])].reverse()) if (m.user.id !== st.me?.id && !seen.has(m.user.id)) seen.set(m.user.id, m.user);
    return [...seen.values()];
  }, [list, st.me?.id]);

  // Is the player typing "@na…" at the end? Then return the part after @.
  const tagQuery = v => {
    const at = v.lastIndexOf('@');
    if (at < 0 || (at > 0 && !/\s/.test(v[at - 1]))) return null;
    const q = v.slice(at + 1);
    return q.length <= 25 && !q.includes('\n') && !/\s\s/.test(q) ? q : null;
  };
  const latest = useRef('');
  const onType = v => {
    setText(v); latest.current = v;
    const q = tagQuery(v);
    clearTimeout(searchTimer.current);
    if (q === null) return setSuggest([]);
    const ql = q.toLowerCase();
    const local = recent.filter(u => u.name.toLowerCase().startsWith(ql)).slice(0, 5);
    setSuggest(local);
    if (!q) return;
    searchTimer.current = setTimeout(() => {
      chat.request('users.search', { q }).then(r => {
        if (latest.current !== v) return;          // the player typed on; a newer search is coming
        const all = [...local];
        for (const u of r.list) if (!all.some(x => x.id === u.id)) all.push(u);
        setSuggest(all.slice(0, 5));
      }).catch(() => {});
    }, 250);
  };
  const pickTag = u => {
    const at = text.lastIndexOf('@');
    const v = text.slice(0, at) + '@' + u.name + ' ';
    setText(v); latest.current = v;
    setTags(t => (t.some(x => x.id === u.id) ? t : [...t, { id: u.id, name: u.name }]));
    setSuggest([]);
  };

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets?.[0]) setImg(r.assets[0].uri);
  };

  const send = async () => {
    const t = text.trim();
    if (!t && !img) return;
    if (hasBad(t)) return toast('Message blocked: it contains a word that is not allowed in the DDL community.', true);
    setSending(true);
    try {
      const imageUrl = img ? await chat.uploadImage(img) : null;
      await chat.request('send', { room, text: t, imageUrl, mentions: tags });
      setText(''); setImg(null); setTags([]); setSuggest([]);
    } catch (e) { showError(e); }
    setSending(false);
  };

  const del = m => chat.request('delete', { id: m.id }).catch(showError);

  const renderItem = ({ item: m }) => {
    const mine = m.user.id === st.me?.id;
    const tagsMe = !mine && (m.mentions || []).some(x => x.id === st.me?.id);
    return (
      <View style={[styles.msg, mine && { flexDirection: 'row-reverse' }]}>
        <Avatar user={m.user} onPress={() => onUser?.(m.user)} />
        <View style={[styles.bub, mine ? styles.mine : styles.theirs, tagsMe && styles.tagged]}>
          <View style={styles.meta}>
            <TouchableOpacity onPress={() => onUser?.(m.user)}><Text style={styles.name}>{m.user.name}</Text></TouchableOpacity>
            <RoleTag user={m.user} />
            <Text style={styles.time}>{timeLabel(m.ts)}</Text>
            {(mine || admin) && <TouchableOpacity onPress={() => del(m)} hitSlop={8}><Text style={styles.del}>Delete</Text></TouchableOpacity>}
          </View>
          {!!m.text && <Text style={styles.txt}>{withTags(m.text, m.mentions, st.me?.id, onUser)}</Text>}
          {!!m.tournament && <TournamentCard tournament={m.tournament} />}
          {!!m.imageUrl && <TouchableOpacity onPress={() => setZoom(m.imageUrl)}><Image source={{ uri: m.imageUrl }} style={styles.img} resizeMode="cover" /></TouchableOpacity>}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Header title={title} subtitle={subtitle} onBack={onBack} right={right} />
      {below}
      {st.status !== 'online' && <Text style={styles.conn}>{st.status === 'connecting' ? 'Connecting…' : 'Offline. Reconnecting…'}</Text>}
      {!list ? <View style={{ flex: 1 }}><ActivityIndicator color={C.orange} style={{ marginTop: 40 }} /></View> :
        <FlatList
          data={data} extraData={theme} inverted keyExtractor={m => String(m.id)} renderItem={renderItem}
          contentContainerStyle={{ padding: 14 }}
          onEndReached={() => chat.loadOlder(room).catch(() => {})} onEndReachedThreshold={0.3}
          ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }] }}><Empty text="No messages yet. Say hi 👋" /></View>}
        />}
      <View style={styles.composer}>
        {muted && <Notice text={`You are muted until ${clock(st.me.sanction.muted_until)}. You can still read the chat.`} />}
        {img && <View style={styles.preview}><Image source={{ uri: img }} style={{ width: 48, height: 48, borderRadius: 6 }} />
          <Text style={{ color: C.muted, flex: 1 }}>Picture attached</Text>
          <TouchableOpacity onPress={() => setImg(null)}><Text style={{ color: C.orangeSoft, fontWeight: '700' }}>Remove</Text></TouchableOpacity></View>}
        {suggest.length > 0 && <View style={styles.suggest}>
          {suggest.map(u => (
            <TouchableOpacity key={u.id} style={styles.sugRow} onPress={() => pickTag(u)} accessibilityLabel={'Tag ' + u.name}>
              <Avatar user={u} size={26} />
              <Text style={styles.sugName}>{u.name}</Text>
              <RoleTag user={u} />
            </TouchableOpacity>))}
        </View>}
        <View style={styles.row}>
          {CAN_UPLOAD && <TouchableOpacity style={styles.icon} onPress={pick} disabled={muted} accessibilityLabel="Add a picture"><Text style={{ fontSize: 20 }}>📷</Text></TouchableOpacity>}
          <TextInput style={styles.input} value={text} onChangeText={onType} multiline maxLength={1000} editable={!muted}
            placeholder={room.startsWith('dm:') ? 'Write a private message…' : 'Message… type @ to tag a player'} placeholderTextColor={C.muted} />
          <TouchableOpacity style={[styles.send, (muted || sending) && { opacity: 0.45 }]} onPress={send} disabled={muted || sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendTxt}>SEND</Text>}
          </TouchableOpacity>
        </View>
      </View>
      <Lightbox uri={zoom} onClose={() => setZoom(null)} />
    </KeyboardAvoidingView>
  );
}

// Shows "@Name" of tagged players in orange (tap to open the player); my own name stands out more.
function withTags(text, mentions, meId, onUser) {
  if (!mentions?.length) return text;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const parts = text.split(new RegExp('(' + names.map(n => '@' + esc(n.name)).join('|') + ')'));
  return parts.map((p, i) => {
    const m = p.startsWith('@') && names.find(n => '@' + n.name === p);
    if (!m) return p;
    return <Text key={i} onPress={() => onUser?.({ id: m.id, name: m.name, role: 'player' })}
      style={[styles.tag, m.id === meId && styles.tagMe]}>{p}</Text>;
  });
}

const styles = themed(C => ({
  conn: { color: C.white, backgroundColor: C.warn, textAlign: 'center', paddingVertical: 4, fontSize: 12 },
  msg: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'flex-start' },
  bub: { maxWidth: '78%', paddingHorizontal: 12, paddingVertical: 8 },
  theirs: { backgroundColor: C.bubble, borderRadius: 14, borderTopLeftRadius: 4 },
  mine: { backgroundColor: C.mine, borderRadius: 14, borderTopRightRadius: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  name: { color: C.fg, fontWeight: '700', fontSize: 13 },
  time: { color: C.muted, fontSize: 11 },
  del: { color: C.muted, fontSize: 11, textDecorationLine: 'underline' },
  tagged: { borderWidth: 2, borderColor: C.orange },
  tag: { color: C.orangeSoft, fontWeight: '800' },
  tagMe: { color: C.white, backgroundColor: C.orange },
  suggest: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: R.md, marginBottom: 8, overflow: 'hidden' },
  sugRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  sugName: { color: C.fg, fontWeight: '700', fontSize: 15 },
  txt: { color: C.fg, fontSize: 15, lineHeight: 21 },
  img: { width: 220, height: 220, borderRadius: R.md, marginTop: 6, backgroundColor: C.panel },
  composer: { backgroundColor: C.panel, borderTopWidth: 1, borderTopColor: C.line, padding: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 10 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  icon: { width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: C.bg, color: C.fg, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, fontSize: 15 },
  send: { height: 44, paddingHorizontal: 16, borderRadius: R.md, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: C.white, fontWeight: '900', letterSpacing: 1.5 },
}));
