(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StudioLabAccountVault = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';
  // Extension-origin IndexedDB is separate from the host page's storage. Never
  // copy this record to chrome.storage, DOM events, diagnostics, or UI replies.
  function createVault(indexedDB) {
    let pending;
    function open() {
      if (!indexedDB) return Promise.reject(new Error('Private account storage is unavailable.'));
      if (!pending) pending = new Promise((resolve, reject) => {
        const request = indexedDB.open('studio-lab-account', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('private');
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); pending = null; };
          resolve(db);
        };
        request.onerror = () => { pending = null; reject(new Error('Private account storage is unavailable.')); };
        request.onblocked = () => { pending = null; reject(new Error('Close other account pages and retry.')); };
      });
      return pending;
    }
    async function transact(mode, operation) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('private', mode);
        const request = operation(transaction.objectStore('private'));
        let value;
        request.onsuccess = () => { value = request.result; };
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = transaction.onerror = () => reject(new Error('Could not save the private account session.'));
      });
    }
    return Object.freeze({
      get: () => transact('readonly', store => store.get('account')),
      set: value => transact('readwrite', store => store.put(value, 'account')),
      delete: () => transact('readwrite', store => store.delete('account'))
    });
  }
  return Object.freeze({ createVault });
});
