// Tap any player: the player card (numbers from ddl-online.com: average, rankings, best checkout, league place,
// form, badges), private chat and a friendly challenge. Staff also see every action they can take on that player:
// group chats (Premier League, Raffle), moderation (mute / kick / ban), chat staff, and the website pages.
import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Linking, Image, TouchableOpacity } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { chat, useChat } from '../chat';
import { Avatar, Btn, ConfirmBtn, RoleTag, DartsmindName, toast, showError, s as ui } from '../components';
import { statusOf } from './AdminScreen';
import { ReportSheet, BlockButton } from './Report';
import { LOGIN_URL, TEST_MODE } from '../config';
import { C, themed } from '../theme';

const siteUrl = file => LOGIN_URL.replace('chat-login.php', file);

export default function MemberSheet({ user, onClose, onChat, onChallenge }) {
  const st = useChat();
  const [staff, setStaff] = useState(null);   // is this player chat staff (made by a DDL admin)?
  const [busy, setBusy] = useState('');
  const ddlUser = !!user && String(user.id).startsWith('ddl-');
  const ddlAdmin = !!st.me?.ddlAdmin && !!user && user.id !== st.me?.id && ddlUser;
  const [card, setCard] = useState(undefined);   // undefined = loading, null = not available
  const [report, setReport] = useState(null);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    setOnline(false);
    if (user?.id && user.id !== st.me?.id) chat.presence([user.id]).then(r => setOnline(!!r[user.id])).catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    setStaff(null);
    if (ddlAdmin) chat.request('staff.get', { userId: user.id }).then(r => setStaff(r.staff)).catch(() => {});
  }, [user?.id, ddlAdmin]);
  useEffect(() => {
    setCard(ddlUser && !TEST_MODE ? undefined : null);
    if (ddlUser && !TEST_MODE) chat.request('player.profile', { id: user.id }).then(r => setCard(r.profile)).catch(() => setCard(null));
  }, [user?.id, ddlUser]);
  if (!user) return null;
  const member = st.members.find(m => m.id === user.id) || user;
  const s = statusOf(member.sanction);
  const self = user.id === st.me?.id;
  const isStaffMe = st.me?.role === 'admin';
  const canMod = isStaffMe && !self && user.role !== 'admin';
  const siteId = ddlUser ? String(user.id).replace(/^ddl-/, '') : '';

  // Group chats (Dartsmind)
  const inPremier = (st.premier?.members || []).some(m => m.id === user.id);
  const raffle = (st.raffle?.requests || []).find(r => r.id === user.id);
  const raffleIn = raffle?.status === 'approved';

  const run = async (key, fn, done) => {
    setBusy(key);
    try { await fn(); if (done) toast(done); } catch (e) { showError(e); }
    setBusy('');
  };
  const copy = async name => {
    try { await Clipboard.setStringAsync(name); toast(`Copied: ${name}`); } catch { toast('Could not copy. Name: ' + name, true); }
  };

  const mod = async (action, minutes) => {
    try {
      const r = await chat.request('mod', { action, userId: user.id, minutes });
      chat.set(x => ({ members: x.members.map(m => m.id === user.id ? { ...m, sanction: r.sanction } : m) }));
      toast(`${user.name}: ${statusOf(r.sanction).label}`);
      onClose();
    } catch (e) { showError(e); }
  };

  const setRole = async on => {
    try {
      await chat.request('staff.set', { user: { id: user.id, name: user.name }, on });
      toast(on ? `${user.name} is now chat staff.` : `${user.name} is no longer chat staff.`);
      onClose();
    } catch (e) { showError(e); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.hero}>
            <View style={styles.heroAv}><Avatar user={user} size={70} online={online} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={[ui.row, { flexWrap: 'wrap' }]}><Text style={styles.name} numberOfLines={2}>{user.name}</Text><RoleTag user={user} /></View>
              <Text style={styles.heroSub} numberOfLines={1}>
                {[card?.countryName && flag(card.country) + ' ' + card.countryName, card?.hometown].filter(Boolean).join(' · ')
                  || (user.role === 'admin' ? 'DDL staff' : 'Player')}{online ? ' · 🟢 Online' : ''}{member.sanction ? ' · ' + s.label : ''}
              </Text>
              {!!card?.dartsmind && (
                <TouchableOpacity style={styles.dm} onPress={() => copy(card.dartsmind)} accessibilityLabel={'Copy Dartsmind name ' + card.dartsmind}>
                  <DartsmindName name={card.dartsmind} size={18} style={styles.dmTxt} /><Text style={styles.dmCopy}>Copy</Text>
                </TouchableOpacity>)}
            </View>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            {card === undefined && <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 8 }}>Loading stats from ddl-online.com…</Text>}
            {!!card && <PlayerStats card={card} />}
            {!self && <Btn kind="pri" title="💬 Private chat" onPress={() => onChat(user)} />}
            {!self && (onChallenge || card?.profileUrl) && (
              <View style={styles.grid}>
                {onChallenge && <Btn title="🤝 Challenge" style={styles.cell} loading={busy === 'ch'}
                  onPress={() => run('ch', () => onChallenge(user), `Challenge sent to ${user.name}.`)} />}
                {!!card?.profileUrl && <Btn title="👤 Full profile ↗" style={styles.cell} onPress={() => Linking.openURL(card.profileUrl)} />}
              </View>)}
            {self && !!card?.profileUrl && <Btn title="👤 My full profile ↗" onPress={() => Linking.openURL(card.profileUrl)} />}
            {!self && (
              <View style={styles.grid}>
                <Btn kind="danger" title="🚩 Report" style={styles.cell} onPress={() => setReport({ user: { id: user.id, name: user.name } })} />
                <BlockButton user={{ id: user.id, name: user.name }} style={styles.cell} />
              </View>)}

            {isStaffMe && !self && <>
              <Text style={styles.section}>Group chats · Dartsmind</Text>
              <View style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineTitle}>🏅 Premier League</Text>
                  <Text style={styles.lineSub}>{user.role === 'admin' ? 'Staff can always see it' : inPremier ? 'In the chat' : 'Not in the chat'}</Text>
                </View>
                {user.role !== 'admin' && (inPremier
                  ? <Btn small kind="danger" title="Remove" loading={busy === 'prem'}
                      onPress={() => run('prem', () => chat.request('premier.remove', { user: { id: user.id, name: user.name } }), `${user.name} removed from the Premier League chat.`)} />
                  : <Btn small kind="pri" title="Add" loading={busy === 'prem'}
                      onPress={() => run('prem', () => chat.request('premier.add', { user: { id: user.id, name: user.name } }), `${user.name} added to the Premier League chat.`)} />)}
              </View>
              <View style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineTitle}>🎟️ Raffles</Text>
                  <Text style={styles.lineSub}>{user.role === 'admin' ? 'Staff can always see it'
                    : raffleIn ? 'Has access' : raffle?.status === 'pending' ? 'Asked for access' : 'No access'}</Text>
                </View>
                {user.role !== 'admin' && (raffleIn
                  ? <Btn small kind="danger" title="Remove" loading={busy === 'raf'}
                      onPress={() => run('raf', () => chat.request('raffle.decide', { uid: user.id, status: 'removed' }), `${user.name} no longer has raffle access.`)} />
                  : <Btn small kind="pri" title={raffle?.status === 'pending' ? 'Approve' : 'Give access'} loading={busy === 'raf'}
                      onPress={() => run('raf', () => chat.request('raffle.grant', { user: { id: user.id, name: user.name } }), `${user.name} has raffle access.`)} />)}
              </View>
            </>}

            {canMod && <>
              <Text style={styles.section}>Moderation · all chats</Text>
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

            {ddlAdmin && staff !== null && <>
              <Text style={styles.section}>Chat staff</Text>
              {staff
                ? <ConfirmBtn title="Remove chat staff" confirmTitle={`Tap again: ${user.name} is no longer staff`} onConfirm={() => setRole(false)} />
                : user.role !== 'admin'
                  ? <ConfirmBtn title="Make chat staff" confirmTitle={`Tap again: make ${user.name} staff`} onConfirm={() => setRole(true)} />
                  : <Text style={styles.lineSub}>Admin on the DDL website: always staff in the chat.</Text>}
            </>}

            {st.me?.ddlAdmin && !self && siteId !== '' && <>
              <Text style={styles.section}>DDL website</Text>
              <Btn small title="Edit player on the website ↗" onPress={() => Linking.openURL(siteUrl('edit-player.php?id=' + siteId))} />
            </>}

            <Btn title="Close" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Modal>
  );
}

