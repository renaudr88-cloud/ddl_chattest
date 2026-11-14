// Install help: a bar on the home screen (until the chat is installed or the player closes it)
// and a step-by-step guide for iPhone, Android and computers. Opened again from Settings.
import { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TouchableOpacity, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, toast } from '../components';
import { C, themed } from '../theme';
import { isInstalled, deviceKind, iosNotSafari, canPrompt, promptInstall, onInstallChange } from '../install';

const BAR_KEY = 'ddl-chat-installbar';
const DEVICES = [['ios', '📱 iPhone / iPad'], ['android', '🤖 Android'], ['desktop', '💻 Computer']];

function useInstallState() {
  const [, tick] = useState(0);
  useEffect(() => onInstallChange(() => tick(n => n + 1)), []);
  return { installed: isInstalled(), prompt: canPrompt() };
}

// Little drawings of the buttons the player has to look for.
const ShareIcon = () => (
  <View style={icon.share}><View style={icon.shareBox} /><View style={icon.shareStem} /><Text style={icon.shareArrow}>↑</Text></View>);
const Key = ({ children }) => <Text style={styles.key}>{children}</Text>;

const STEPS = {
  ios: [
    ['Open in Safari', <>Open <Key>ddl-chat-858ec.web.app</Key> in <Text style={{ fontWeight: '900' }}>Safari</Text>. (Chrome on iPhone cannot do this.)</>],
    ['Tap Share', <>Tap the share button <ShareIcon /> at the bottom of the screen (on iPad: top right).</>],
    ['Add to Home Screen', <>Scroll down and tap <Key>➕ Add to Home Screen</Key>.</>],
    ['Tap Add', <>Tap <Key>Add</Key> top right. The DDL Chat icon is now on your home screen.</>],
    ['Turn on notifications', <>Open DDL Chat <Text style={{ fontWeight: '900' }}>from that icon</Text> and tap <Key>🔔 Turn on</Key>. Only then can iPhone show DDL notifications.</>],
  ],
  android: [
    ['Open in Chrome', <>Open <Key>ddl-chat-858ec.web.app</Key> in Chrome.</>],
    ['Open the menu', <>Tap <Key>⋮</Key> top right.</>],
    ['Install', <>Tap <Key>Install app</Key> (or <Key>Add to Home screen</Key>) and then <Key>Install</Key>.</>],
    ['Done', <>Open DDL Chat from your home screen or app list, and turn on <Key>🔔 Notifications</Key>.</>],
  ],
  desktop: [
    ['Open in Chrome or Edge', <>Open <Key>ddl-chat-858ec.web.app</Key> in Chrome or Microsoft Edge.</>],
    ['Click install', <>Click the install icon <Key>⊕</Key> at the right of the address bar, or menu <Key>⋮</Key> → <Key>Install DDL Chat</Key>.</>],
    ['Done', <>DDL Chat opens in its own window and gets a shortcut on your desktop / Start menu.</>],
  ],
};

