/* storage.js — IndexedDB wrapper for ArtCraft Local Gallery */

const DB_NAME = 'ArtCraftDB';
const DB_VERSION = 1;
const STORE_NAME = 'artworks';

class StorageManager {
  constructor() {
    this.db = null;
    this.ready = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async saveArtwork(artwork) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      artwork.updatedAt = Date.now();
      const req = store.put(artwork);
      req.onsuccess = () => resolve(artwork.id);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async loadArtwork(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async listArtworks() {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = (e) => {
        // Sort by updatedAt descending
        const results = e.target.result || [];
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(results);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteArtwork(id) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }
}

window.artStorage = new StorageManager();
