// Help desk: players can only ask questions. Staff answer in place or move the question to a private chat.
import { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { chat, useChat, isMuted } from '../chat';
import { hasBad, isQuestion } from '../filter';
import { Avatar, Header, Btn, Chip, Segmented, Empty, Notice, RoleTag, ConfirmBtn, timeLabel, toast, showError, s as ui } from '../components';
import { C } from '../theme';

export default function HelpScreen({ onOpenDM }) {
  const st = useChat();
  const admin = st.me?.role === 'admin';
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('open');
  const [answers, setAnswers] = useState({});
  const muted = isMuted(st.me);

  const ask = async () => {
    if (!isQuestion(q)) return toast('The help desk is for questions only. Ask a question, or use General chat.', true);
    if (hasBad(q)) return toast('Blocked: your question contains a word that is not allowed.', true);
    setBusy(true);
    try { await chat.request('help.ask', { text: q }); setQ(''); setFilter('open'); toast('Question sent to the staff.'); }
    catch (e) { showError(e); }
    setBusy(false);
  };
  const answer = async h => {
    const text = (answers[h.id] || '').trim(); if (!text) return;
    try { await chat.request('help.answer', { id: h.id, text }); setAnswers(a => ({ ...a, [h.id]: '' })); toast('Answer posted. Question marked solved.'); }
    catch (e) { showError(e); }
  };
  const toPrivate = async h => {
    try { const r = await chat.request('help.private', { id: h.id }); onOpenDM(r.room, r.other); } catch (e) { showError(e); }
  };
  const status = (h, s) => chat.request('help.status', { id: h.id, status: s }).catch(showError);

  // Players see open questions of their own + all solved ones (useful FAQ). Staff see everything.
  const visible = st.help.filter(h => admin || h.status === 'solved' || h.user.id === st.me?.id);
  const list = visible.filter(h => filter === 'all' || h.status === filter);
  const count = k => visible.filter(h => k === 'all' || h.status === k).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Help desk" subtitle="Questions only. Staff answer here or in a private chat." />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
        {!admin && <View style={ui.card}>
          <Text style={[ui.section, { marginTop: 0, marginBottom: 0 }]}>Ask the staff</Text>
          <TextInput style={[ui.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline maxLength={300} value={q} onChangeText={setQ}
            placeholder="How, what, when, can I…? End with a question mark." placeholderTextColor={C.muted} />
          <Text style={{ color: C.muted, fontSize: 12 }}>This room is for questions only. Chatting goes in General.</Text>
          {muted && <Notice text="You are muted and cannot post right now." />}
          <Btn kind="pri" title="Send question" loading={busy} disabled={muted} onPress={ask} />
        </View>}

        <Segmented options={[['open', `Open · ${count('open')}`], ['solved', `Solved · ${count('solved')}`], ['all', `All · ${count('all')}`]]} value={filter} onChange={setFilter} />
        {!list.length && <Empty text={filter === 'open' ? 'No open questions. All caught up.' : 'Nothing here yet.'} />}
        {list.map(h => (
          <View key={h.id} style={ui.card}>
            <View style={ui.row}>
              <Avatar user={h.user} size={30} /><Text style={{ color: C.fg, fontWeight: '700' }}>{h.user.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{timeLabel(h.ts)}</Text>
              <View style={{ marginLeft: 'auto' }}><Chip solid label={h.status === 'open' ? 'Open' : 'Solved'} color={h.status === 'open' ? C.warn : C.ok} /></View>
            </View>
            <Text style={{ color: C.fg, fontSize: 16, fontWeight: '600' }}>{h.text}</Text>
            {h.answers.map((a, i) => (
              <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: C.orange, paddingLeft: 10, gap: 2 }}>
                <View style={ui.row}><Text style={{ color: C.fg, fontWeight: '700', fontSize: 13 }}>{a.user.name}</Text><RoleTag user={a.user} /><Text style={{ color: C.muted, fontSize: 11 }}>{timeLabel(a.ts)}</Text></View>
                <Text style={{ color: C.fg }}>{a.text}</Text>
              </View>))}
            {admin ? <>
              <TextInput style={ui.input} placeholder="Write an answer…" placeholderTextColor={C.muted} value={answers[h.id] || ''} onChangeText={t => setAnswers(a => ({ ...a, [h.id]: t }))} />
              <View style={ui.row}>
                <Btn small kind="pri" title="Answer" onPress={() => answer(h)} />
                <Btn small title="Private chat" onPress={() => toPrivate(h)} />
                {h.status === 'open' ? <Btn small title="Mark solved" onPress={() => status(h, 'solved')} /> : <Btn small title="Reopen" onPress={() => status(h, 'open')} />}
                <ConfirmBtn small title="Delete" confirmTitle="Tap to delete" onConfirm={() => status(h, 'deleted')} />
              </View>
            </> : h.user.id === st.me?.id && h.status === 'open' && <Btn small title="My question is solved" onPress={() => status(h, 'solved')} />}
          </View>))}
      </ScrollView>
    </View>
  );
}
