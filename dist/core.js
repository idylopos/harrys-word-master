export function parseList(text) {
  const words = [], skipped = [], seen = new Set();
  let chapter = 'My words';
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const heading = line.match(/^(?:chapter|chap\.?|unit)\s*(\d+)\s*$/i);
    if (heading) { chapter = `Chapter ${heading[1]}`; return; }
    if (/^(english|word)\s*[,\t]\s*(korean|meaning|뜻)/i.test(line)) return;
    const match = line.match(/^([a-zA-Z][a-zA-Z\s'’()-]*?)(?:\s*[,\t]\s*|\s+(?=[\d(~가-힣])|(?=\d+\.))(.+)$/);
    if (!match || !/[가-힣]/.test(match[2])) { skipped.push({ line: index + 1, text: line }); return; }
    const english = match[1].trim().toLowerCase();
    const korean = match[2].replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    const key = `${chapter}:${english}`;
    if (seen.has(key)) { skipped.push({ line: index + 1, text: `${line} (duplicate)` }); return; }
    seen.add(key);
    words.push({ id: key, english, korean, chapter });
  });
  return { words, skipped };
}
export function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s.,!?~～;:·'"“”‘’/()[\]{}\-]/g, '');
}
export function meanings(value) {
  return value.replace(/\d+\s*\./g, '|').split(/[,/;|]/).map(x => x.trim()).filter(x => normalize(x));
}
export function isCorrect(answer, word, direction) {
  const input = normalize(answer);
  if (!input) return false;
  if (direction === 'ko-en') return input === normalize(word.english);
  const variants = meanings(word.korean).flatMap(x => [x, x.replace(/\([^)]*\)/g, '')]);
  // Accept standard spelling alongside the original weekly list's typos.
  return variants.some(x => [x, x.replace(/꿰메/g, '꿰매').replace(/차라지/g, '차리지').replace(/툭정/g, '특정')].some(v => normalize(v) === input));
}
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export const intervals = [1, 3, 7, 14, 30, 60, 90];
export function schedule(previous, correct, now = Date.now()) {
  // Optional early practice can record a lapse, but cannot advance a card early.
  if (correct && previous?.due > now) return { ...previous, lastCorrect: true };
  const level = correct ? Math.min((previous?.level ?? -1) + 1, intervals.length - 1) : -1;
  return { level, due: now + (correct ? intervals[level] * 86400000 : 600000), lastCorrect: correct, reviewedAt: now };
}
export function buildQueue(cards, progress, limit, now = Date.now(), early = false) {
  const due = shuffle(cards.filter(c => progress[c.key]?.due <= now));
  const fresh = shuffle(cards.filter(c => !progress[c.key]));
  const later = early ? shuffle(cards.filter(c => progress[c.key]?.due > now)) : [];
  return [...due, ...fresh, ...later].slice(0, limit);
}
