/* IndexedDB 缓存：检测结果按「序列 + 字体 + UA」为键持久化，避免每次打开重测 */
const EmojiDB = (() => {
  const DB_NAME = "emoji-compat-lab";
  const STORE = "results";
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      fn(store);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  async function getAll() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function putAll(records) {
    const db = await open();
    return tx(db, "readwrite", (store) => {
      records.forEach((r) => store.put(r));
    });
  }

  async function clear() {
    const db = await open();
    return tx(db, "readwrite", (store) => store.clear());
  }

  return { getAll, putAll, clear };
})();
