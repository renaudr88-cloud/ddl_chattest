// League Match Planner in a private chat: suggest a date and time for your league match (PlanComposer),
// and the card in the chat that shows it, with Accept / Other time / Call off (PlanCard).
// The plan itself lives on ddl-online.com (php/chat-league.php), so admins see who plays when.
import { createElement, useEffect, useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { chat } from '../chat';
import { Btn, toast, showError, s as ui } from '../components';
import { C, themed } from '../theme';

const pad = n => String(n).padStart(2, '0');
const dayLabel = ms => new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const myZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' '); } catch { return ''; } };

// A date or time field: the phone's own picker in the browser, a text field elsewhere.
function Field({ type, value, onChange, placeholder }) {
  if (Platform.OS === 'web') {
    return createElement('input', {
      type, value, onChange: e => onChange(e.target.value), min: type === 'date' ? new Date().toISOString().slice(0, 10) : undefined,
      style: { flex: 1, minWidth: 0, fontSize: 16, padding: '11px 12px', borderRadius: 10, border: `1px solid ${C.line}`,
        background: C.bg, color: C.fg, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', colorScheme: 'dark' },
    });
  }
  return <TextInput style={[ui.input, { flex: 1 }]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} />;
}

export function PlanComposer({ visible, room, other, fixture: startFixture, onClose }) {
  const [list, setList] = useState(null);
  const [fixture, setFixture] = useState(startFixture || null);
  const tomorrow = new Date(Date.now() + 86400000);
  const [date, setDate] = useState(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`);
  const [time, setTime] = useState('20:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setList(null);
    chat.request('league.fixtures', { withId: other?.id }).then(r => {
      setList(r.list);
      setFixture(f => (r.list.some(x => x.fixture === (f || startFixture)) ? (f || startFixture) : r.list[0]?.fixture || null));
    }).catch(e => { showError(e); setList([]); });
  }, [visible, other?.id, startFixture]);
  const post = async () => {
    const at = new Date(`${date}T${time}`).getTime();
    if (!fixture) return toast('Pick the league match.', true);
    if (!at || at < Date.now()) return toast('Pick a date and time in the future.', true);
    setBusy(true);
    try { await chat.request('league.propose', { room, fixture, at, note }); setNote(''); onClose(); toast('Sent. Your opponent can accept it in the chat. 📅'); }
    catch (e) { showError(e); }
    setBusy(false);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>📅 Plan a league match</Text>
            <Text style={styles.small}>Pick the match, the day and the time. {other?.name || 'Your opponent'} can accept it, suggest another time or call it off.</Text>
            {list === null && <ActivityIndicator color={C.orange} />}
            {list?.length === 0 && <Text style={styles.empty}>No open league match against {other?.name || 'this player'} right now.</Text>}
            {list?.map(f => (
              <TouchableOpacity key={f.fixture} onPress={() => setFixture(f.fixture)} style={[styles.fx, fixture === f.fixture && styles.fxOn]} accessibilityRole="radio" accessibilityState={{ selected: fixture === f.fixture }}>
                <Text style={styles.fxTitle} numberOfLines={1}>{fixture === f.fixture ? '● ' : '○ '}{f.league}{f.group ? ` · Group ${f.group}` : ''}</Text>
                <Text style={styles.small}>Game Week {f.week} · vs {f.opponent.name}{f.plan && ['proposed', 'confirmed'].includes(f.plan.status) ? ` · now: ${dayLabel(f.plan.at)} ${timeLabel(f.plan.at)}` : ''}</Text>
              </TouchableOpacity>))}
            {!!list?.length && <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field type="date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
                <Field type="time" value={time} onChange={setTime} placeholder="20:00" />
              </View>
              <Text style={styles.small}>Your time{myZone() ? ` (${myZone()})` : ''}. {other?.name || 'Your opponent'} sees it in their own time zone.</Text>
              <TextInput style={ui.input} placeholder="Message (optional)" placeholderTextColor={C.muted} value={note} onChangeText={setNote} maxLength={300} />
              <Btn kind="pri" title="Send to opponent" loading={busy} onPress={post} />
            </>}
            <Btn title="Cancel" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// In a message: the planned match with its live status.
export function PlanCard({ id, room, meId, onOtherTime }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState('');
  const [calling, setCalling] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => { chat.request('league.plan', { id }).then(r => setPlan(r.plan)).catch(() => setErr(true)); }, [id]);
  if (err) return <Text style={styles.cardSmall}>📅 League match plan (not available)</Text>;
  if (!plan) return <View style={styles.card}><ActivityIndicator color={C.orange} /></View>;
  const mine = plan.by.id === meId;
  const opp = mine ? plan.opponent : plan.by;
  const act = async (what, body) => {
    setBusy(what);
    try { const r = await chat.request('league.' + what, { room, id: plan.id, ...body }); setPlan(r.plan); setCalling(false); }
    catch (e) { showError(e); }
    setBusy('');
  };
  const open = plan.status === 'proposed' || plan.status === 'confirmed';
  return (
    <View style={[styles.card, plan.status === 'confirmed' && { borderLeftColor: C.green || '#12a150' }, !open && { opacity: 0.85 }]}>
      <Text style={styles.cardTitle}>📅 League match</Text>
      <Text style={styles.cardSmall}>{plan.league}{plan.group ? ` · Group ${plan.group}` : ''} · Week {plan.week} · vs {opp.name}</Text>
      <View style={styles.when}>
        <View style={styles.whenBox}><Text style={styles.whenBig}>{dayLabel(plan.at)}</Text><Text style={styles.whenLbl}>DATE</Text></View>
        <View style={styles.whenBox}><Text style={styles.whenBig}>{timeLabel(plan.at)}</Text><Text style={styles.whenLbl}>YOUR TIME</Text></View>
      </View>
      {plan.status === 'confirmed' && <Text style={[styles.chip, styles.ok]}>✓ Confirmed by both · reminder 1 hour before</Text>}
      {plan.status === 'cancelled' && <Text style={[styles.chip, styles.no]}>Called off by {plan.cancelledBy?.id === meId ? 'you' : plan.cancelledBy?.name}{plan.reason ? `: ${plan.reason}` : ''}</Text>}
      {plan.status === 'replaced' && <Text style={[styles.chip, styles.wait]}>A newer time was suggested</Text>}
      {plan.status === 'proposed' && mine && <Text style={[styles.chip, styles.wait]}>⏳ Waiting for {opp.name}</Text>}
      {open && !calling && (
        <View style={styles.row}>
          {plan.status === 'proposed' && !mine && <TouchableOpacity style={[styles.b, styles.bAcc]} onPress={() => act('accept')} disabled={!!busy}>
            <Text style={styles.bAccTxt}>{busy === 'accept' ? '…' : '✓ Accept'}</Text></TouchableOpacity>}
          <TouchableOpacity style={[styles.b, styles.bOth]} onPress={() => onOtherTime?.(plan.fixture)}><Text style={styles.bOthTxt}>Other time</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.b, styles.bCan]} onPress={() => setCalling(true)}><Text style={styles.bCanTxt}>Call off</Text></TouchableOpacity>
        </View>)}
      {calling && (
        <View style={{ gap: 6, marginTop: 8 }}>
          <TextInput style={styles.reason} placeholder="Reason (optional), e.g. working late" placeholderTextColor="#8a93a6" value={reason} onChangeText={setReason} maxLength={200} />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.b, styles.bCan]} onPress={() => act('cancel', { reason })} disabled={!!busy}><Text style={styles.bCanTxt}>{busy === 'cancel' ? '…' : 'Call off match'}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.b, styles.bOth]} onPress={() => setCalling(false)}><Text style={styles.bOthTxt}>Keep it</Text></TouchableOpacity>
          </View>
        </View>)}
    </View>
  );
}

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, maxHeight: '92%' },
  title: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  small: { color: C.muted, fontSize: 13 },
  empty: { color: C.muted, textAlign: 'center', paddingVertical: 10 },
  fx: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, backgroundColor: C.bg, gap: 2 },
  fxOn: { borderColor: C.orange, borderWidth: 2 },
  fxTitle: { color: C.fg, fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginTop: 6, borderLeftWidth: 5, borderLeftColor: '#ff7a00', minWidth: 240 },
  cardTitle: { color: '#0a1f44', fontWeight: '900', fontSize: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardSmall: { color: '#6b7488', fontSize: 12 },
  when: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  whenBox: { flex: 1, backgroundColor: '#f3f5f9', borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  whenBig: { color: '#ff6a00', fontWeight: '900', fontSize: 18 },
  whenLbl: { color: '#6b7488', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  chip: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', marginBottom: 6 },
  ok: { backgroundColor: '#e6f6ec', color: '#12803f' }, wait: { backgroundColor: '#fff3e0', color: '#c25a00' }, no: { backgroundColor: '#fdeaea', color: '#c9353b' },
  row: { flexDirection: 'row', gap: 6 },
  b: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  bAcc: { backgroundColor: '#12a150' }, bAccTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bOth: { backgroundColor: '#eef2fa' }, bOthTxt: { color: '#0a1f44', fontWeight: '800', fontSize: 13 },
  bCan: { backgroundColor: '#fdeaea' }, bCanTxt: { color: '#c9353b', fontWeight: '800', fontSize: 13 },
  reason: { borderWidth: 1, borderColor: '#dfe4ee', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: '#1b2233', backgroundColor: '#fff' },
}));
