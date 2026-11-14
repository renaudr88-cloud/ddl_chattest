// Main shell: bottom tabs + private chat overlay + member sheet. No navigation library needed.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, Pressable, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { chat, useChat, listHere, RAFFLE_PLATFORM, mentionCount } from '../chat';
import { PLATFORMS, platformInfo } from '../platforms';
import { Btn, Header, clock, showError, toast, PlatformLogo, RoomPicker } from '../components';
import { RaffleGate, RaffleStaffBar } from './Raffle';
import { C, themed, useTheme, setTheme, THEMES, PALETTES } from '../theme';
import ChatScreen from './ChatScreen';
import MessagesScreen from './MessagesScreen';
import FriendliesScreen from './FriendliesScreen';
import SwapScreen from './SwapScreen';
import HelpScreen from './HelpScreen';
import AdminScreen from './AdminScreen';
import MemberSheet from './MemberSheet';

const TABS = [
  ['chat', '#', 'Chat'],
  ['messages', '✉', 'Messages'],
  ['friendlies', '🎯', 'Friendlies'],
  ['swap', '⇄', 'Dartswap'],
  ['help', '?', 'Help'],
];

export default function HomeScreen() {
  const st = useChat();
  const [tab, setTab] = useState('chat');
  const [room, setRoom] = useState('general');  // chat tab: general | tournament | raffle
  const [dm, setDm] = useState(null);          // {room, other}
  const [admin, setAdmin] = useState(false);
  const [sheet, setSheet] = useState(null);    // user
  const [settings, setSettings] = useState(false);
  const theme = useTheme();

  // Opened from the brackets on ddl-online.com: ...web.app/?dm=<player id>  → private chat with that player.
  useEffect(() => {
    const go = url => {
      const m = /[?&]dm=(\d+)/.exec(url || '');
      if (!m) return;
      const p = /[?&]p=([a-z]+)/.exec(url)?.[1];
      if (Platform.OS === 'web') { try { window.history.replaceState(null, '', window.location.pathname); } catch {} }
      if (p && PLATFORMS.some(x => x.key === p)) chat.setPlatform(p);
      chat.requestHere('dm.player', { id: m[1], ...(p ? { platform: p } : {}) })
        .then(r => { setSheet(null); setAdmin(false); setDm(r); }).catch(showError);
    };
    Linking.getInitialURL().then(go).catch(() => {});
    const sub = Linking.addEventListener('url', e => go(e.url));
    return () => sub.remove();
  }, []);

  if (st.blocked) {
    const banned = st.blocked.reason === 'banned';
    return (
      <View style={styles.gate}>
        <Image source={require('../../assets/ddl-logo.png')} style={{ width: 88, height: 88, borderRadius: 14 }} />
        <Text style={styles.gateTitle}>{banned ? 'You are banned' : 'You were kicked'}</Text>
        <Text style={styles.gateTxt}>{banned ? 'An admin has banned this account from the DDL chat. Contact DDL staff if you think this is a mistake.'
          : `An admin removed you from the chat. You can come back at ${clock(st.blocked.until)}.`}</Text>
        {!banned && <Btn kind="pri" title="Try again" onPress={() => { chat.set({ blocked: null }); chat.connect(); }} />}
        <Btn title="Log out" onPress={() => chat.logout()} />
      </View>
    );
  }

  const openDM = (room, other) => { setSheet(null); setAdmin(false); setDm({ room, other }); };
  const chatWith = async user => {
    try { const r = await chat.requestHere('dm.open', { userId: user.id }); openDM(r.room, r.other); } catch (e) { showError(e); }
  };
  // onUser(user, true) jumps straight into a private chat; onUser(user) opens the player card
  const onUser = (user, direct) => (direct ? chatWith(user) : setSheet(user));
  const isAdmin = st.me?.role === 'admin';
  const here = platformInfo(st.platform);
  // Per platform: unread private chats, and open help questions for staff
  const unreadOn = p => st.dms.filter(d => d.platform === p && chat.unread(d)).length;
  const openHelpOn = p => isAdmin ? (st.help[p] || []).filter(h => h.status === 'open').length : 0;
  const unreadDMs = unreadOn(st.platform);
  const openHelp = openHelpOn(st.platform);
  const switchPlatform = p => { setDm(null); chat.setPlatform(p); };

  const headerRight = (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Text style={{ color: C.barMuted, fontSize: 12 }}>{st.online} online</Text>
      {isAdmin && <TouchableOpacity onPress={() => setAdmin(true)} style={styles.staffBtn}><Text style={styles.staffTxt}>STAFF</Text></TouchableOpacity>}
      <TouchableOpacity onPress={() => setSettings(true)} hitSlop={8} accessibilityLabel="Settings"><Text style={{ color: C.white, fontSize: 20 }}>⚙</Text></TouchableOpacity>
    </View>
  );

  let body;
  if (dm) body = <ChatScreen room={dm.room} title={dm.other.name} subtitle={`Private chat · ${platformInfo(dm.room.split(':')[1]).name}${dm.other.role === 'admin' ? ' · DDL staff' : ''}`} onBack={() => { setDm(null); setTab('messages'); }} onUser={onUser}
    below={dm.room.split(':')[1] === 'dartsmind' && <DartsmindBar other={dm.other} />} />;
  else if (admin) body = <AdminScreen onBack={() => setAdmin(false)} onUser={setSheet} />;
  else if (tab === 'chat') {
    const hasRaffle = st.platform === RAFFLE_PLATFORM;
    const r = room === 'raffle' && !hasRaffle ? 'general' : room;
    const pendingRaffle = isAdmin ? (st.raffle?.requests || []).filter(x => x.status === 'pending').length : 0;
    const tags = k => mentionCount(st, `${k}:${st.platform}`);
    const rooms = [['general', 'General', tags('general')], ['tournament', 'Tournament', tags('tournament')],
      ...(hasRaffle ? [['raffle', '🔒 Raffles', pendingRaffle + tags('raffle')]] : [])];
    const info = {
      general: ['General chat', `${here.name} community. Keep it friendly.`],
      tournament: ['Tournament', `${here.name} tournaments: draws, results, who plays next.`],
      raffle: ['Raffles', 'Dartsmind raffles, for approved players.'],
    }[r];
    const picker = <RoomPicker rooms={rooms} value={r} onChange={setRoom} />;
    if (r === 'raffle' && !isAdmin && st.raffle?.status !== 'approved') {
      body = <RaffleGate header={<><Header title={info[0]} subtitle={info[1]} right={headerRight} />{picker}</>} />;
    } else {
      body = <ChatScreen key={r + st.platform} room={`${r}:${st.platform}`} title={info[0]} subtitle={info[1]} onUser={onUser} right={headerRight}
        below={<>{picker}{r === 'raffle' && isAdmin && <RaffleStaffBar />}
          {r === 'tournament' && st.platform === 'dartsmind' && <MyMatches onOpen={openDM} />}</>} />;
    }
  }
  else if (tab === 'messages') body = <MessagesScreen onOpen={openDM} />;
  else if (tab === 'friendlies') body = <FriendliesScreen onOpenDM={openDM} onUser={onUser} />;
  else if (tab === 'swap') body = <SwapScreen onUser={onUser} />;
  else body = <HelpScreen onOpenDM={openDM} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.navy }}>
      {!admin && (
        <View style={styles.platBar} accessibilityRole="tablist">
          {PLATFORMS.map(p => {
            const on = st.platform === p.key;
            const dot = !on && (unreadOn(p.key) + openHelpOn(p.key)) > 0;
            return (
              <TouchableOpacity key={p.key} onPress={() => switchPlatform(p.key)} style={[styles.plat, on && styles.platOn]}
                accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={p.name}>
                <PlatformLogo platform={p} size={24} />
                <Text style={[styles.platTxt, on && { color: C.white }]}>{p.name}</Text>
                {dot && <View style={styles.platDot} />}
              </TouchableOpacity>);
          })}
        </View>
      )}
      <View style={{ flex: 1 }}>{body}</View>
      {!dm && !admin && (
        <View style={styles.tabs}>
          {TABS.map(([k, ic, label]) => {
            const badge = k === 'messages' ? unreadDMs + (st.noticesUnread || 0) : k === 'help' && isAdmin ? openHelp
              : k === 'chat' ? (isAdmin ? (st.raffle?.requests || []).filter(x => x.status === 'pending').length : 0)
                + ['general', 'tournament', 'raffle'].reduce((n, r) => n + mentionCount(st, `${r}:${st.platform}`), 0) : 0;
            const on = tab === k;
            return (
              <TouchableOpacity key={k} style={styles.tab} onPress={() => setTab(k)} accessibilityLabel={label}>
                <Text style={[styles.tabIc, on && { color: C.orange }]}>{ic}</Text>
                <Text style={[styles.tabTxt, on && { color: C.white }]}>{label}</Text>
                {badge > 0 && <View style={styles.badge}><Text style={styles.badgeTxt}>{badge}</Text></View>}
              </TouchableOpacity>);
          })}
        </View>
      )}
      {sheet && <MemberSheet user={sheet} onClose={() => setSheet(null)} onChat={chatWith} />}
      <Settings visible={settings} theme={theme} me={st.me} onClose={() => setSettings(false)} onModeration={() => { setSettings(false); setAdmin(true); }} />
    </View>
  );
}

