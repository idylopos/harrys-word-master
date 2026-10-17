const partOfSpeech = '(?:명사|동사|형용사|부사|대명사|전치사|접속사|감탄사|관사|수사|숙어|구동사|자동사|타동사|명|동|형|부|n\\.|v\\.|adj\\.|adv\\.)';
const posOnly = new RegExp(`^${partOfSpeech}(?:\\s*[/,·]\\s*${partOfSpeech})*$`, 'i');
const posPrefix = new RegExp(`^${partOfSpeech}(?:\\s*[/,·]\\s*${partOfSpeech})*(?:\\s*[:：]\\s*|\\s+)`, 'i');
const englishOnly = /^[a-zA-Z][a-zA-Z\s'’()-]*$/;
const columnHeader = /^(?:번호|영어\s*단어|영어|단어|품사|뜻|의미|한글\s*뜻|한국어\s*뜻|no\.?|number|english|word|part of speech|pos|korean|meaning)$/i;

function cleanImportText(value) {
  return value.replace(/&(?:nbsp|#160|#x0*a0|#0*32|#x0*20);/gi, ' ')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~])/g, '$1')
    .replace(/\*\*|__/g, '').replace(/^`+|`+$/g, '').trim();
}

// Small CSV reader: keep quoted commas inside a meaning and support escaped quotes.
function csvCells(line) {
  const cells = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseList(text) {
  const words = [], skipped = [], seen = new Set();
  let chapter = 'My words', pending = null;
  const skipPending = () => {
    if (pending) skipped.push({ line: pending.line, text: `${pending.english} (missing Korean meaning)` });
    pending = null;
  };
  const addWord = (english, korean, line, raw) => {
    const key = `${chapter}:${english.toLowerCase()}`;
    if (seen.has(key)) { skipped.push({ line, text: `${raw} (duplicate)` }); return; }
    seen.add(key);
    words.push({ id: key, english: english.toLowerCase(), korean, chapter });
  };
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
    let line = cleanImportText(raw);
    const lineNumber = index + 1;
    if (!line || /^```/.test(line)) return;
    // Ignore empty cells, Markdown table rules, and separator lines from rich-text copies.
    if (/^[|\s:\-]+$/.test(line) || columnHeader.test(line) || posOnly.test(line)) return;
    const heading = line.match(/^(?:#{1,6}\s*)?(?:chapter|chap\.?|unit)\s*(\d+)\s*$/i);
    if (heading) { skipPending(); chapter = `Chapter ${heading[1]}`; return; }
    if (/^\d+[.)]?$/.test(line)) { skipPending(); return; }

    let cells = null;
    if (line.startsWith('|') || line.endsWith('|')) {
      cells = line.replace(/^\||\|$/g, '').split('|').map(cleanImportText);
    } else if (line.includes('\t')) cells = line.split('\t').map(cleanImportText);
    else if (line.includes(',')) cells = csvCells(line).map(cleanImportText);
    if (cells) {
      cells = cells.filter(Boolean);
      if (cells.length && cells.every(c => columnHeader.test(c) || /^:?-+:?$/.test(c))) return;
      if (/^\d+[.)]?$/.test(cells[0])) cells.shift();
      if (cells.length > 1 && englishOnly.test(cells[0]) && cells.slice(1).some(c => /[가-힣]/.test(c))) {
        const english = cells.shift().trim();
        if (posOnly.test(cells[0])) cells.shift();
        const korean = cells.join(', ').trim();
        if (/[가-힣]/.test(korean)) { skipPending(); addWord(english, korean, lineNumber, raw.trim()); return; }
      }
      // A one-cell table can also be a vertically copied record.
      if ((line.startsWith('|') || line.endsWith('|')) && cells.length === 1) line = cells[0];
    }
    line = line.replace(/^(?:[-*•]\s+|\d+[.)]?\s+)/, '');
    if (columnHeader.test(line) || posOnly.test(line)) return;
    const match = line.match(/^([a-zA-Z][a-zA-Z\s'’()-]*?)(?:\s+(?=[\d(~가-힣])|(?=\d+\.))(.+)$/);
    if (match && /[가-힣]/.test(match[2])) {
      skipPending();
      addWord(match[1].trim(), match[2].replace(posPrefix, '').trim(), lineNumber, raw.trim());
      return;
    }
    if (englishOnly.test(line)) { skipPending(); pending = { english: line, line: lineNumber }; return; }
    if (pending && /^[\d(~가-힣]/.test(line) && /[가-힣]/.test(line)) {
      addWord(pending.english, line, pending.line, pending.english);
      pending = null;
      return;
    }
    skipPending();
    skipped.push({ line: lineNumber, text: raw.trim() });
  });
  skipPending();
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

// Keep the existing list/word/direction keys so old review schedules stay intact.
export function resolveSelectedListIds(state) {
  const available = new Set(state.lists.map(list => list.id));
  const requested = Array.isArray(state.selectedListIds) ? state.selectedListIds : [state.selected];
  const selected = [...new Set(requested)].filter(id => available.has(id));
  return selected.length ? selected : state.lists.slice(0, 1).map(list => list.id);
}
export function chapterKey(listId, chapter) {
  return JSON.stringify([listId, chapter]);
}
export function cardsForLists(lists, listIds, { chapters = null, direction = 'mixed' } = {}) {
  const selected = new Set(listIds), includedChapters = chapters === null ? null : new Set(chapters);
  return lists.filter(list => selected.has(list.id)).flatMap(list => list.words
    .filter(word => includedChapters === null || includedChapters.has(chapterKey(list.id, word.chapter)))
    .flatMap(word => ['en-ko', 'ko-en'].filter(d => direction === 'mixed' || d === direction)
      .map(d => ({ word, direction: d, key: `${list.id}/${word.id}/${d}`, listId: list.id, listName: list.name }))));
}

function listSignature(list) {
  return JSON.stringify(list.words.map(word => [normalize(word.english),
    meanings(word.korean).map(normalize).sort()]).sort((a, b) => a[0].localeCompare(b[0])));
}

// Add public vocabulary to each browser's private state. Reuse matching imports
// in place, retaining their list/word IDs and therefore all existing SRS keys.
export function mergeBuiltInLists(state, builtIns) {
  const lists = [...state.lists];
  for (const builtIn of builtIns) {
    const signature = listSignature(builtIn);
    const index = lists.findIndex(list => list.id === builtIn.id || list.builtinId === builtIn.id || listSignature(list) === signature);
    if (index >= 0) lists[index] = { ...lists[index], builtinId: builtIn.id };
    else lists.push({ ...builtIn, builtinId: builtIn.id, words: builtIn.words.map(word => ({ ...word })) });
  }
  return { ...state, lists };
}
