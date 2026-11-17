// My DDL: my tournaments and leagues from ddl-online.com, in the app.
// Tournaments: check in, see my match, sign up (or join the reserve list) for open tournaments.
// Leagues: the table of my group and my matches still to play, with a button to message / plan with the opponent.
// Everything comes from php/chat-myddl.php; signing up and checking in run the website's own scripts there.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Modal, Pressable, TouchableOpacity, Linking, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { chat, useChat } from '../chat';
import { Header, Btn, Empty, RoomPicker, PlatformLogo, toast, showError, s as ui } from '../components';
import { platformInfo } from '../platforms';
import ResultSheet from './Result';
import { C, themed } from '../theme';

const site = path => Linking.openURL('https://ddl-online.com/' + path);
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const hm = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function when(ms) {
  const now = Date.now();
  if (sameDay(ms, now)) return 'Today ' + hm(ms);
  if (sameDay(ms, now + 86400000)) return 'Tomorrow ' + hm(ms);
  return new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function MyDDLScreen({ onOpenDM }) {
  const st = useChat();
  const data = st.myddl;
  const [part, setPart] = useState('tournaments');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [join, setJoin] = useState(null);     // tournament to confirm joining
  const [avg, setAvg] = useState(null);       // tournament waiting for an average screenshot
  const [busy, setBusy] = useState(null);     // id of the tournament being joined / checked in
  const [result, setResult] = useState(null); // my match whose result I am entering

  const load = async () => {
    setLoading(true); setError(null);
    try { await chat.request('myddl.get'); } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => {
    if (!data || Date.now() - data.at > 60_000) load();
    chat.pollMatches();
  }, []);

  const doJoin = async t => {
    setJoin(null); setBusy(t.id);
    try {
      const r = await chat.request('myddl.join', { id: t.id });
      if (r.needAvg) setAvg(t);
      else toast(r.message || 'Done.');
    } catch (e) { showError(e); }
    setBusy(null);
  };
  const checkIn = async t => {
    setBusy(t.id);
    try { const r = await chat.request('myddl.checkin', { id: t.id }); toast(r.message || 'Checked in.'); } catch (e) { showError(e); }
    setBusy(null);
  };
  const message = async (other, platform = 'dartsmind') => {
    try { const r = await chat.request('dm.player', { id: other.id, platform }); onOpenDM(r.room, { ...r.other, ...other }); }
    catch (e) { showError(e); }
  };

  const due = (st.checkinDue || []).length;
  const mine = data?.tournaments.mine || [];
  const open = (data?.tournaments.open || []).filter(t => t.platform === st.platform);
  const matches = st.myMatches || [];
  const here = platformInfo(st.platform);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="My DDL" subtitle="Your tournaments and leagues on ddl-online.com"
        right={<TouchableOpacity onPress={load} style={{ padding: 6 }} accessibilityLabel="Refresh">
          {loading ? <ActivityIndicator color={C.orange} /> : <Text style={{ color: C.white, fontSize: 20 }}>↻</Text>}</TouchableOpacity>} />
      <RoomPicker rooms={[['tournaments', '🏆 Tournaments', due], ['leagues', '🛡 Leagues', 0]]} value={part} onChange={setPart} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 }}>
        {!data && (error ? <View style={ui.card}><Text style={{ color: C.fg }}>{error}</Text><Btn kind="pri" title="Try again" onPress={load} /></View>
          : <ActivityIndicator color={C.orange} size="large" style={{ marginTop: 40 }} />)}

        {data && part === 'tournaments' && <>
          {matches.map(m => (
            <View key={m.match} style={styles.matchCard}>
              <Text style={styles.kicker}>🎯 YOUR MATCH IS READY</Text>
              <Text style={styles.matchVs}>vs {m.opponent.name}</Text>
              <Text style={styles.cardSub}>{m.tournament}{m.round ? ` · Round ${m.round}` : ''}</Text>
              <View style={ui.row}>
                <Btn kind="pri" title="📷 Enter result" onPress={() => setResult(m)} style={{ flexGrow: 1 }} />
                <Btn title={`💬 Message`} onPress={() => message(m.opponent, m.platform)} style={{ flexGrow: 1 }} />
              </View>
            </View>))}

          <Text style={[ui.section, { marginTop: 4, marginBottom: 0 }]}>My tournaments</Text>
          {mine.length ? mine.map(t => <MyTournament key={t.id} t={t} busy={busy === t.id} onCheckIn={() => checkIn(t)} />)
            : <Empty text="You are not in a tournament yet. Pick one below." />}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <PlatformLogo platform={here} size={20} />
            <Text style={[ui.section, { margin: 0 }]}>Join a {here.name} tournament</Text>
          </View>
          {open.length ? open.map(t => <OpenTournament key={t.id} t={t} busy={busy === t.id} onJoin={() => setJoin(t)} />)
            : <Empty text={`No open ${here.name} tournaments right now.`} />}
        </>}

        {data && part === 'leagues' && <>
          {data.leagues.length ? data.leagues.map(l => <League key={l.id + l.group} l={l} onMessage={o => message(o)} />)
            : <View style={ui.card}>
              <Text style={{ color: C.fg, fontWeight: '800', fontSize: 16 }}>You are not in a league right now</Text>
              <Text style={{ color: C.muted }}>Leagues are played on Dartsmind, one match a week against the players in your group.</Text>
              <Btn kind="pri" title="How to join a league" onPress={() => site('league-explained.php')} />
            </View>}
        </>}
      </ScrollView>

      <JoinSheet t={join} onClose={() => setJoin(null)} onConfirm={() => doJoin(join)} />
      {result && <ResultSheet m={result} onClose={() => setResult(null)} />}
      <AvgSheet t={avg} onClose={() => setAvg(null)} onDone={() => { const t = avg; setAvg(null); doJoin(t); }} />
    </View>
  );
}

