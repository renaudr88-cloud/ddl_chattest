
// Bad-word filter (English + Dutch). Same logic runs in the app (app/src/filter.js) for instant feedback,
// but the server is the one that decides.

const BAD = ['fuck','fck','fuk','shit','cunt','bitch','asshole','arsehole','bastard','dickhead','wanker','twat',
  'prick','slut','whore','motherfucker','retard','nigger','nigga','faggot','fag',
  'kut','klootzak','hoer','lul','godverdomme','gvd','tering','kanker','kankerlijer','mongool','teringlijer','eikel',
  'sukkel','flikker','tyfus','pleuris','debiel','kech'];
// Strong words are also caught inside other words and when split up ("f.u.c.k").
const STRONG = ['fuck','cunt','motherfucker','nigger','faggot','klootzak','kanker','tering','godverdomme'];
const ALLOW = /(scunthorpe)/;
const SUFFIX = ['', 's', 'en', 'ing', 'ed', 'er', 'ers'];

function norm(s) {
  return String(s).toLowerCase()
    .replace(/[0@4]/g, m => ({ '0': 'o', '@': 'a', '4': 'a' }[m]))
    .replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't')
    .replace(/(.)\1{2,}/g, '$1$1');
}

function hasBad(text) {
  if (!text) return false;
  const n = norm(text);
  const tokens = n.split(/[^a-zà-ÿ]+/).filter(Boolean);
  for (const w of tokens) {
    for (const b of BAD) {
      if (SUFFIX.some(s => w === b + s)) return true;
      if (STRONG.includes(b) && w.includes(b)) return true;
    }
  }
  const squashed = n.replace(/[^a-z]/g, '');
  return !ALLOW.test(squashed) && STRONG.some(b => squashed.includes(b));
}

// Help desk accepts questions only.
function isQuestion(text) {
  const x = String(text || '').trim().toLowerCase();
  if (x.length < 10) return false;
  return x.endsWith('?') ||
    /^(how|what|when|where|why|who|which|can|could|is|are|do|does|did|will|would|should|hoe|wat|wanneer|waar|waarom|wie|welke|kan|kun|mag|zijn|moet)\b/.test(x);
}

export { hasBad, isQuestion };
