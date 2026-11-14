// Tournaments from ddl-online.com in the Dartsmind Tournament chat.
// Staff post a tournament as a card; players tap Sign up and finish on the website's tournament page,
// so every check of the website (average screenshot, bans, clashes, reserve list) stays exactly the same.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Modal, Pressable, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { chat } from '../chat';
import { Btn, Empty, toast, showError } from '../components';
import { C, R, themed } from '../theme';

const when = ms => new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Live numbers for a card: refreshed at most once a minute per tournament (shared by all cards).
const cache = new Map();
function useTournament(id) {
  const [t, setT] = useState(cache.get(id)?.t);
  useEffect(() => {
    const c = cache.get(id);
    if (c && Date.now() - c.at < 60_000) { setT(c.t); return; }
    chat.request('tournaments.list', { id }).then(r => {
      const x = r.list[0] || { gone: true };
      cache.set(id, { t: x, at: Date.now() }); setT(x);
    }).catch(() => setT(t => t || { error: true }));
  }, [id]);
  return t;
}

export function TournamentCard({ tournament }) {
  const t = useTournament(tournament.id);
  const open = () => { cache.delete(tournament.id); Linking.openURL(t?.url || `https://ddl-online.com/tournament-detail.php?id=${tournament.id}`); };
  let status = null, button = 'Sign up';
  if (t?.me === 'joined') { status = '✅ You are in'; button = 'View tournament'; }
  else if (t?.me === 'reserve') { status = '⏳ You are on the reserve list'; button = 'View tournament'; }
  else if (t?.gone) { status = 'This tournament is no longer available.'; button = null; }
  else if (t?.closed) { status = 'Entry closed'; button = 'View tournament'; }
  else if (t?.opens) { status = 'Registration opens ' + when(t.opens); button = 'View tournament'; }
  else if (t && t.players >= t.max) { status = 'Full · reserve list open'; button = 'Join reserve list'; }
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>🏆 DDL TOURNAMENT</Text>
      <Text style={styles.name}>{tournament.name}</Text>
      {!t ? <ActivityIndicator color={C.orange} style={{ alignSelf: 'flex-start' }} /> : !t.gone && !t.error && <>
        <Text style={styles.line}>📅 {when(t.start)}</Text>
        <Text style={styles.line}>🎯 {t.format}{t.minAvg != null || t.maxAvg != null ? ` · avg ${t.minAvg ?? 0}–${t.maxAvg ?? '∞'}` : ''}</Text>
        <Text style={styles.line}>👥 {t.players}/{t.max} players{t.reserves ? ` · ${t.reserves} reserves` : ''}</Text>
      </>}
      {!!status && <Text style={styles.status}>{status}</Text>}
      {button && <TouchableOpacity style={[styles.btn, button !== 'Sign up' && button !== 'Join reserve list' && styles.btnGhost]} onPress={open} accessibilityRole="button">
        <Text style={styles.btnTxt}>{button}</Text>
      </TouchableOpacity>}
    </View>
  );
}

// Staff: pick a tournament from the website and post it in the Tournament chat.
export function PostTournament() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const show = () => {
    setOpen(true); setList(null);
    chat.request('tournaments.list').then(r => setList(r.list)).catch(e => { showError(e); setList([]); });
  };
  const post = async t => {
    try { await chat.request('tournament.post', { id: t.id, name: t.name }); setOpen(false); toast('Posted in the Tournament chat.'); }
    catch (e) { showError(e); }
  };
  return (
    <>
      <TouchableOpacity onPress={show} style={styles.bar} accessibilityRole="button">
        <Text style={styles.barTxt}>📢 Post a tournament</Text><Text style={styles.barTxt}>›</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Post a tournament</Text>
            <Text style={{ color: C.muted }}>Open tournaments on ddl-online.com. Players sign up from the card.</Text>
            {!list ? <ActivityIndicator color={C.orange} /> :
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
                {!list.length && <Empty text="No open tournaments on the website." />}
                {list.map(t => (
                  <View key={t.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{t.name}</Text>
                      <Text style={styles.rowSub}>{when(t.start)} · {t.players}/{t.max} players</Text>
                    </View>
                    <Btn small kind="pri" title="Post" onPress={() => post(t)} />
                  </View>))}
              </ScrollView>}
            <Btn title="Close" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = themed(C => ({
  card: { backgroundColor: C.panel, borderRadius: R.md, borderWidth: 2, borderColor: C.orange, padding: 12, gap: 4, marginTop: 6, minWidth: 230 },
  kicker: { color: C.orange, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  name: { color: C.fg, fontWeight: '900', fontSize: 17, marginBottom: 2 },
  line: { color: C.fg, fontSize: 14 },
  status: { color: C.fg, fontWeight: '800', fontSize: 14, marginTop: 4 },
  btn: { backgroundColor: C.orange, borderRadius: R.md, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  btnGhost: { backgroundColor: C.navy2 },
  btnTxt: { color: C.white, fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.navy2 },
  barTxt: { color: C.white, fontWeight: '800', fontSize: 13 },
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, gap: 12 },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  rowName: { color: C.fg, fontWeight: '700', fontSize: 15 },
  rowSub: { color: C.muted, fontSize: 12 },
}));