function MyTournament({ t, busy, onCheckIn }) {
  const needs = t.checkInOpen && !t.checkedIn && !t.started;
  let status;
  if (t.started) status = <Text style={[styles.status, { color: C.orange }]}>🔥 The tournament has started</Text>;
  else if (t.checkedIn) status = <Text style={[styles.status, { color: C.ok }]}>✅ Checked in{t.role === 'reserve' ? ' as a reserve' : ''}</Text>;
  else if (needs) status = <View style={styles.alert}>
    <Text style={styles.alertHead}>⚠ CHECK-IN REQUIRED</Text>
    <Text style={styles.alertTxt}>You will NOT play unless you check in{t.checkInCloses ? ` before ${hm(t.checkInCloses)}` : ''}.</Text>
  </View>;
  else status = <Text style={styles.statusMuted}>🔒 Check-in opens {sameDay(t.checkInOpens, Date.now()) ? 'at ' + hm(t.checkInOpens) : when(t.checkInOpens)}</Text>;
  return (
    <View style={[ui.card, needs && { borderColor: C.orange, borderWidth: 2 }]}>
      <View style={styles.topRow}>
        <PlatformLogo platform={platformInfo(t.platform)} size={22} />
        <Text style={styles.cardTitle} numberOfLines={2}>{t.name}</Text>
        <View style={[styles.role, t.role === 'reserve' && { backgroundColor: C.warn }]}><Text style={styles.roleTxt}>{t.role === 'reserve' ? 'RESERVE' : 'PLAYER'}</Text></View>
      </View>
      <Text style={styles.line}>📅 {when(t.start)}   👥 {t.players}/{t.max}{t.reserves ? ` · ${t.reserves} reserves` : ''}</Text>
      {status}
      <View style={ui.row}>
        {needs && <Btn kind="pri" title="✅ Check in now" loading={busy} onPress={onCheckIn} style={{ flexGrow: 1 }} />}
        <Btn small={needs} title={t.started ? '🏆 View bracket' : 'Details'} onPress={() => Linking.openURL(t.started ? t.bracket : t.url)} style={!needs && { flexGrow: 1 }} />
      </View>
    </View>
  );
}

