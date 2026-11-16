import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { chat, useChat } from './src/chat';
import { ToastHost, Btn } from './src/components';
import { TEST_MODE } from './src/config';
import { FIREBASE_READY } from './src/firebase';
import { C, loadTheme, useTheme } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { InstallGuide } from './src/screens/Install';
import { isInstalled } from './src/install';

// Coming from the website's "Download the app" page (…/?install=1): open the install guide straight away.
// Read once at start, before the home screen tidies up the address bar.
const FROM_DOWNLOAD = typeof window !== 'undefined' && /[?&]install=1\b/.test(window.location?.search || '') && !isInstalled();

export default function App() {
  const st = useChat();
  const theme = useTheme(); // re-render the whole app when the background changes
  const [booting, setBooting] = useState(true);
  const [install, setInstall] = useState(FROM_DOWNLOAD);
  useEffect(() => { Promise.all([loadTheme(), chat.restore()]).finally(() => setBooting(false)); }, []);

  let body;
  if (booting) body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.orange} size="large" /></View>;
  else if (!FIREBASE_READY) body = <NotSetUp />;
  else if (st.status === 'idle') body = <LoginScreen />;
  else if (!st.me && !st.blocked) body = <Connecting offline={st.status === 'offline'} />;
  else body = <HomeScreen />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <BottomGap>{body}</BottomGap>
        {!booting && <InstallGuide visible={install} onClose={() => setInstall(false)} />}
        <ToastHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// iPhone home bar: keep the tab bar just clear of it, without a big empty band (about 60% of the safe area).
function BottomGap({ children }) {
  const { bottom } = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingBottom: Math.round(bottom * 0.6) }}>{children}</View>;
}

// Shown after logging in, until the chat server answers. If it can't be reached, say so instead of loading forever.
function Connecting({ offline }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
      {!offline ? <>
        <ActivityIndicator color={C.orange} size="large" />
        <Text style={{ color: C.barMuted, fontSize: 15 }}>Connecting to the chat…</Text>
      </> : <>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center' }}>Can't reach the chat</Text>
        <Text style={{ color: C.barMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
          {TEST_MODE
            ? 'Check your internet connection, and that the Firestore rules from firebase/firestore.rules are published. The app keeps trying by itself.'
            : 'Check your internet connection. The app keeps trying by itself.'}
        </Text>
        <Btn kind="pri" title="Try again" onPress={() => { chat.retry = 0; chat.connect(); }} style={{ alignSelf: 'stretch' }} />
        <Btn title="Log out" onPress={() => chat.logout()} style={{ alignSelf: 'stretch' }} />
      </>}
    </View>
  );
}

// Shown until app/src/firebaseConfig.js has the project's config.
function NotSetUp() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', textTransform: 'uppercase', textAlign: 'center' }}>Firebase not set up</Text>
      <Text style={{ color: C.barMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' }}>
        Paste your Firebase project's config into app/src/firebaseConfig.js (see README, "Set up Firebase").
      </Text>
    </View>
  );
}
