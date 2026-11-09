import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { chat, useChat } from './src/chat';
import { ToastHost } from './src/components';
import { C, loadTheme, useTheme } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const st = useChat();
  const theme = useTheme(); // re-render the whole app when the background changes
  const [booting, setBooting] = useState(true);
  useEffect(() => { Promise.all([loadTheme(), chat.restore()]).finally(() => setBooting(false)); }, []);

  let body;
  if (booting) body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.orange} size="large" /></View>;
  else if (st.status === 'idle') body = <LoginScreen />;
  else if (!st.me && !st.blocked) body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.orange} size="large" /></View>;
  else body = <HomeScreen />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="light" />
        {body}
        <ToastHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
