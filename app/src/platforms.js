// Each platform has its own General chat, Friendlies, Dartswap, Help desk and private chats.
// The keys must match PLATFORMS in server/.env. To add one later (e.g. DartCounter), add a line here.
// logo: an image, or null to show the initial on a coloured tile (used until a logo is approved).
export const PLATFORMS = [
  { key: 'dartsmind', name: 'Dartsmind', color: '#F07A2E', logo: require('../assets/dartsmind.png') },
  { key: 'scolia', name: 'Scolia', color: '#0A9A2E', logo: require('../assets/scolia.png') },
];

export const platformInfo = key => PLATFORMS.find(p => p.key === key) || PLATFORMS[0];
