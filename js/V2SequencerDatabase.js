class V2SequencerDatabase {
  static #getStore(store, handler) {
    const request = window.indexedDB.open('sequencer', 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries'))
        db.createObjectStore('entries', {
          keyPath: 'id',
          autoIncrement: true
        });
    };

    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, 'readwrite');
      transaction.oncomplete = () => {
        db.close();
      };

      if (handler)
        handler(transaction.objectStore(store));
    };
  }

  static add(data, handler) {
    this.#getStore('entries', (store) => {
      store.add(data).onsuccess = (event) => {
        if (handler)
          handler(event.target.result);
      };
    });
  }

  static forEach(handler) {
    const entries = [];

    this.#getStore('entries', (store) => {
      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          entries.push(cursor.value);
          cursor.continue();

        } else
          handler(entries);
      };
    });
  }

  static delete(id, handler) {
    this.#getStore('entries', (store) => {
      store.delete(id);
    });

    this.#getStore('entries', (store) => {
      store.delete(name).onsuccess = () => {
        if (handler)
          handler();
      };
    });
  }
}