// 🇧🇪 from "be"; England/Scotland/Wales get their own flags.
function flag(cc) {
  if (!cc) return '';
  const sub = { 'gb-eng': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'gb-sct': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'gb-wls': '🏴󠁧󠁢󠁷󠁬󠁳󠁿' }[cc];
  if (sub) return sub;
  const c = cc.slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(x => 0x1F1E6 + x.charCodeAt(0) - 65)) : '';
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

function PlayerStats({ card }) {
  const tiles = [
    card.average != null && [card.average.toFixed(1), 'Average'],
    ...card.ranks.slice(0, 2).map(r => ['#' + r.pos, r.label]),
    card.bestCheckout && [String(card.bestCheckout), 'Best CO'],
  ].filter(Boolean).slice(0, 4);
  const lg = card.league;
  const c = card.career, rv = card.rivals, a = card.about || {};
  const about = [['🎯 Darts', a.darts], ['🎵 Walk-on', a.walkout], ['⭐ Favourite player', a.favourite], ['📅 Member since', a.since]].filter(x => x[1]);
  return <>
    {tiles.length > 0 && (
      <View style={styles.tiles}>
        {tiles.map(([v, l]) => (
          <View key={l} style={styles.tile}><Text style={styles.tileVal}>{v}</Text><Text style={styles.tileLbl}>{l}</Text></View>))}
      </View>)}
    {!!lg && (
      <View style={styles.league}>
        <Text style={{ fontSize: 22 }}>🏅</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.leagueName} numberOfLines={1}>{lg.name}{lg.group ? ' · ' + lg.group : ''}</Text>
          <Text style={styles.leagueSub} numberOfLines={1}>
            {[lg.season && 'Season ' + lg.season, lg.pts != null && lg.pts + ' pts', lg.diff != null && (lg.diff > 0 ? '+' + lg.diff : String(lg.diff))].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {lg.pos != null && <View style={{ alignItems: 'flex-end' }}><Text style={styles.leaguePos}>{ordinal(lg.pos)}</Text><Text style={styles.leagueSub}>of {lg.size}</Text></View>}
      </View>)}
    {!!c && (
      <View style={styles.career}>
        <Text style={[styles.section, { marginTop: 0 }]}>Career · DDL matches</Text>
        <View style={styles.tiles}>
          {[[c.matches, 'Matches'], [c.winPct != null ? c.winPct + '%' : '–', 'Win %'], [c.s180, '180s'], [c.streak, 'Best streak']].map(([v, l]) => (
            <View key={l} style={styles.tileSm}><Text style={styles.tileSmVal}>{v}</Text><Text style={styles.tileLbl}>{l}</Text></View>))}
        </View>
        <Text style={styles.leagueSub}>{c.wins} won · {c.matches - c.wins} lost · {c.s140} × 140+ · {c.s100} × 100+</Text>
      </View>)}
    {!!(rv?.nemesis || rv?.mostWins) && (
      <View style={styles.career}>
        {!!rv.nemesis && <Text style={styles.aboutLine}><Text style={styles.aboutKey}>😈 Nemesis  </Text>{rv.nemesis.name} ({rv.nemesis.w}-{rv.nemesis.l})</Text>}
        {!!rv.mostWins && <Text style={styles.aboutLine}><Text style={styles.aboutKey}>💪 Most wins vs  </Text>{rv.mostWins.name} ({rv.mostWins.w}-{rv.mostWins.l})</Text>}
      </View>)}
    {about.length > 0 && (
      <View style={styles.career}>
        {about.map(([k, v]) => <Text key={k} style={styles.aboutLine} numberOfLines={2}><Text style={styles.aboutKey}>{k}  </Text>{v}</Text>)}
      </View>)}
    {card.form.length > 0 && (
      <View style={styles.lineRow}>
        <Text style={[styles.section, { marginTop: 0 }]}>Form</Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {card.form.map((r, i) => <View key={i} style={[styles.form, { backgroundColor: r === 'W' ? '#16a34a' : '#dc2626' }]}><Text style={styles.formTxt}>{r}</Text></View>)}
        </View>
      </View>)}
    {card.badges.length > 0 && (
      <View style={styles.lineRow}>
        <Text style={[styles.section, { marginTop: 0 }]}>Badges</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', flex: 1, marginLeft: 12 }}>
          {card.badges.map(b => <Image key={b.img} source={{ uri: b.img }} style={{ width: 40, height: 40 }} accessibilityLabel={b.name} />)}
        </View>
      </View>)}
  </>;
}

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', maxHeight: '90%' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, paddingTop: 18, backgroundColor: C.navy2, borderBottomWidth: 3, borderBottomColor: C.orange },
  heroAv: { borderWidth: 3, borderColor: C.orange, borderRadius: 40, padding: 1 },
  name: { color: C.white, fontSize: 22, fontWeight: '900', textTransform: 'uppercase', flexShrink: 1 },
  heroSub: { color: C.barMuted, fontSize: 13, marginTop: 3 },
  dm: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 7, backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 4, maxWidth: '100%' },
  dmTxt: { color: C.white, fontSize: 13, flexShrink: 1 },
  dmCopy: { color: C.orangeSoft, fontSize: 13, fontWeight: '800' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 9, alignItems: 'center' },
  tileVal: { color: C.orange, fontSize: 21, fontWeight: '900' },
  tileLbl: { color: C.muted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 1 },
  league: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 11 },
  leagueName: { color: C.fg, fontSize: 14, fontWeight: '800' },
  leagueSub: { color: C.muted, fontSize: 12 },
  leaguePos: { color: C.orange, fontSize: 22, fontWeight: '900' },
  career: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 11, gap: 8 },
  tileSm: { flex: 1, alignItems: 'center' },
  tileSmVal: { color: C.fg, fontSize: 19, fontWeight: '900' },
  aboutLine: { color: C.fg, fontSize: 14 },
  aboutKey: { color: C.muted, fontWeight: '800' },
  lineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  form: { width: 21, height: 21, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  formTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  section: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 12, padding: 12 },
  lineTitle: { color: C.fg, fontSize: 15, fontWeight: '800' },
  lineSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { flexBasis: '47%', flexGrow: 1 },
}));
