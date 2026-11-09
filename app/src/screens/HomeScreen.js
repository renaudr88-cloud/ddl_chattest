// Main shell: bottom tabs + private chat overlay + member sheet. No navigation library needed.
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, Pressable } from 'react-native';
import { chat, useChat } from '../chat';
import { Btn, clock, showError } from '../components';
import { C, themed, useTheme, setTheme, THEMES, PALETTES } from '../theme';
import ChatScreen from './ChatScreen';
import MessagesScreen from './MessagesScreen';
import FriendliesScreen from './FriendliesScreen';
import SwapScreen from './SwapScreen';
import HelpScreen from './HelpScreen';
import AdminScreen from './AdminScreen';
import MemberSheet from './MemberSheet';

const TABS = [
  ['general', '#', 'General'],
  ['messages', '✉', 'Messages'],
  ['friendlies', '🎯', 'Friendlies'],
  ['swap', '⇄', 'Dartswap'],
  ['help', '?', 'Help'],
];

export default function HomeScreen() {
  const st = useChat();
  const [tab, setTab] = useState('general');
  const [dm, setDm] = useState(null);          // {room, other}
  const [admin, setAdmin] = useState(false);
  const [sheet, setSheet] = useState(null);    // user
  const [settings, setSettings] = useState(false);
  const theme = useTheme();

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
    try { const r = await chat.request('dm.open', { userId: user.id }); openDM(r.room, r.other); } catch (e) { showError(e); }
  };
  // onUser(user, true) jumps straight into a private chat; onUser(user) opens the player card
  const onUser = (user, direct) => (direct ? chatWith(user) : setSheet(user));
  const isAdmin = st.me?.role === 'admin';
  const unreadDMs = st.dms.filter(d => chat.unread(d)).length;
  const openHelp = st.help.filter(h => h.status === 'open').length;

  const headerRight = (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Text style={{ color: C.barMuted, fontSize: 12 }}>{st.online} online</Text>
      {isAdmin && <TouchableOpacity onPress={() => setAdmin(true)} style={styles.staffBtn}><Text style={styles.staffTxt}>STAFF</Text></TouchableOpacity>}
      <TouchableOpacity onPress={() => setSettings(true)} hitSlop={8} accessibilityLabel="Settings"><Text style={{ color: C.white, fontSize: 20 }}>⚙</Text></TouchableOpacity>
    </View>
  );

  let body;
  if (dm) body = <ChatScreen room={dm.room} title={dm.other.name} subtitle={dm.other.role === 'admin' ? 'Private chat · DDL staff' : 'Private chat'} onBack={() => { setDm(null); setTab('messages'); }} onUser={onUser} />;
  else if (admin) body = <AdminScreen onBack={() => setAdmin(false)} onUser={setSheet} />;
  else if (tab === 'general') body = <ChatScreen room="general" title="General chat" subtitle="Everything darts. Keep it friendly." onUser={onUser} right={headerRight} />;
  else if (tab === 'messages') body = <MessagesScreen onOpen={openDM} />;
  else if (tab === 'friendlies') body = <FriendliesScreen onOpenDM={openDM} onUser={onUser} />;
  else if (tab === 'swap') body = <SwapScreen onUser={onUser} />;
  else body = <HelpScreen onOpenDM={openDM} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.navy }}>
      <View style={{ flex: 1 }}>{body}</View>
      {!dm && !admin && (
        <View style={styles.tabs}>
          {TABS.map(([k, ic, label]) => {
            const badge = k === 'messages' ? unreadDMs : k === 'help' && isAdmin ? openHelp : 0;
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
      <Settings visible={settings} theme={theme} onClose={() => setSettings(false)} />
    </View>
  );
}

// Settings: app background (DDL blue or white) + log out. The choice is saved on the phone.
function Settings({ visible, theme, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>Settings</Text>
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