function OpenTournament({ t, busy, onJoin }) {
  return (
    <View style={ui.card}>
      <Text style={styles.cardTitle}>{t.name}</Text>
      <Text style={styles.line}>📅 {when(t.start)}</Text>
      <Text style={styles.line}>🎯 {t.format}{t.minAvg != null || t.maxAvg != null ? ` · avg ${t.minAvg ?? 0}–${t.maxAvg ?? '∞'}` : ''}   👥 {t.players}/{t.max}{t.reserves ? ` · ${t.reserves} reserves` : ''}</Text>
      {t.opens ? <Text style={styles.statusMuted}>🔒 Registration opens {when(t.opens)}</Text>
        : <View style={ui.row}>
          <Btn kind="pri" title={t.full ? '⏳ Join reserve list' : '➕ Join'} loading={busy} onPress={onJoin} style={{ flexGrow: 1 }} />
          <Btn small title="Details" onPress={() => Linking.openURL(t.url)} />
        </View>}
      {!t.opens && t.full && <Text style={styles.statusMuted}>Full. Reserves who check in move up when a place opens.</Text>}
    </View>
  );
}

function League({ l, onMessage }) {
  const planTxt = p => !p ? 'Not planned yet'
    : p.status === 'confirmed' ? `📅 ${when(p.at)} · confirmed`
    : p.status === 'proposed' ? `📅 ${when(p.at)} · waiting for an answer` : 'Not planned yet';
  return (
    <View style={ui.card}>
      <View>
        <Text style={styles.cardTitle}>{l.name}</Text>
        <Text style={styles.cardSub}>{[l.season, l.group && 'Group ' + l.group].filter(Boolean).join(' · ')}</Text>
      </View>
      <View style={styles.table}>
        <View style={[styles.tr, styles.th]}>
          <Text style={[styles.td, styles.pos, styles.thTxt]}>#</Text>
          <Text style={[styles.td, styles.name, styles.thTxt]}>Player</Text>
          {['P', 'W', ...(l.draws ? ['D'] : []), 'L', '+/-'].map(h => <Text key={h} style={[styles.td, styles.num, styles.thTxt]}>{h}</Text>)}
          <Text style={[styles.td, styles.num, styles.thTxt]}>Pts</Text>
        </View>
        {l.table.map(r => (
          <View key={r.id} style={[styles.tr, r.me && styles.meRow]}>
            <Text style={[styles.td, styles.pos, { color: C.muted }]}>{r.pos}</Text>
            <Text style={[styles.td, styles.name, r.me && { color: C.orangeSoft, fontWeight: '900' }]} numberOfLines={1}>{r.name}{r.me ? ' (you)' : ''}</Text>
            {[r.p, r.w, ...(l.draws ? [r.d] : []), r.l].map((v, i) => <Text key={i} style={[styles.td, styles.num]}>{v}</Text>)}
            <Text style={[styles.td, styles.num, { color: r.diff > 0 ? C.ok : r.diff < 0 ? C.bad : C.muted }]}>{r.diff > 0 ? '+' + r.diff : r.diff}</Text>
            <Text style={[styles.td, styles.num, { color: C.fg, fontWeight: '900' }]}>{r.pts}</Text>
          </View>))}
      </View>
      <Text style={[ui.section, { marginTop: 4, marginBottom: 0 }]}>Your matches to play</Text>
      {l.fixtures.length ? l.fixtures.map(f => (
        <View key={f.fixture} style={styles.fixture}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fixVs}>Week {f.week} · vs {f.opponent.name}</Text>
            <Text style={[styles.fixPlan, f.plan?.status === 'confirmed' && { color: C.ok }]}>{planTxt(f.plan)}</Text>
          </View>
          <Btn small kind="pri" title="💬 Message / plan" onPress={() => onMessage(f.opponent)} />
        </View>))
        : <Text style={{ color: C.muted }}>All your matches are played. 👏</Text>}
      <Btn small title="Full league on ddl-online.com ›" onPress={() => Linking.openURL(l.url)} />
    </View>
  );
}

