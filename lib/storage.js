// IndexedDB 持久层：缓存检测结果、保存用户手动覆盖（强制降级/强制原生）。
// 任何失败都降级为内存 Map，保证隐私模式等场景下页面可用。

const DB_NAME = 'emoji-compat-lab';
const DB_VERSION = 1;

export class EmojiStorage {
  constructor() {
    this.db = null;
    this.memory = { cache: new Map(), overrides: new Map() };
    this.degraded = false;
  }

  async open() {
    if (typeof indexedDB === 'undefined') {
      this.degraded = true;
      return this;
    }
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
          if (!db.objectStoreNames.contains('overrides')) db.createObjectStore('overrides');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.degraded = true;
    }
    return this;
  }

  async get(store, key) {
    if (this.degraded || !this.db) return this.memory[store].get(key) ?? null;
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return this.memory[store].get(key) ?? null;
    }
  }

  async set(store, key, value) {
    this.memory[store].set(key, value);
    if (this.degraded || !this.db) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      this.degraded = true;
    }
  }

  async delete(store, key) {
    this.memory[store].delete(key);
    if (this.degraded || !this.db) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      this.degraded = true;
    }
  }

  async clearStore(store) {
    this.memory[store].clear();
    if (this.degraded || !this.db) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      this.degraded = true;
    }
  }

  getCache(key) { return this.get('cache', key); }
  setCache(key, value) { return this.set('cache', key, value); }
  getOverride(id) { return this.get('overrides', id); }
  setOverride(id, value) { return value ? this.set('overrides', id, value) : this.delete('overrides', id); }
  async getAllOverrides() {
    if (this.degraded || !this.db) return new Map(this.memory.overrides);
    try {
      return await new Promise((resolve, reject) => {
        const tx = this.db.transaction('overrides', 'readonly');
        const store = tx.objectStore('overrides');
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () => {
          const map = new Map();
          keysReq.result.forEach((k, i) => map.set(k, valsReq.result[i]));
          resolve(map);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      return new Map(this.memory.overrides);
    }
  }
}

// 检测缓存键：同一 UA + 字体栈 + Emoji 序列 才复用结果，避免跨环境误判。
export function cacheKey(emoji, envTag) {
  return `${envTag}::${emoji}`;
}
