import { listSignature } from './core.js?v=7';

const maxBytes = 500000;
const maxHashLength = 16000;

function readPayload(payload) {
  if (Array.isArray(payload?.words) && payload.words.length > 1000) throw new Error('Please split lists with more than 1,000 words before sharing or publishing.');
  if (!payload || payload.format !== 'harry-word-list' || payload.version !== 1 ||
      typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 80 ||
      !Array.isArray(payload.words) || !payload.words.length || payload.words.length > 1000) {
    throw new Error('This is not a valid shared word list.');
  }
  const seen = new Set();
  const words = payload.words.map(row => {
    if (!Array.isArray(row) || row.length !== 3 || !row.every(value => typeof value === 'string') ||
        !/^[a-zA-Z][a-zA-Z\s'’()-]*$/.test(row[0]) || row[0].length > 200 ||
        !/[가-힣]/.test(row[1]) || row[1].length > 3000 || !row[2].trim() || row[2].length > 120 ||
        row.some(value => /[\u0000-\u001f\u007f]/.test(value))) {
      throw new Error('This shared list contains an invalid word or meaning.');
    }
    const english = row[0].trim().toLowerCase(), korean = row[1].trim(), chapter = row[2].trim();
    const id = `${chapter}:${english}`;
    if (seen.has(id)) throw new Error('This shared list contains duplicate words in a chapter.');
    seen.add(id);
    return { id, english, korean, chapter };
  });
  return { name: payload.name.trim(), words };
}

// Whitelist only vocabulary: IDs, schedules, scores and private lists never leave the browser.
export function sharedListFile(list) {
  const payload = { format: 'harry-word-list', version: 1, name: list.name,
    words: list.words.map(word => [word.english, word.korean, word.chapter]) };
  readPayload(payload);
  const text = JSON.stringify(payload);
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('This list is too large to share. Please split it into smaller lists.');
  return text;
}

export function parseSharedListFile(text) {
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('This shared list is too large.');
  let payload;
  try { payload = JSON.parse(text); }
  catch { throw new Error('This shared list file is invalid or incomplete.'); }
  return readPayload(payload);
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function readLimited(stream) {
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('This shared list is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export async function encodeShareHash(list, { compress = true } = {}) {
  const original = new TextEncoder().encode(sharedListFile(list));
  let bytes = original, mode = 'u';
  if (compress && typeof CompressionStream === 'function') {
    const compressed = await readLimited(new Blob([original]).stream().pipeThrough(new CompressionStream('gzip')));
    if (compressed.length < original.length) { bytes = compressed; mode = 'z'; }
  }
  const hash = `#share=1${mode}.${toBase64(bytes)}`;
  if (hash.length > maxHashLength) throw new Error('This list is too large for a link. Use Download list file to share it instead.');
  return hash;
}

export async function decodeShareHash(hash) {
  if (hash.length > maxHashLength) throw new Error('This shared link is too long. Ask for a shared list file instead.');
  const match = hash.match(/^#share=1([uz])\.([a-zA-Z0-9_-]+)$/);
  if (!match) throw new Error('This shared link is invalid or incomplete.');
  let bytes;
  try {
    const base64 = match[2].replace(/-/g, '+').replace(/_/g, '/');
    bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  } catch { throw new Error('This shared link is invalid or incomplete.'); }
  if (match[1] === 'z') {
    if (typeof DecompressionStream !== 'function') throw new Error('Please use a newer browser to open this link, or ask for a shared list file.');
    try { bytes = await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))); }
    catch { throw new Error('This shared link is damaged or too large. Ask the sender for a new link or list file.'); }
  }
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('This shared link is invalid or incomplete.'); }
  return parseSharedListFile(text);
}

export function addSharedList(state, shared, newId) {
  // Validate again at the save boundary, and construct fresh word IDs locally.
  const incoming = parseSharedListFile(sharedListFile(shared));
  const signature = listSignature(incoming);
  const existing = state.lists.find(list => listSignature(list) === signature);
  if (!existing && (typeof newId !== 'string' || !newId || state.lists.some(list => list.id === newId))) {
    throw new Error('Could not save this list. Please try again.');
  }
  const list = existing || { ...incoming, id: newId };
  return { ...state, lists: existing ? state.lists : [...state.lists, list], selected: list.id, selectedListIds: [list.id] };
}
