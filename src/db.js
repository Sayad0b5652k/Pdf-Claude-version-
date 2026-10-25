// @ts-nocheck

export const BUILD_TAG = 'quality-and-autozoom-2026-07-26';
console.log('%cSTRATA build: ' + BUILD_TAG, 'font-weight:bold; font-size:14px; color:#FF6A2B;');

// v11 adds the `papers` store (generated question papers + attempts). Additive, nothing is moved.
// v10 adds the small `filemeta` store (name, thumb, lastPage, folder ... without the PDF bytes).
// The `files` store is left exactly as it was: it keeps owning the binary. Upgrading is additive,
// nothing is moved or deleted, and a book that is not indexed yet gets indexed lazily (see allFileMeta).
const DB_NAME='marginal_db', DB_VER=11;
let dbP;
try{
  if(!('indexedDB' in window)) throw new Error('IndexedDB is not available in this browser context.');
  dbP = new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('files')){
        const s = db.createObjectStore('files', {keyPath:'id'});
        s.createIndex('lastOpened','lastOpened');
        s.createIndex('folder','folder');
      }
      if(!db.objectStoreNames.contains('annotations')){
        const s = db.createObjectStore('annotations', {keyPath:'id'});
        s.createIndex('fileId','fileId');
      }
      if(!db.objectStoreNames.contains('bookmarks')){
        const s = db.createObjectStore('bookmarks', {keyPath:'id'});
        s.createIndex('fileId','fileId');
      }
      if(!db.objectStoreNames.contains('notes')){
        const s = db.createObjectStore('notes', {keyPath:'id'});
        s.createIndex('fileId','fileId');
      }
      if(!db.objectStoreNames.contains('progress')){
        db.createObjectStore('progress', {keyPath:'fileId'});
      }
      if(!db.objectStoreNames.contains('settings')){
        db.createObjectStore('settings', {keyPath:'key'});
      }
      if(!db.objectStoreNames.contains('flashcards')){
        const s = db.createObjectStore('flashcards', {keyPath:'id'});
        s.createIndex('fileId','fileId');
        s.createIndex('due','due');
      }
      if(!db.objectStoreNames.contains('ocrcache')){
        const s = db.createObjectStore('ocrcache', {keyPath:'id'});
        s.createIndex('fileId','fileId');
      }
      if(!db.objectStoreNames.contains('chathistory')){
        const s = db.createObjectStore('chathistory', {keyPath:'id'});
        s.createIndex('fileId','fileId');
        s.createIndex('updatedAt','updatedAt');
      }
      if(!db.objectStoreNames.contains('summaries')){
        const s = db.createObjectStore('summaries', {keyPath:'id'});
        s.createIndex('fileId','fileId');
        s.createIndex('filePageKey','filePageKey');
        s.createIndex('updatedAt','updatedAt');
      }
      if(!db.objectStoreNames.contains('pagecache')){
        const s = db.createObjectStore('pagecache', {keyPath:'id'});
        s.createIndex('fileId','fileId');
        s.createIndex('page','page');
      }
      if(!db.objectStoreNames.contains('filemeta')){
        db.createObjectStore('filemeta', {keyPath:'id'});
      }
      if(!db.objectStoreNames.contains('papers')){
        const s = db.createObjectStore('papers', {keyPath:'id'});
        s.createIndex('fileId','fileId');
        s.createIndex('updatedAt','updatedAt');
      }
    };
    req.onblocked = ()=>console.warn('[DB] Upgrade is waiting for other tabs of this app to close.');
    req.onsuccess = ()=>{
      const db = req.result;
      // If a newer tab upgrades the schema, step aside instead of blocking it forever.
      db.onversionchange = ()=>{ try{ db.close(); }catch(e){} };
      resolve(db);
    };
    req.onerror = ()=>reject(req.error);
  });
}catch(err){
  dbP = Promise.reject(err);
}
dbP.catch(()=>{});

export async function idb(storeName, mode='readonly'){
  const db = await dbP;
  return db.transaction(storeName, mode).objectStore(storeName);
}

export function reqP(req){ return new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }

export async function normalizeBuffer(data) {
  if (!data) return null;
  try {
    if (data instanceof ArrayBuffer) {
      return data.byteLength > 0 ? data.slice(0) : null;
    }
    if (data instanceof Uint8Array) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const ab = await data.arrayBuffer();
      return ab && ab.byteLength > 0 ? ab : null;
    }
    if (data.buffer instanceof ArrayBuffer) {
      return data.buffer.byteLength > 0 ? data.buffer.slice(0) : null;
    }
    if (typeof data === 'string') {
      if (data.startsWith('data:')) {
        const comma = data.indexOf(',');
        const b64 = comma >= 0 ? data.slice(comma + 1) : data;
        const binStr = atob(b64);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
        return bytes.buffer;
      }
    }
  } catch (e) {
    console.warn('Error normalizing buffer in DB:', e);
  }
  return null;
}

