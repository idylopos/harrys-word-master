import { listSignature, deduplicateState } from './core.js?v=7';
import { sharedListFile, parseSharedListFile } from './sharing.js?v=7';

function remoteList(row) {
  if (!row || typeof row.id !== 'string' || !/^catalog-[a-f0-9]{64}$/.test(row.id)) throw new Error('The public catalog returned an invalid list.');
  const shared = parseSharedListFile(JSON.stringify({ format: 'harry-word-list', version: 1, name: row.name, words: row.words }));
  return { ...shared, id: row.id, catalogId: row.id };
}

export function createCatalogClient(config, fetcher = fetch) {
  const enabled = Boolean(config.url && config.anonKey);
  async function request(path, options = {}) {
    if (!enabled) throw new Error('The public catalog is not connected yet.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(`${config.url}/rest/v1/${path}`, { ...options, signal: controller.signal,
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}`, 'Content-Type': 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The public catalog could not be reached.');
      return data;
    } finally { clearTimeout(timeout); }
  }
  return {
    enabled,
    async list() {
      const lists = [];
      for (let offset = 0; offset < 5000; offset += 500) {
        const rows = await request(`word_catalog?select=id,name,words&order=created_at.asc,id.asc&limit=500&offset=${offset}`);
        if (!Array.isArray(rows)) throw new Error('The public catalog returned an invalid response.');
        lists.push(...rows.map(remoteList));
        if (rows.length < 500) return lists;
      }
      throw new Error('The public catalog is too large to load.');
    },
    async publish(list) {
      const clean = deduplicateState({ lists: [list], progress: {}, selected: list.id }).lists[0];
      const payload = JSON.parse(sharedListFile(clean));
      const rows = await request('rpc/publish_word_list', { method: 'POST', body: JSON.stringify({ payload }) });
      return remoteList(Array.isArray(rows) ? rows[0] : rows);
    }
  };
}

export function mergeCatalogLists(state, incoming) {
  const lists = [...state.lists];
  for (const published of incoming) {
    const signature = listSignature(published), index = lists.findIndex(list => listSignature(list) === signature);
    if (index >= 0) {
      lists[index] = { ...lists[index], catalogId: published.catalogId, publishPending: false };
      delete lists[index].publishError;
    } else if (!lists.some(list => list.id === published.id)) lists.push(published);
  }
  return deduplicateState({ ...state, lists });
}
