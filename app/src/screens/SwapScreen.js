// Dartswap: sell, swap or ask for second-hand gear. Buyers message the seller privately.
import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Image, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { chat, useChat, isMuted } from '../chat';
import { hasBad } from '../filter';
import { Avatar, Header, Btn, Chip, Pick, Segmented, Empty, Notice, Lightbox, ConfirmBtn, timeLabel, toast, showError, s as ui } from '../components';
import { C } from '../theme';

const KIND_COLOR = { Sell: C.ok, Swap: C.navy2, Wanted: C.warn };

export default function SwapScreen({ onUser }) {
  const st = useChat();
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState('Sell');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [cond, setCond] = useState('Used');
  const [desc, setDesc] = useState('');
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [zoom, setZoom] = useState(null);
  const muted = isMuted(st.me);
  const admin = st.me?.role === 'admin';

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!r.canceled && r.assets?.[0]) setImg(r.assets[0].uri);
  };
  const post = async () => {
    if (!title.trim()) return toast('Add a title.', true);
    if (hasBad(title + ' ' + desc)) return toast('Blocked: your listing contains a word that is not allowed.', true);
    setBusy(true);
    try {
      const imageUrl = img ? await chat.uploadImage(img) : null;
      await chat.request('swap.post', { kind, title, price, cond, desc, imageUrl });
      setTitle(''); setPrice(''); setDesc(''); setImg(null); setShowForm(false); setFilter('All');
      toast('Listing posted.');
    } catch (e) { showError(e); }
    setBusy(false);
  };

  const list = st.swap.filter(x => filter === 'All' || x.kind === filter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Dartswap" subtitle="Buy, sell and swap darts gear"
        right={<Btn small kind={showForm ? 'default' : 'pri'} title={showForm ? 'Cancel' : '+ List'} onPress={() => setShowForm(!showForm)} />} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
        {showForm && <View style={ui.card}>
          <Pick options={['Sell', 'Swap', 'Wanted']} value={kind} onChange={setKind} />
          <TextInput style={ui.input} placeholder="Title, e.g. Harrows Assassin 22g" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} maxLength={70} />
          {kind === 'Sell' && <TextInput style={ui.input} placeholder="Price in €" placeholderTextColor={C.muted} keyboardType="decimal-pad" value={price} onChangeText={setPrice} maxLength={10} />}
          <Segmented options={[['New', 'New'], ['Like new', 'Like new'], ['Used', 'Used'], ['Any', 'Any']]} value={cond} onChange={setCond} />
          <TextInput style={[ui.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline placeholder="Weight, grip, what's included, shipping or pick-up" placeholderTextColor={C.muted} value={desc} onChangeText={setDesc} maxLength={400} />
          <View style={ui.row}>
            <Btn small title={img ? 'Change photo' : '📷 Add photo'} onPress={pick} />
            {img && <Image source={{ uri: img }} style={{ width: 44, height: 44, borderRadius: 6 }} />}
          </View>
          {muted && <Notice text="You are muted and cannot post right now." />}
          <Btn kind="pri" title="Post listing" loading={busy} disabled={muted} onPress={post} />
        </View>}

        <Segmented options={['All', 'Sell', 'Swap', 'Wanted'].map(k => [k, k])} value={filter} onChange={setFilter} />
        {!list.length && <Empty text="Nothing listed here yet." />}
        {list.map(x => {
          const mine = x.user.id === st.me?.id, open = x.status === 'open';
          return (
            <View key={x.id} style={[ui.card, !open && { opacity: 0.55 }]}>
              {x.imageUrl && <TouchableOpacity onPress={() => setZoom(x.imageUrl)}><Image source={{ uri: x.imageUrl }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }} /></TouchableOpacity>}
              <View style={ui.row}><Chip solid label={x.kind} color={KIND_COLOR[x.kind]} />{!open && <Chip solid label={x.kind === 'Wanted' ? 'Found' : 'Sold / swapped'} />}<Chip label={x.cond} /></View>
              <Text style={{ color: C.fg, fontSize: 17, fontWeight: '700' }}>{x.title}</Text>
              {x.kind === 'Sell' && !!x.price && <Text style={{ color: C.fg, fontSize: 24, fontWeight: '900' }}>€{x.price}</Text>}
              {!!x.desc && <Text style={{ color: C.muted }}>{x.desc}</Text>}
              <View style={ui.row}><Avatar user={x.user} onPress={() => onUser(x.user)} />
                <View><Text style={{ color: C.fg, fontWeight: '700' }}>{x.user.name}</Text><Text style={{ color: C.muted, fontSize: 12 }}>{timeLabel(x.ts)}</Text></View></View>
              <View style={ui.row}>
                {open && !mine && <Btn small kind="pri" title={x.kind === 'Wanted' ? 'Message buyer' : 'Message seller'} onPress={() => onUser(x.user, true)} />}
                {open && mine && <Btn small title={x.kind === 'Wanted' ? 'Mark found' : 'Mark sold'} onPress={() => chat.request('swap.done', { id: x.id }).catch(showError)} />}
                {(mine || admin) && <ConfirmBtn small title="Delete" confirmTitle="Tap to delete" onConfirm={() => chat.request('swap.delete', { id: x.id }).catch(showError)} />}
              </View>
            </View>);
        })}
      </ScrollView>
      <Lightbox uri={zoom} onClose={() => setZoom(null)} />
    </View>
  );
}