/* ------------------------------------------------------------
   Book records: PDF bytes live in `files`, everything else is mirrored in `filemeta`.
   Listing the library or saving reading progress only ever touches `filemeta`, so
   it no longer reads/writes every PDF (tens of MB each) into JS memory.
   ------------------------------------------------------------ */
function stripData(rec){
  if(!rec) return rec;
  const { data, ...meta } = rec;
  return meta;
}
async function filesTx(mode){
  const db = await dbP;
  return db.transaction(['files','filemeta'], mode);
}
function txDone(tx){
  return new Promise((res,rej)=>{
    tx.oncomplete = ()=>res();
    tx.onerror = ()=>rej(tx.error);
    tx.onabort = ()=>rej(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

async function putFileRecord(rec){
  // Never let a metadata-only object wipe the stored PDF bytes.
  if(rec && rec.data === undefined){
    const existing = await reqP((await idb('files')).get(rec.id));
    if(existing && existing.data !== undefined) rec = { ...rec, data: existing.data };
  }
  const tx = await filesTx('readwrite');
  const done = txDone(tx);
  tx.objectStore('files').put(rec);
  tx.objectStore('filemeta').put(stripData(rec));
  await done;
  return rec.id;
}

async function getFileRecord(id){
  const tx = await filesTx('readonly');
  const [full, meta] = await Promise.all([
    reqP(tx.objectStore('files').get(id)),
    reqP(tx.objectStore('filemeta').get(id)),
  ]);
  if(!full) return full;
  // filemeta holds the freshest metadata; the bytes always come from `files`.
  return meta ? { ...full, ...meta, data: full.data } : full;
}

async function delFileRecord(id){
  const tx = await filesTx('readwrite');
  const done = txDone(tx);
  tx.objectStore('files').delete(id);
  tx.objectStore('filemeta').delete(id);
  await done;
}

// Library listing without PDF bytes. Books saved before v10 are indexed here, one at a
// time (so only a single PDF is in memory at once), and only the first time.
async function allFileMeta(){
  const metas = await reqP((await idb('filemeta')).getAll());
  const keys = await reqP((await idb('files')).getAllKeys());
  const keySet = new Set(keys);
  const have = new Set(metas.map(m=>m.id));
  const result = metas.filter(m=>keySet.has(m.id));
  for(const key of keys){
    if(have.has(key)) continue;
    try{
      const full = await reqP((await idb('files')).get(key));
      if(!full) continue;
      const meta = stripData(full);
      await reqP((await idb('filemeta','readwrite')).put(meta));
      result.push(meta);
    }catch(err){
      console.warn('[DB] Could not index book', key, err);
    }
  }
  // Drop index rows whose book no longer exists, so ghosts never show up in the library.
  const stale = metas.filter(m=>!keySet.has(m.id));
  for(const m of stale){
    try{ await reqP((await idb('filemeta','readwrite')).delete(m.id)); }catch(e){}
  }
  return result;
}

export const DB = {
  async put(store, val){
    if(store === 'files') return putFileRecord(val);
    const s = await idb(store,'readwrite'); return reqP(s.put(val));
  },
  async get(store, key){
    if(store === 'files') return getFileRecord(key);
    const s = await idb(store); return reqP(s.get(key));
  },
  async del(store, key){
    if(store === 'files') return delFileRecord(key);
    const s = await idb(store,'readwrite'); return reqP(s.delete(key));
  },
  // For the `files` store this returns metadata only (no PDF bytes); use get('files', id) for the bytes.
  async all(store){
    if(store === 'files') return allFileMeta();
    const s = await idb(store); return reqP(s.getAll());
  },
  allFileMeta,
  async byIndex(store, idx, val){ const s = await idb(store); return reqP(s.index(idx).getAll(val)); },
  async setting(key, val){ return this.put('settings', {key, val}); },
  async getSetting(key, fallback){ const r = await this.get('settings', key); return r ? r.val : fallback; },
  async getCachedPage(fileId, pageNum){ return this.get('pagecache', `${fileId}_p${pageNum}`); },
  async putCachedPage(fileId, pageNum, text){ return this.put('pagecache', { id: `${fileId}_p${pageNum}`, fileId, page: pageNum, text, updatedAt: Date.now() }); },
  normalizeBuffer,
  async updateFileMeta(fileId, updates){
    // Metadata only: the PDF bytes in `files` are not read or rewritten.
    let meta = await reqP((await idb('filemeta')).get(fileId));
    if (!meta) {
      // Book not indexed yet (saved before v10): derive its metadata once.
      const full = await reqP((await idb('files')).get(fileId));
      if (!full) return null;
      meta = stripData(full);
    }
    const merged = { ...meta, ...updates };
    delete merged.data;
    await reqP((await idb('filemeta','readwrite')).put(merged));
    if (window.State && Array.isArray(window.State.files)) {
      const idx = window.State.files.findIndex(f => f.id === fileId);
      if (idx > -1) {
        window.State.files[idx] = { ...merged, data: undefined };
      }
    }
    return merged;
  }
};

export const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ============================================================
   FSRS (Free Spaced Repetition Scheduler) — hand-implemented
   ============================================================ */
export const FSRS_W = [0.4,0.6,2.4,5.8,4.93,0.94,0.86,0.01,1.49,0.14,0.94,2.18,0.05,0.34,1.26,0.29,2.61];
export const FSRS_DECAY = -0.5;
export const FSRS_FACTOR = Math.pow(0.9, 1/FSRS_DECAY) - 1;

export function fsrsRetrievability(elapsedDays, stability){
  return Math.pow(1 + FSRS_FACTOR * elapsedDays / stability, FSRS_DECAY);
}
export function fsrsInitStability(grade){ return Math.max(FSRS_W[grade-1], 0.1); }
export function fsrsInitDifficulty(grade){ return Math.min(Math.max(FSRS_W[4] - (grade-3)*FSRS_W[5], 1), 10); }
export function fsrsNextDifficulty(d, grade){
  const nd = d - FSRS_W[6]*(grade-3);
  return Math.min(Math.max(nd, 1), 10);
}
export function fsrsNextStability(d, s, r, grade){
  if(grade===1){
    return Math.max(0.1, FSRS_W[11]*Math.pow(d,-FSRS_W[12])*(Math.pow(s+1,FSRS_W[13])-1)*Math.exp((1-r)*FSRS_W[14]));
  }
  const hardPenalty = grade===2? FSRS_W[15] : 1;
  const easyBonus = grade===4? FSRS_W[16] : 1;
  return s * (1 + Math.exp(FSRS_W[8]) * (11-d) * Math.pow(s,-FSRS_W[9]) * (Math.exp((1-r)*FSRS_W[10])-1) * hardPenalty * easyBonus);
}
export function fsrsSchedule(card, grade){
  const now = Date.now();
  const isNew = !card.stability;
  let stability, difficulty;
  if(isNew){
    stability = fsrsInitStability(grade);
    difficulty = fsrsInitDifficulty(grade);
  }else{
    const elapsedDays = Math.max((now - card.lastReview)/86400000, 0.001);
    const r = fsrsRetrievability(elapsedDays, card.stability);
    difficulty = fsrsNextDifficulty(card.difficulty, grade);
    stability = grade===1
      ? fsrsNextStability(difficulty, card.stability, r, grade)
      : fsrsNextStability(difficulty, card.stability, r, grade);
  }
  const targetInterval = Math.max(1, Math.round(stability * (Math.pow(0.9, 1/FSRS_DECAY) - 1) / FSRS_FACTOR));
  return {
    stability, difficulty,
    due: now + targetInterval*86400000,
    lastReview: now,
    reps: (card.reps||0)+1,
    lapses: (card.lapses||0) + (grade===1?1:0),
    state: grade===1? 'relearning' : 'review'
  };
}

export function parseFlashcardsText(text){
  const cards = [];
  const blocks = text.split(/\n(?=\s*Q\s*[:.])/i);
  for(const block of blocks){
    const qMatch = block.match(/Q\s*[:.]\s*([\s\S]*?)(?=\n\s*A\s*[:.]|$)/i);
    const aMatch = block.match(/A\s*[:.]\s*([\s\S]*)/i);
    if(qMatch && aMatch){
      const front = qMatch[1].trim();
      const back = aMatch[1].trim();
      if(front && back) cards.push({front, back});
    }
  }
  return cards;
}

/* ============================================================
   GLOBAL STATE
   ============================================================ */
export const State = {
  view:'dashboard',
  theme: 'dark',
  files: [],
  currentFile: null,
  currentDoc: null,
  currentPage: 1,
  numPages: 0,
  zoom: 1.0,
  fitMode: 'width',
  readingMode: 'continuous',
  keepAwake: false,
  autoTheme: false,
  showPageNumber: true,
  smoothScroll: true,
  streamingMode: 'sse',
  brushColor: '#FF6A2B',
  filterView: 'all',
  bookmarkFilter: 'all',
  viewMode: 'grid',
  pageList: null,
  pageListLabel: '',
  searchIndex: {},
};

// Bind to window for global availability
window.BUILD_TAG = BUILD_TAG;
window.DB = DB;
window.uid = uid;
window.fsrsSchedule = fsrsSchedule;
window.parseFlashcardsText = parseFlashcardsText;
window.State = State;
