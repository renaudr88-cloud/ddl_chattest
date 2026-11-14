// Premier League chat (Dartsmind): staff put players in it. Players who are not in it never see it.
import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Modal, Pressable, TouchableOpacity } from 'react-native';
import { chat, useChat } from '../chat';
import { Avatar, Btn, toast, showError, s as ui } from '../components';
import { C, themed } from '../theme';

export function PremierStaffBar() {
  const st = useChat();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const members = st.premier?.members || [];
  const isIn = id => members.some(m => m.id === id);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => chat.request('players.search', { q }).then(r => setFound(r.list)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q, open]);

  const add = async u => {
    try { await chat.request('premier.add', { user: { id: u.id, name: u.name } }); toast(`${u.name} is now in the Premier League chat.`); setQ(''); }
    catch (e) { showError(e); }
  };
  const remove = async u => {
    try { await chat.request('premier.remove', { user: u }); toast(`${u.name} was taken out of the Premier League chat.`); }
    catch (e) { showError(e); }
  };

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={styles.bar} accessibilityRole="button">
        <Text style={styles.barTxt}>🏅 Premier League · {members.length} player{members.length === 1 ? '' : 's'}</Text>
        <Text style={styles.barTxt}>Manage ›</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Premier League chat</Text>
            <Text style={{ color: C.muted }}>Only these players and DDL staff can see this chat.</Text>
            <TextInput style={ui.input} placeholder="Add a player: name or Dartsmind name" placeholderTextColor={C.muted}
              value={q} onChangeText={setQ} autoCapitalize="none" />
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 2 }} keyboardShouldPersistTaps="handled">
              {found.map(u => (
                <View key={u.id} style={styles.row}>
                  <Avatar user={u} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{u.name}</Text>
                    {!!u.dartsmind && <Text style={styles.sub}>🎯 {u.dartsmind}</Text>}
                  </View>
                  {isIn(u.id) ? <Text style={styles.sub}>✅ In</Text> : <Btn small kind="pri" title="Add" onPress={() => add(u)} />}
                </View>))}
              {q.trim().length < 2 && <>
                <Text style={[ui.section, { marginTop: 4, marginBottom: 2 }]}>In the chat · {members.length}</Text>
                {!members.length && <Text style={{ color: C.muted }}>Nobody yet. Search a player above to add them.</Text>}
                {members.map(u => (
                  <View key={u.id} style={styles.row}>
                    <Text style={[styles.name, { flex: 1 }]}>{u.name}</Text>
                    <Btn small kind="danger" title="Remove" onPress={() => remove(u)} />
                  </View>))}
              </>}
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
  barTxt: { color: C.white, fontWeight: '800', fontSize: 13 },
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, gap: 12 },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { color: C.fg, fontWeight: '700', fontSize: 15 },
  sub: { color: C.muted, fontSize: 12 },
}));
