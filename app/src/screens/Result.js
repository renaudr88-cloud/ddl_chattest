// Enter the result of my tournament match (My DDL → "Your match is ready" → 📷 Enter result).
// Ranked tournaments: the DartsMind Match Stats screenshot is read by the website and only those values
// are saved (php/chat-myddl.php → the website's parse-match-screenshot.php and update-score-b.php).
// A no-show / walkover can be entered by hand, but only with yourself as the winner.
// Unranked tournaments: type the score (a screenshot can fill it in).
import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, Modal, Pressable, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { chat } from '../chat';
import { Btn, toast, s as ui } from '../components';
import { C, themed } from '../theme';

const ROWS = [['legs', 'Legs'], ['avg', 'Average'], ['c180', '180s'], ['c140', '140+'], ['c100', '100+'], ['checkout', 'Best checkout']];
const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

export default function ResultSheet({ m, onClose }) {
  const [img, setImg] = useState(null);
  const [shot, setShot] = useState(null);       // {me, opp} read from the screenshot
  const [reading, setReading] = useState(false);
  const [forfeit, setForfeit] = useState(false);
  const [mine, setMine] = useState('');          // typed legs (unranked or walkover)
  const [theirs, setTheirs] = useState('');
  const [avgMe, setAvgMe] = useState('');
  const [avgOpp, setAvgOpp] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!m) return;
    setImg(null); setShot(null); setForfeit(false); setMine(''); setTheirs(''); setAvgMe(''); setAvgOpp(''); setConfirm(false); setMsg(null);
  }, [m?.match]);
  if (!m) return null;

  const scolia = m.platform === 'scolia';
  const ranked = !!m.ranked;
  const opp = m.opponent?.name || 'Opponent';

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    setImg(a); setShot(null); setMsg(null); setConfirm(false); setReading(true);
    try {
      const res = await chat.request('result.shot', { match: m.match, uri: a.uri, name: a.fileName || 'screenshot.jpg', type: a.mimeType || 'image/jpeg' });
      if (!res.names_matched) { setMsg("The player names in that screenshot don't match this match. Check it's the right game and try again."); return; }
      const me = m.me1 ? res.player1 : res.player2, them = m.me1 ? res.player2 : res.player1;
      setShot({ me, opp: them });
      setForfeit(false);
      if (!ranked) { setMine(String(me.legs)); setTheirs(String(them.legs)); setAvgMe(me.avg ? String(me.avg) : ''); setAvgOpp(them.avg ? String(them.avg) : ''); }
    } catch (e) { setMsg(e.message); }
    finally { setReading(false); }
  };

  // What will be saved (me / opponent), or why not yet.
  let me = null, them = null, why = '';
  if (forfeit || !ranked) {
    me = num(mine); them = num(theirs);
    if (me === null || them === null) why = 'Enter both scores.';
    else if (me === them) why = 'A draw is not possible.';
    else if (forfeit && me < them) why = 'A walkover is entered by the winner. Did you give up? Your opponent or an admin enters it.';
  } else if (shot) { me = shot.me.legs; them = shot.opp.legs; if (me === them) why = 'The screenshot shows no winner. Ask an admin.'; }
  else why = 'Upload your DartsMind Match Stats screenshot.';

  const save = async () => {
    setBusy(true); setMsg(null);
    const s1 = m.me1 ? me : them, s2 = m.me1 ? them : me;
    const stats = {};
    if (!forfeit) {
      const a = shot && ranked ? null : [num(avgMe), num(avgOpp)];
      if (a) { if (a[0]) stats[m.me1 ? 'p1_avg' : 'p2_avg'] = a[0]; if (a[1]) stats[m.me1 ? 'p2_avg' : 'p1_avg'] = a[1]; }
      if (shot && !ranked) for (const [k, side] of [['c180', '180s'], ['c140', '140s'], ['c100', '100s']]) {
        stats[(m.me1 ? 'p1_' : 'p2_') + side] = shot.me[k]; stats[(m.me1 ? 'p2_' : 'p1_') + side] = shot.opp[k];
      }
      if (shot && !ranked) { if (shot.me.checkout) stats[m.me1 ? 'p1_checkout' : 'p2_checkout'] = shot.me.checkout; if (shot.opp.checkout) stats[m.me1 ? 'p2_checkout' : 'p1_checkout'] = shot.opp.checkout; }
    }
    try {
      const r = await chat.request('result.save', { match: m.match, score1: s1, score2: s2, forfeit, stats });
      toast(r.message || 'Result saved. 🎯');
      onClose(true);
    } catch (e) { setMsg(e.message); setConfirm(false); }
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <Pressable style={styles.scrim} onPress={() => onClose(false)}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Enter result</Text>
            <Text style={styles.sub}>{m.tournament}{m.round ? ` · Round ${m.round}` : ''} · vs {opp}</Text>
            {ranked && <View style={styles.note}><Text style={styles.noteTxt}>🔒 Ranked tournament: the result comes from your DartsMind <Text style={{ fontWeight: '900' }}>Match Stats</Text> screenshot and can't be typed.</Text></View>}

            {scolia && ranked ? <>
              <Text style={{ color: C.fg, lineHeight: 21 }}>Results of ranked Scolia tournaments are entered by an admin. Send your result and a screenshot to an admin.</Text>
              <Btn title="Close" onPress={() => onClose(false)} />
            </> : <>
              {!forfeit && <>
                <Btn kind={ranked ? 'pri' : 'default'} title={img ? '🖼 Choose another screenshot' : '📷 Choose Match Stats screenshot'} onPress={pick} disabled={reading} />
                {reading && <View style={styles.reading}><ActivityIndicator color={C.orange} /><Text style={{ color: C.muted }}>Reading screenshot… a few seconds</Text></View>}
                {img && !reading && !shot && <Image source={{ uri: img.uri }} style={styles.preview} resizeMode="contain" />}
              </>}

              {shot && !forfeit && (
                <View style={styles.table}>
                  <View style={[styles.tr, styles.th]}>
                    <Text style={[styles.td, styles.lab]} />
                    <Text style={[styles.td, styles.col, styles.thTxt]} numberOfLines={1}>You</Text>
                    <Text style={[styles.td, styles.col, styles.thTxt]} numberOfLines={1}>{opp}</Text>
                  </View>
                  {ROWS.map(([k, label]) => (
                    <View key={k} style={styles.tr}>
                      <Text style={[styles.td, styles.lab]}>{label}</Text>
                      <Text style={[styles.td, styles.col, k === 'legs' && styles.big]}>{shot.me[k] ?? '–'}</Text>
                      <Text style={[styles.td, styles.col, k === 'legs' && styles.big]}>{shot.opp[k] ?? '–'}</Text>
                    </View>))}
                </View>)}

              {(!ranked || forfeit) && (
                <View style={{ gap: 8 }}>
                  <View style={styles.inRow}>
                    <View style={{ flex: 1 }}><Text style={styles.lab2}>Your legs</Text>
                      <TextInput style={ui.input} keyboardType="number-pad" value={mine} onChangeText={v => { setMine(v.replace(/[^0-9]/g, '')); setConfirm(false); }} placeholder="0" placeholderTextColor={C.muted} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.lab2} numberOfLines={1}>{opp}</Text>
                      <TextInput style={ui.input} keyboardType="number-pad" value={theirs} onChangeText={v => { setTheirs(v.replace(/[^0-9]/g, '')); setConfirm(false); }} placeholder="0" placeholderTextColor={C.muted} /></View>
                  </View>
                  {!ranked && !forfeit && <View style={styles.inRow}>
                    <View style={{ flex: 1 }}><Text style={styles.lab2}>Your average</Text>
                      <TextInput style={ui.input} keyboardType="decimal-pad" value={avgMe} onChangeText={v => setAvgMe(v.replace(',', '.'))} placeholder="optional" placeholderTextColor={C.muted} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.lab2}>Their average</Text>
                      <TextInput style={ui.input} keyboardType="decimal-pad" value={avgOpp} onChangeText={v => setAvgOpp(v.replace(',', '.'))} placeholder="optional" placeholderTextColor={C.muted} /></View>
                  </View>}
                </View>)}

              <TouchableOpacity onPress={() => { setForfeit(!forfeit); setConfirm(false); setMsg(null); }} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: forfeit }}>
                <View style={[styles.box, forfeit && styles.boxOn]}>{forfeit && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}</View>
                <Text style={{ color: C.fg, flex: 1 }}>No-show / opponent gave up (walkover, no screenshot)</Text>
              </TouchableOpacity>

              {!!msg && <Text style={styles.err}>{msg}</Text>}
              {!!why && !msg && (shot || forfeit || !ranked) && <Text style={{ color: C.muted }}>{why}</Text>}

              {confirm && !why ? (
                <View style={styles.confirm}>
                  <Text style={{ color: C.fg, fontWeight: '800', fontSize: 16 }}>You {me} – {them} {opp}{forfeit ? ' (walkover)' : ''}</Text>
                  <Text style={{ color: C.muted }}>Winner: {me > them ? 'you' : opp}. Is this right?</Text>
                  <View style={ui.row}>
                    <Btn title="Back" onPress={() => setConfirm(false)} />
                    <Btn kind="pri" title="Yes, save result" loading={busy} onPress={save} style={{ flexGrow: 1 }} />
                  </View>
                </View>
              ) : (
                <View style={ui.row}>
                  <Btn title="Cancel" onPress={() => onClose(false)} />
                  <Btn kind="pri" title="Submit" disabled={!!why || reading} onPress={() => setConfirm(true)} style={{ flexGrow: 1 }} />
                </View>)}
            </>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  sub: { color: C.muted, fontSize: 14, marginTop: -6 },
  note: { backgroundColor: 'rgba(251,88,1,0.12)', borderRadius: 12, padding: 10 },
  noteTxt: { color: C.fg, fontSize: 13, lineHeight: 19 },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', padding: 8 },
  preview: { width: '100%', height: 180, borderRadius: 10, backgroundColor: C.bg },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.line },
  th: { backgroundColor: C.navy, borderTopWidth: 0 },
  thTxt: { color: C.white, fontWeight: '800' },
  td: { color: C.fg, fontSize: 15 },
  lab: { flex: 1.2, color: C.muted, fontSize: 13, fontWeight: '700' },
  col: { flex: 1, textAlign: 'center', fontWeight: '700' },
  big: { fontSize: 24, fontWeight: '900' },
  inRow: { flexDirection: 'row', gap: 10 },
  lab2: { color: C.muted, fontSize: 12, fontWeight: '800', marginBottom: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.line },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.orange, borderColor: C.orange },
  confirm: { gap: 8, backgroundColor: C.bg, borderRadius: 12, padding: 12, borderWidth: 2, borderColor: C.orange },
  err: { color: C.bad, fontWeight: '700' },
}));