// Tournament chat: "Your match: vs ..." for every open match of mine in the brackets on ddl-online.com,
// with a button straight to a private chat (where the Dartsmind name is ready to copy).
function MyMatches({ onOpen }) {
  const st = useChat();
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!st.me?.id?.startsWith('ddl-')) return;
    const load = () => chat.request('matches.mine').then(r => setList(r.list)).catch(() => {});
    load();
    const t = setInterval(load, 2 * 60_000);
    return () => clearInterval(t);
  }, [st.me?.id]);
  const open = async m => {
    try { const r = await chat.request('dm.player', { id: m.opponent.id, platform: 'dartsmind' }); onOpen(r.room, { ...r.other, ...m.opponent }); }
    catch (e) { showError(e); }
  };
  return list.map(m => (
    <View key={m.match} style={styles.match}>
      <View style={{ flex: 1 }}>
        <Text style={styles.matchSub} numberOfLines={1}>🏆 {m.tournament}{m.round ? ` · Round ${m.round}` : ''}</Text>
        <Text style={styles.matchTxt} numberOfLines={1}>Your match: vs <Text style={{ fontWeight: '900' }}>{m.opponent.name}</Text></Text>
      </View>
      <TouchableOpacity onPress={() => open(m)} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel={'Message ' + m.opponent.name}>
        <Text style={styles.copyTxt}>Message</Text>
      </TouchableOpacity>
    </View>));
}