// Same rules as the website's "IMPORTANT – Please Read Before Joining".
function JoinSheet({ t, onClose, onConfirm }) {
  return (
    <Modal visible={!!t} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }}>
            <Text style={styles.sheetTitle}>{t?.full ? 'Join the reserve list' : 'Join tournament'}</Text>
            <Text style={styles.cardTitle}>{t?.name}</Text>
            <Text style={styles.line}>📅 {t && when(t.start)}</Text>
            <Text style={styles.ruleHead}>Please read before joining</Text>
            <Text style={styles.rule}>• Check-in opens 2½ hours before the start. Check in here in My DDL (or on ddl-online.com).</Text>
            <Text style={styles.rule}>• Check-in closes and the brackets are drawn 30 minutes before the start. Not checked in = removed from the tournament.</Text>
            <Text style={styles.rule}>• Can't make it? Tell an admin as soon as possible.</Text>
            <Text style={styles.rule}>• No check-in and no message = a strike. Every 3 strikes is a 7-day ban from tournaments.</Text>
            {t?.full && <Text style={styles.rule}>• The tournament is full: reserves who check in move up when a place opens.</Text>}
            <Text style={{ color: C.muted, fontSize: 13 }}>By tapping {t?.full ? 'Join reserve list' : 'Join'}, you accept these guidelines.</Text>
            <View style={ui.row}>
              <Btn title="Cancel" onPress={onClose} />
              <Btn kind="pri" title={t?.full ? 'Join reserve list' : 'Join tournament'} onPress={onConfirm} style={{ flexGrow: 1 }} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Average older than 7 days: a Dartsmind screenshot (RECENT 100 tab), checked by the website.
function AvgSheet({ t, onClose, onDone }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (t) { setImg(null); setMsg(null); } }, [t?.id]);
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (!r.canceled && r.assets?.[0]) { setImg(r.assets[0]); setMsg(null); }
  };
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await chat.request('myddl.avg', { uri: img.uri, name: img.fileName || 'screenshot.jpg', type: img.mimeType || 'image/jpeg' });
      toast(r.message || 'Average updated.');
      onDone();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <Modal visible={!!t} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }}>
            <Text style={styles.sheetTitle}>Verify your average</Text>
            <Text style={{ color: C.fg, lineHeight: 21 }}>Your average was last checked more than 7 days ago. Upload a screenshot of your Dartsmind stats with the <Text style={{ fontWeight: '900' }}>RECENT 100</Text> tab selected. Then we sign you up for {t?.name}.</Text>
            {img && <Image source={{ uri: img.uri }} style={{ width: '100%', height: 220, borderRadius: 10, backgroundColor: C.bg }} resizeMode="contain" />}
            {!!msg && <Text style={styles.err}>{msg}</Text>}
            <Btn title={img ? '🖼 Choose another screenshot' : '🖼 Choose screenshot'} onPress={pick} />
            <Btn kind="pri" title="Upload & verify" disabled={!img} loading={busy} onPress={send} />
            <Btn kind="ghost" title="Cancel" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(C => ({
  kicker: { color: C.orange, fontWeight: '900', fontSize: 12, letterSpacing: 1.5 },
  matchCard: { backgroundColor: C.navy2, borderRadius: 16, padding: 14, gap: 6, borderLeftWidth: 4, borderLeftColor: C.orange },
  matchVs: { color: C.white, fontSize: 22, fontWeight: '900' },
  cardTitle: { color: C.fg, fontSize: 17, fontWeight: '900', flexShrink: 1 },
  cardSub: { color: C.muted, fontSize: 13 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  role: { marginLeft: 'auto', backgroundColor: C.navy2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  roleTxt: { color: C.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  line: { color: C.muted, fontSize: 14 },
  status: { fontWeight: '800', fontSize: 15 },
  statusMuted: { color: C.muted, fontWeight: '700', fontSize: 13 },
  alert: { backgroundColor: 'rgba(224,82,82,0.12)', borderRadius: 10, padding: 10, gap: 2 },
  alertHead: { color: C.bad, fontWeight: '900', fontSize: 14 },
  alertTxt: { color: C.bad, fontSize: 13, fontWeight: '600' },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.line },
  th: { backgroundColor: C.navy, borderTopWidth: 0 },
  thTxt: { color: C.barMuted, fontWeight: '800', fontSize: 11 },
  meRow: { backgroundColor: 'rgba(251,88,1,0.12)' },
  td: { color: C.fg, fontSize: 14 },
  pos: { width: 22, fontWeight: '800' },
  name: { flex: 1, paddingRight: 4 },
  num: { width: 30, textAlign: 'center' },
  fixture: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: C.line },
  fixVs: { color: C.fg, fontWeight: '800', fontSize: 15 },
  fixPlan: { color: C.muted, fontSize: 13, marginTop: 2 },
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '90%' },
  sheetTitle: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  ruleHead: { color: C.bad, fontWeight: '900', marginTop: 6 },
  rule: { color: C.fg, fontSize: 14, lineHeight: 20 },
  err: { color: C.bad, fontWeight: '700' },
}));
