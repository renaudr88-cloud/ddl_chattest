// Stevey's login screen, now wired to the DDL account (php/chat-login.php) and in DDL colours.
import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { chat, useChat } from '../chat';
import { PLATFORMS } from '../platforms';
import { TEST_MODE } from '../config';
import { PlatformLogo } from '../components';
import { C, themed } from '../theme';

// Login background with the DDL logo and slogan "PLAY. COMPETE. CONNECT." already in the picture.
// The form starts just below the slogan, wherever the picture lands on this screen size.
// Set BACKGROUND = null to go back to the plain navy screen with the logo drawn by the app.
const BACKGROUND = require('../../assets/login-bg.jpg');

// "In association with": the DDL partners (same as on the ddl-online.com homepage). Width = logo width at height 22.
const SPONSORS = [
  { name: 'Dartsmind', logo: require('../../assets/sponsors/dartsmind.png'), w: 22 },
  { name: 'Timmort', logo: require('../../assets/sponsors/timmort.png'), w: 48, round: 3 },
  { name: 'Board Room Darts', logo: require('../../assets/sponsors/boardroom.png'), w: 23, round: 4 },
  { name: 'Condor', logo: require('../../assets/sponsors/condor.png'), w: 66 },
  { name: "What's The Point", logo: require('../../assets/sponsors/whatsthepoint.png'), w: 70 },
];
const BG_W = 759, BG_H = 2072;   // pixel size of the picture
const LOGO_TOP = 0.16;           // logo starts at 16% of the picture's height
const SLOGAN_BOTTOM = 0.375;     // slogan ends at 37.5% of the picture's height

export default function LoginScreen() {
  const st = useChat(); // st.platform = Dartsmind or Scolia, remembered on the phone
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { width, height } = useWindowDimensions();
  // Fill the screen with the picture. On phones it is taller than the screen, so we choose what to cut:
  // the logo always sits 24 px from the top, and the dartboard fills the bottom as far as it fits.
  const scale = Math.max(width / BG_W, height / BG_H);
  const imgW = BG_W * scale, imgH = BG_H * scale;
  const imgTop = Math.min(0, Math.max(height - imgH, 24 - imgH * LOGO_TOP));
  const formTop = BACKGROUND ? imgTop + imgH * SLOGAN_BOTTOM + 20 : 0;

  const handleLogin = async () => {
    if (!username.trim() || (!TEST_MODE && !password)) return setError(TEST_MODE ? 'Enter your name.' : 'Enter your email address and your password.');
    setBusy(true); setError('');
    try { await chat.login(username.trim(), password); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <View style={styles.bg}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[styles.container, BACKGROUND && { justifyContent: 'flex-start', paddingTop: formTop }]}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {/* the picture scrolls with the form, so the form never slides over the logo */}
      {BACKGROUND && <Image source={BACKGROUND} resizeMode="cover" style={[styles.bgImage, { top: imgTop, left: (width - imgW) / 2, width: imgW, height: imgH }]} />}
      {!BACKGROUND && <>
        <Image source={require('../../assets/ddl-logo.png')} style={styles.logo} />
        <Text style={styles.title}>DDL</Text>
        <Text style={styles.subtitle}>Community Chat</Text>
        <Text style={styles.slogan}>Play. Compete. Connect.</Text>
      </>}

      <Text style={styles.label}>I play on</Text>
      <View style={styles.platRow} accessibilityRole="radiogroup">
        {PLATFORMS.map(p => {
          const on = st.platform === p.key;
          return (
            <TouchableOpacity key={p.key} onPress={() => chat.setPlatform(p.key)} style={[styles.plat, on && styles.platOn]}
              accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={p.name}>
              <PlatformLogo platform={p} size={44} />
              <Text style={[styles.platTxt, on && { color: '#fff' }]}>{p.name}</Text>
            </TouchableOpacity>);
        })}
      </View>

      <TextInput style={styles.input} placeholder={TEST_MODE ? 'Your name' : 'Email address'} placeholderTextColor={C.barMuted}
        autoCapitalize={TEST_MODE ? 'words' : 'none'} autoCorrect={false} keyboardType={TEST_MODE ? 'default' : 'email-address'}
        textContentType={TEST_MODE ? 'nickname' : 'username'} value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor={C.barMuted}
        secureTextEntry textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={handleLogin} />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>
      <Text style={styles.hint}>{TEST_MODE ? 'Test version: log in with your own name. Staff: use the staff code as password.' : 'Use your ddl-online.com account. You can switch platform in the app.'}</Text>
      <Text style={styles.partnersLabel}>In association with</Text>
      <View style={styles.partners}>
        {SPONSORS.map(sp => (
          <View key={sp.name} style={styles.partner} accessibilityLabel={sp.name}>
            <Image source={sp.logo} resizeMode="contain" style={{ width: sp.w, height: 22, borderRadius: sp.round || 0 }} />
          </View>))}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

const styles = themed(C => ({
  bg: { flex: 1, backgroundColor: C.navy, overflow: 'hidden' },
  bgImage: { position: 'absolute', zIndex: -1 },   // behind the form (the scroll content is its own layer: container zIndex 0)
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 0 },
  logo: { width: 96, height: 96, borderRadius: 16, borderWidth: 3, borderColor: '#fff', marginBottom: 18 },
  title: { color: C.orange, fontSize: 56, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  slogan: { color: C.orange, fontSize: 13, fontWeight: '800', letterSpacing: 3.5, textTransform: 'uppercase', marginTop: 8, marginBottom: 26 },
  label: { alignSelf: 'flex-start', color: C.barMuted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  platRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 18 },
  plat: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: '#1D2E56', backgroundColor: 'rgba(6,19,49,0.85)' },
  platOn: { borderColor: C.orange, backgroundColor: C.navy2 },
  platTxt: { color: C.barMuted, fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
  input: { width: '100%', backgroundColor: 'rgba(6,19,49,0.88)', color: '#fff', borderWidth: 1, borderColor: '#1D2E56', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 14 },
  error: { color: '#FFB4A8', width: '100%', marginBottom: 6, fontSize: 14 },
  button: { width: '100%', backgroundColor: C.orange, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase' },
  hint: { color: '#C3CEE3', fontSize: 13, marginTop: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  partnersLabel: { color: C.barMuted, fontSize: 10, fontWeight: '800', letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 },
  partners: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, width: '100%', paddingBottom: 8 },
  partner: { paddingHorizontal: 6, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(6,19,49,0.85)', borderWidth: 1, borderColor: '#1D2E56', alignItems: 'center', justifyContent: 'center' },
}));