// Private chat on Dartsmind: the other player's Dartsmind name, ready to copy (to invite them in Dartsmind).
function DartsmindBar({ other }) {
  const [name, setName] = useState(other.dartsmind);
  useEffect(() => {
    if (name !== undefined || !String(other.id).startsWith('ddl-')) return;
    chat.request('player.get', { id: other.id }).then(r => setName(r.user.dartsmind || null)).catch(() => setName(null));
  }, [other.id]);
  if (!name) return null;
  const copy = async () => {
    try { await Clipboard.setStringAsync(name); toast(`Copied: ${name}`); } catch { toast('Could not copy. Name: ' + name, true); }
  };
  return (
    <View style={styles.dmBar}>
      <Text style={styles.dmBarTxt} numberOfLines={1}>🎯 Dartsmind: <Text style={{ fontWeight: '900' }}>{name}</Text></Text>
      <TouchableOpacity onPress={copy} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel={'Copy Dartsmind name ' + name}>
        <Text style={styles.copyTxt}>Copy</Text>
      </TouchableOpacity>
    </View>
  );
}

// Settings: app background (DDL blue or white) + log out. The choice is saved on the phone.
function Settings({ visible, theme, me, onClose, onModeration }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>Settings</Text>
          <Text style={{ color: C.muted, fontSize: 14 }}>
            Logged in as <Text style={{ color: C.fg, fontWeight: '800' }}>{me?.name}</Text>
            {me?.role === 'admin' ? ' · DDL staff' : ' · player'}
          </Text>
          {me?.role === 'admin' && <Btn kind="pri" title="Moderation (mute, kick, ban)" onPress={onModeration} />}
          <Text style={styles.label}>App background</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {THEMES.map(([key, label]) => {
              const p = PALETTES[key], on = theme === key;
              return (
                <TouchableOpacity key={key} onPress={() => setTheme(key)} style={[styles.option, on && styles.optionOn]}
                  accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}>
                  <View style={[styles.swatch, { backgroundColor: p.bg, borderColor: p.line }]}>
                    <View style={{ height: 12, backgroundColor: p.navy, borderBottomWidth: 2, borderBottomColor: p.orange }} />
                    <View style={[styles.swBubble, { backgroundColor: p.bubble }]} />
                    <View style={[styles.swBubble, { backgroundColor: p.mine, alignSelf: 'flex-end', width: '45%' }]} />
                  </View>
                  <Text style={[styles.optionTxt, on && { color: C.orangeSoft }]}>{on ? '● ' : ''}{label}</Text>
                </TouchableOpacity>);
            })}
          </View>
          <Btn title="Log out" onPress={() => { onClose(); chat.logout(); }} />
          <Btn title="Close" kind="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(C => ({
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.orange + '22', borderBottomWidth: 1, borderBottomColor: C.orange },
  matchSub: { color: C.muted, fontSize: 12 },
  matchTxt: { color: C.fg, fontSize: 15 },
  dmBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.navy2 },
  dmBarTxt: { color: C.white, fontSize: 14, flex: 1 },
  copyBtn: { backgroundColor: C.orange, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  copyTxt: { color: C.white, fontWeight: '900', fontSize: 13 },
  platBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: C.navy },
  plat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  platOn: { borderColor: C.orange, backgroundColor: C.navy2 },
  platTxt: { color: C.barMuted, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  platDot: { position: 'absolute', top: 6, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: C.orange },
  tabs: { flexDirection: 'row', backgroundColor: C.navy, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  tabIc: { color: C.barMuted, fontSize: 18, fontWeight: '900' },
  tabTxt: { color: C.barMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  badge: { position: 'absolute', top: 2, right: '22%', backgroundColor: C.orange, borderRadius: 9, minWidth: 18, paddingHorizontal: 5, alignItems: 'center' },
  badgeTxt: { color: C.white, fontSize: 11, fontWeight: '800' },
  staffBtn: { backgroundColor: C.orange, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  staffTxt: { color: C.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34, gap: 14 },
  sheetTitle: { color: C.fg, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  label: { color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  option: { flex: 1, borderWidth: 2, borderColor: C.line, borderRadius: 14, padding: 10, gap: 8, alignItems: 'center' },
  optionOn: { borderColor: C.orange },
  optionTxt: { color: C.fg, fontWeight: '700' },
  swatch: { width: '100%', height: 84, borderRadius: 8, borderWidth: 1, overflow: 'hidden', gap: 6 },
  swBubble: { height: 14, width: '60%', borderRadius: 7, marginHorizontal: 8 },
  gate: { flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  gateTitle: { color: C.white, fontSize: 28, fontWeight: '900', textTransform: 'uppercase' },
  gateTxt: { color: C.barMuted, textAlign: 'center', fontSize: 15, lineHeight: 22 },
}));
