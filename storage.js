// storage.js — IndexedDB handle persistence and BRAIN.md file operations.
// All File System Access API and IndexedDB code lives here. No DOM. No LLM.

const DB_NAME = 'total-recall-db';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'brain-folder';

const BRAIN_FILENAME = 'BRAIN.md';
const DECISIONS_HEADER = '## Decisions Log';
const TEMPLATE_PATH = 'BRAIN-template.md';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolderHandle(handle) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  } catch (err) {
    console.error('[Total Recall] saveFolderHandle failed:', err);
    return false;
  }
}

export async function getFolderHandle() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (err) {
    console.error('[Total Recall] getFolderHandle failed:', err);
    return null;
  }
}

// Returns true if readwrite permission is granted.
// May call requestPermission, which REQUIRES a user gesture context.
export async function verifyPermission(handle) {
  try {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    const current = await handle.queryPermission(opts);
    if (current === 'granted') return true;
    if (current === 'denied') return false;
    const requested = await handle.requestPermission(opts);
    return requested === 'granted';
  } catch (err) {
    console.error('[Total Recall] verifyPermission failed:', err);
    return false;
  }
}

// --- BRAIN.md file operations ---

async function fetchTemplate() {
  const url = chrome.runtime.getURL(TEMPLATE_PATH);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${TEMPLATE_PATH} returned ${res.status}`);
  return await res.text();
}

async function getBrainFileHandle(dirHandle, { create }) {
  return await dirHandle.getFileHandle(BRAIN_FILENAME, { create });
}

async function brainFileExists(dirHandle) {
  try {
    await dirHandle.getFileHandle(BRAIN_FILENAME, { create: false });
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') return false;
    throw err;
  }
}

export async function readBrain(handle) {
  try {
    if (!handle) return '';
    const exists = await brainFileExists(handle);
    if (!exists) return '';
    const fileHandle = await getBrainFileHandle(handle, { create: false });
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (err) {
    console.error('[Total Recall] readBrain failed:', err);
    return '';
  }
}

// Creates BRAIN.md from the bundled template if it does not yet exist.
// If a BRAIN.md already exists, leaves it untouched and returns true.
export async function initBrain(handle) {
  try {
    if (!handle) return false;
    if (await brainFileExists(handle)) return true;
    const template = await fetchTemplate();
    const fileHandle = await getBrainFileHandle(handle, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(template);
    await writable.close();
    return true;
  } catch (err) {
    console.error('[Total Recall] initBrain failed:', err);
    return false;
  }
}

// Appends an Engram entry directly under the "## Decisions Log" header.
// Most recent entry ends up at the top of the Decisions Log section.
// Auto-initializes BRAIN.md from template if missing.
export async function appendToBrain(handle, entry) {
  try {
    if (!handle) return false;
    const trimmed = (entry || '').trim();
    if (!trimmed) return false;

    if (!(await brainFileExists(handle))) {
      const ok = await initBrain(handle);
      if (!ok) return false;
    }

    const fileHandle = await getBrainFileHandle(handle, { create: false });
    const current = await (await fileHandle.getFile()).text();

    const idx = current.indexOf(DECISIONS_HEADER);
    if (idx === -1) {
      console.error('[Total Recall] appendToBrain: "## Decisions Log" header not found in BRAIN.md');
      return false;
    }
    const insertAt = idx + DECISIONS_HEADER.length;
    const updated = current.slice(0, insertAt) + '\n\n' + trimmed + '\n' + current.slice(insertAt);

    const writable = await fileHandle.createWritable();
    await writable.write(updated);
    await writable.close();
    return true;
  } catch (err) {
    console.error('[Total Recall] appendToBrain failed:', err);
    return false;
  }
}