export function InstallGuide({ visible, onClose }) {
  const { installed, prompt } = useInstallState();
  const [dev, setDev] = useState(deviceKind());
  useEffect(() => { if (visible) setDev(deviceKind()); }, [visible]);
  const install = async () => {
    if (await promptInstall()) { toast('DDL Chat is installed. 🎯'); onClose(); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.hero}>
            <Image source={require('../../assets/ddl-logo.png')} style={styles.logo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Install DDL Chat</Text>
              <Text style={styles.heroSub}>Like a real app: an icon on your phone, full screen, and notifications even when it is closed.</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {installed ? (
              <View style={styles.done}><Text style={styles.doneTxt}>✅ You are using the installed DDL Chat. Nothing to do.</Text></View>
            ) : <>
              {prompt && dev !== 'ios' && (
                <View style={{ gap: 6 }}>
                  <Btn kind="pri" title="📲 Install DDL Chat now" onPress={install} />
                  <Text style={styles.small}>One tap: your browser asks to confirm. Or follow the steps below.</Text>
                </View>)}
              {dev === 'ios' && iosNotSafari() && (
                <View style={styles.warn}><Text style={styles.warnTxt}>⚠️ You are not in Safari. Copy the link, open Safari and paste it there first.</Text></View>)}
              <View style={styles.tabs}>
                {DEVICES.map(([k, label]) => (
                  <TouchableOpacity key={k} onPress={() => setDev(k)} style={[styles.tab, dev === k && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: dev === k }}>
                    <Text style={[styles.tabTxt, dev === k && { color: C.white }]}>{label}</Text>
                  </TouchableOpacity>))}
              </View>
              {STEPS[dev].map(([head, body], i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.num}><Text style={styles.numTxt}>{i + 1}</Text></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.stepHead}>{head}</Text>
                    <Text style={styles.stepBody}>{body}</Text>
                  </View>
                </View>))}
            </>}
            <Btn title="Close" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Home screen bar: shown in the browser until the player installs or closes it.
export function InstallBar({ onOpen }) {
  const { installed, prompt } = useInstallState();
  const [hide, setHide] = useState(true);
  useEffect(() => { AsyncStorage.getItem(BAR_KEY).then(v => setHide(v === '1')).catch(() => setHide(false)); }, []);
  if (hide || installed) return null;
  const close = () => { setHide(true); AsyncStorage.setItem(BAR_KEY, '1').catch(() => {}); };
  const tap = async () => {
    if (prompt && deviceKind() !== 'ios') { if (await promptInstall()) { toast('DDL Chat is installed. 🎯'); close(); } }
    else onOpen();
  };
  return (
    <View style={styles.bar}>
      <Text style={styles.barTxt}>📲 Put DDL Chat on your {deviceKind() === 'desktop' ? 'computer' : 'phone'} like an app</Text>
      <Btn small kind="pri" title={prompt && deviceKind() !== 'ios' ? 'Install' : 'How?'} onPress={tap} />
      <TouchableOpacity onPress={close} accessibilityLabel="Close" style={{ padding: 6 }}><Text style={{ color: C.barMuted, fontSize: 18 }}>✕</Text></TouchableOpacity>
    </View>
  );
}

const icon = themed(C => ({
  share: { width: 18, height: 20, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 2, transform: [{ translateY: 4 }] },
  shareBox: { position: 'absolute', bottom: 0, width: 16, height: 12, borderWidth: 2, borderTopWidth: 0, borderColor: C.orange, borderRadius: 3 },
  shareStem: { position: 'absolute', bottom: 4, width: 2, height: 12, backgroundColor: C.orange },
  shareArrow: { position: 'absolute', top: -7, color: C.orange, fontWeight: '900', fontSize: 13 },
}));

const styles = themed(C => ({
  scrim: { flex: 1, backgroundColor: 'rgba(1,10,30,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', maxHeight: '92%' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: C.navy2, borderBottomWidth: 3, borderBottomColor: C.orange },
  logo: { width: 60, height: 60, borderRadius: 14 },
  title: { color: C.white, fontSize: 22, fontWeight: '900', textTransform: 'uppercase' },
  heroSub: { color: C.barMuted, fontSize: 13, marginTop: 3 },
  tabs: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabOn: { backgroundColor: C.orange },
  tabTxt: { color: C.muted, fontWeight: '800', fontSize: 13 },
  step: { flexDirection: 'row', gap: 12, backgroundColor: C.bg, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.line },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stepHead: { color: C.fg, fontWeight: '900', fontSize: 15 },
  stepBody: { color: C.muted, fontSize: 14, lineHeight: 21 },
  key: { color: C.fg, fontWeight: '800', backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 5, overflow: 'hidden' },
  small: { color: C.muted, fontSize: 12, textAlign: 'center' },
  warn: { backgroundColor: C.warn + '33', borderRadius: 12, padding: 10 },
  warnTxt: { color: C.fg, fontSize: 13 },
  done: { backgroundColor: C.ok + '33', borderRadius: 12, padding: 12 },
  doneTxt: { color: C.fg, fontWeight: '700' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.navy2, borderBottomWidth: 1, borderBottomColor: C.line },
  barTxt: { color: C.white, fontSize: 13, flex: 1, fontWeight: '700' },
}));
