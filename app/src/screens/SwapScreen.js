// Dartswap: sell, swap or ask for second-hand gear (up to 3 photos). Buyers message the seller privately.
import { useState } from 'react';
import { View, Text, ScrollView, TextInput, Image, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { chat, useChat, isMuted, listHere, CAN_UPLOAD } from '../chat';
import { hasBad } from '../filter';
import { Avatar, Header, Btn, Chip, Pick, Segmented, Empty, Notice, Lightbox, ConfirmBtn, timeLabel, toast, showError, s as ui } from '../components';
import { C, themed } from '../theme';

const KIND_COLOR = { Sell: C.ok, Swap: C.navy2, Wanted: C.warn };
const MAX_PHOTOS = 3;

export default function SwapScreen({ onUser }) {
  const st = useChat();
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState('Sell');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [cond, setCond] = useState('Used');
  const [desc, setDesc] = useState('');
  const [imgs, setImgs] = useState([]);       // local photo uris, max 3
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [zoom, setZoom] = useState(null);
  const muted = isMuted(st.me);
  const admin = st.me?.role === 'admin';

  const room = MAX_PHOTOS - imgs.length;
  const add = assets => setImgs(cur => [...cur, ...assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: room > 1, selectionLimit: room });
    if (!r.canceled && r.assets?.length) add(r.assets);
  };
  const shoot = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return toast('Allow the camera for DDL Chat in your phone settings.', true);
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!r.canceled && r.assets?.length) add(r.assets);
  };
  const post = async () => {
    if (!title.trim()) return toast('Add a title.', true);
    if (hasBad(title + ' ' + desc)) return toast('Blocked: your listing contains a word that is not allowed.', true);
    setBusy(true);
    try {
      const images = [];
      for (const uri of imgs) images.push(await chat.uploadImage(uri, 280_000));   // 3 photos must fit in one listing
      await chat.requestHere('swap.post', { kind, title, price, cond, desc, images });
      setTitle(''); setPrice(''); setDesc(''); setImgs([]); setShowForm(false); setFilter('All');
      toast('Listing posted.');
    } catch (e) { showError(e); }
    setBusy(false);
  };

  const list = listHere(st, 'swap').filter(x => filter === 'All' || x.kind === filter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Dartswap" subtitle="Buy, sell and swap darts gear"
        right={<Btn small kind={showForm ? 'default' : 'pri'} title={showForm ? 'Cancel' : '+ List'} onPress={() => setShowForm(!showForm)} />} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
        {showForm && <View style={ui.card}>
          <Pick options={['Sell', 'Swap', 'Wanted']} value={kind} onChange={setKind} />
          {CAN_UPLOAD && <View>
            <Text style={ui.label}>Photos ({imgs.length}/{MAX_PHOTOS})</Text>
            <View style={styles.photos}>
              {imgs.map((uri, i) => (
                <View key={uri + i} style={styles.slot}>
                  <Image source={{ uri }} style={styles.thumb} />
                  <TouchableOpacity style={styles.remove} onPress={() => setImgs(cur => cur.filter((_, j) => j !== i))} accessibilityLabel="Remove photo">
                    <Text style={{ color: '#fff', fontWeight: '900' }}>✕</Text>
                  </TouchableOpacity>
                </View>))}
              {room > 0 && <TouchableOpacity style={[styles.slot, styles.addSlot]} onPress={pick} accessibilityLabel="Choose photos">
                <Text style={{ fontSize: 24 }}>🖼️</Text><Text style={styles.addTxt}>Choose</Text></TouchableOpacity>}
              {room > 0 && <TouchableOpacity style={[styles.slot, styles.addSlot]} onPress={shoot} accessibilityLabel="Take a photo">
                <Text style={{ fontSize: 24 }}>📷</Text><Text style={styles.addTxt}>Camera</Text></TouchableOpacity>}
            </View>
          </View>}
          <TextInput style={ui.input} placeholder="Title, e.g. Harrows Assassin 22g" placeholderTextColor={C.muted} value={title} onChangeText={setTitle} maxLength={70} />
          {kind === 'Sell' && <TextInput style={ui.input} placeholder="Price in €" placeholderTextColor={C.muted} keyboardType="decimal-pad" value={price} onChangeText={setPrice} maxLength={10} />}
          <Segmented options={[['New', 'New'], ['Like new', 'Like new'], ['Used', 'Used'], ['Any', 'Any']]} value={cond} onChange={setCond} />
          <TextInput style={[ui.input, { minHeight: 70, textAlignVertical: 'top' }]} multiline placeholder="Weight, grip, what's included, shipping or pick-up" placeholderTextColor={C.muted} value={desc} onChangeText={setDesc} maxLength={400} />
          {muted && <Notice text="You are muted and cannot post right now." />}
          <Btn kind="pri" title="Post listing" loading={busy} disabled={muted} onPress={post} />
        </View>}

        <Segmented options={['All', 'Sell', 'Swap', 'Wanted'].map(k => [k, k])} value={filter} onChange={setFilter} />
        {!list.length && <Empty text="Nothing listed here yet." />}
        {list.map(x => {
          const mine = x.user.id === st.me?.id, open = x.status === 'open';
          return (
            <View key={x.id} style={[ui.card, !open && { opacity: 0.55 }]}>
              {x.images.length > 0 && <Photos images={x.images} onOpen={setZoom} />}
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

// Listing photos: swipe left/right, tap to enlarge.
function Photos({ images, onOpen }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 640) - 58;          // card width inside the page padding
  const [page, setPage] = useState(0);
  return (
    <View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: 10 }}
        onScroll={e => setPage(Math.round(e.nativeEvent.contentOffset.x / w))} scrollEventThrottle={50}>
        {images.map((uri, i) => (
          <TouchableOpacity key={i} activeOpacity={0.9} onPress={() => onOpen(uri)}>
            <Image source={{ uri }} style={{ width: w, height: w * 0.75, borderRadius: 10 }} resizeMode="cover" />
          </TouchableOpacity>))}
      </ScrollView>
      {images.length > 1 && <View style={styles.dots}>
        {images.map((_, i) => <View key={i} style={[styles.dot, i === page && styles.dotOn]} />)}
      </View>}
    </View>
  );
}

const styles = themed(C => ({
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: 68, height: 68, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  addSlot: { borderWidth: 2, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: C.bg },
  addTxt: { color: C.muted, fontSize: 12, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.line },
  dotOn: { backgroundColor: C.orange },
}));
