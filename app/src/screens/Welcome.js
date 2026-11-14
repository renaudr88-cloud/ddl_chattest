// Shown once after the first login (and again via Settings → How the chat works): 3 short steps.
import { useState } from 'react';
import { View, Text, Image, Modal, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn } from '../components';
import { C, themed } from '../theme';

const KEY = 'ddl-chat-welcome-1';
export const welcomeSeen = () => AsyncStorage.getItem(KEY).then(v => !!v).catch(() => true);

const STEPS = [
  { icon: '👋', title: 'Welcome to DDL Chat', lines: [
    ['🎯', 'Dartsmind and Scolia each have their own chats. Switch at the top.'],
    ['💬', 'General chat for everyone, Tournament chat for match day, Raffles for approved players.'],
    ['🙂', 'Keep it friendly: bad words are blocked and staff can mute, kick or ban.'],
  ] },
  { icon: '🏆', title: 'Tournaments', lines: [
    ['🏆', 'In the Tournament chat you always see the open tournaments. Tap Sign up to join on ddl-online.com.'],
    ['⚔️', 'When your match is ready, "Your match: vs …" appears. Tap Message to talk to your opponent.'],
    ['📋', 'In a private chat you see your opponent\'s Dartsmind name. Tap Copy to invite them.'],
  ] },
  { icon: '✨', title: 'Handy tips', lines: [
    ['👆', 'Tap a player\'s name for a private chat.'],
    ['@', 'Type @ and a name to tag someone.'],
    ['✋', 'Hold a message to react 👍 🎯 🔥 or to reply.'],
    ['🔔', 'Messages → DDL notifications: your notifications from the website.'],
    ['🎯', 'Friendlies: post a card, it stays 15 minutes.'],
  ] },
];

export default function Welcome({ visible, onClose }) {
  const [i, setI] = useState(0);
  const done = () => { AsyncStorage.setItem(KEY, '1').catch(() => {}); setI(0); onClose(); };
  const step = STEPS[i], last = i === STEPS.length - 1;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={done}>
      <View style={styles.wrap}>
        <TouchableOpacity onPress={done} style={styles.skip} hitSlop={10} accessibilityRole="button"><Text style={styles.skipTxt}>Skip</Text></TouchableOpacity>
        <ScrollView contentContainerStyle={styles.body}>
          {i === 0 ? <Image source={require('../../assets/ddl-logo.png')} style={{ width: 96, height: 96, borderRadius: 18 }} />
            : <Text style={{ fontSize: 56 }}>{step.icon}</Text>}
          <Text style={styles.title}>{step.title}</Text>
          {step.lines.map(([ic, t], k) => (
            <View key={k} style={styles.line}>
              <Text style={styles.lineIc}>{ic}</Text>
              <Text style={styles.lineTxt}>{t}</Text>
            </View>))}
        </ScrollView>
        <View style={styles.dots}>{STEPS.map((_, k) => <View key={k} style={[styles.dot, k === i && styles.dotOn]} />)}</View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {i > 0 && <Btn title="Back" onPress={() => setI(i - 1)} style={{ flex: 1 }} />}
          <Btn kind="pri" title={last ? "Let's go" : 'Next'} onPress={() => (last ? done() : setI(i + 1))} style={{ flex: 2 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(C => ({
  wrap: { flex: 1, backgroundColor: C.navy, padding: 22, paddingTop: 40, paddingBottom: 30 },
  skip: { alignSelf: 'flex-end' },
  skipTxt: { color: C.barMuted, fontSize: 15, fontWeight: '700' },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 20 },
  title: { color: C.white, fontSize: 26, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center' },
  line: { flexDirection: 'row', gap: 12, alignSelf: 'stretch', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12 },
  lineIc: { fontSize: 22, width: 30, textAlign: 'center', color: C.orange, fontWeight: '900' },
  lineTxt: { color: C.white, fontSize: 16, lineHeight: 22, flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { backgroundColor: C.orange, width: 22 },
}));
