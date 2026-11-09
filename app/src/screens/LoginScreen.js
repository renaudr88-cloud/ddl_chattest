// Stevey's login screen, now wired to the DDL account (php/chat-login.php) and in DDL colours.
import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { chat } from '../chat';
import { C, themed } from '../theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username.trim() || !password) return setError('Enter your username or email and your password.');
    setBusy(true); setError('');
    try { await chat.login(username.trim(), password); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Image source={require('../../assets/ddl-logo.png')} style={styles.logo} />
      <Text style={styles.title}>DDL</Text>
      <Text style={styles.subtitle}>Community Chat</Text>

      <TextInput style={styles.input} placeholder="Username or email" placeholderTextColor={C.barMuted}
        autoCapitalize="none" autoCorrect={false} textContentType="username" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={C.barMuted}
        secureTextEntry textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={handleLogin} />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>
      <Text style={styles.hint}>Use your ddl-online.com account.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = themed(C => ({
  container: { flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 96, height: 96, borderRadius: 16, borderWidth: 3, borderColor: '#fff', marginBottom: 18 },
  title: { color: C.orange, fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 36 },
  input: { width: '100%', backgroundColor: '#061331', color: '#fff', borderWidth: 1, borderColor: '#1D2E56', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 14 },
  error: { color: '#FFB4A8', width: '100%', marginBottom: 6, fontSize: 14 },
  button: { width: '100%', backgroundColor: C.orange, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: C.barMuted, fontSize: 13, marginTop: 18 },
}));
