import { IS_WORKER } from '../../helpers/context.ts';
import toggleStorages from '../../helpers/toggleStorages.ts';
import rootScope from '../rootScope.ts';

class SimpleStorage {
  constructor(name) {
    this.name = name;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onerror = reject;
      request.onsuccess = ev => {
        this.db = ev.target.result;
        resolve(this.db);
      };
      request.onupgradeneeded = ev => {
        this.db = ev.target.result;
        this.store = this.db.createObjectStore('values', { keyPath: 'key' });
      };
    });
  }
  setItem(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['values'], 'readwrite');
      const store = transaction.objectStore('values');
      const request = store.put({ key, value });
      request.onerror = reject;
      transaction.oncomplete = resolve;
    });
  }
  getItem(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['values'], 'readonly');
      const store = transaction.objectStore('values');
      const request = store.get(key);
      request.onerror = reject;
      request.onsuccess = ev => {
        resolve(request.result ? request.result.value : null);
      };
    });
  }
  close() {
    this.db.close();
  }
}

export class AppAccountManager {
  constructor() {
    if (IS_WORKER) {
      this.init();
    } else {
      this.initSync();
    }
  }
  init() {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        this.storage = new SimpleStorage('twebAccounts');
        await this.storage.connect();
        
        if (!this.inited) {
          this.accounts = (await this.storage.getItem('accounts')) || [];
          if (!this.accounts.length) {
            this.accounts.push({
              // default account
              uniqId: '',
            });
          }
          this.current = (await this.storage.getItem('current')) || '';
          this.previous = (await this.storage.getItem('previous')) || '';
          this.inited = true;
        }
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    return this.initPromise;
  }
  initSync() {
    this.accounts = JSON.parse(localStorage['tweb_accounts'] || '[]');
    if (!this.accounts.length) {
      this.accounts.push({
        // default account
        uniqId: '',
      });
    }
    this.current = localStorage['tweb_current'] || '';
    this.previous = localStorage['tweb_previous'] || '';
    this.inited = true;

    rootScope.addEventListener('user_auth', ({ id }) => {
      for (const acc of this.accounts) {
        if (acc.uniqId != this.current && acc.id == id) {
          this.undo(acc.uniqId);
          return;
        }
      }
      this.update({ id });
    });
    rootScope.addEventListener('logging_out', () => {
      const other = this.accounts.filter(acc => acc.uniqId != this.current);
      if (other.length == 0) {
        return; // Just log out as usual
      }
      this.undo(other[0].uniqId);
    });
  }

  async dbSuffix() {
    await this.init();
    return this.current == '' ? '' : ('_' + this.current);
  }
  async dbPrefix() {
    await this.init();
    return this.current == '' ? '' : (this.current + '_');
  }
  dbSuffixSync() {
    return this.current == '' ? '' : ('_' + this.current);
  }
  dbPrefixSync() {
    return this.current == '' ? '' : (this.current + '_');
  }

  async addNew() {
    console.log(`[!!] add new`);
    //await this.init();
    await toggleStorages(false, false);

    const uniqId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    const accounts = this.accounts.concat([{
      uniqId,
    }]);
    localStorage['tweb_accounts'] = JSON.stringify(accounts);
    localStorage['tweb_current'] = uniqId;
    localStorage['tweb_previous'] = this.current;

    await this.init();
    await Promise.all([
      this.storage.setItem('accounts', accounts),
      this.storage.setItem('current', uniqId),
      this.storage.setItem('previous', this.current),
    ]);
    window.location.reload(true);
  }

  async logout() {
    await toggleStorages(false, false);
    const accounts = this.accounts.filter(acc => acc.uniqId != this.current);
    if (!accounts.length) {
      accounts.push({ uniqId: '' });
    }
    localStorage['tweb_accounts'] = JSON.stringify(accounts);
    localStorage['tweb_current'] = '';
    localStorage['tweb_previous'] = '';

    await this.init();
    await Promise.all([
      this.storage.setItem('accounts', accounts),
      this.storage.setItem('current', ''),
      this.storage.setItem('previous', ''),
    ]);
    window.location.reload(true);
  }

  async update(account) {
    console.log(`[!!] update account to `, account);
    const acc = this.accounts.find(acc => acc.uniqId == this.current);
    if (!acc) {
      return;
    }
    Object.assign(acc, account);
    localStorage['tweb_accounts'] = JSON.stringify(this.accounts);
    await this.init();
    await Promise.all([
      this.storage.setItem('accounts', this.accounts),
    ]);
  }

  async changeTo(id) {
    console.log(`[!!] change to `, id);
    await toggleStorages(false, false);
    localStorage['tweb_current'] = id;
    localStorage['tweb_previous'] = this.current;

    await this.init();
    await Promise.all([
      this.storage.setItem('current', id),
      this.storage.setItem('previous', this.current),
    ]);
    window.location.reload(true);
  }

  // TODO: delete old storages
  async undo(id = null) {
    console.log(`[!!] undo to `, id);
    await toggleStorages(false, false);

    if (!id) {
      id = this.previous;
    }

    const accounts = this.accounts.slice(0, this.accounts.length - 1);
    localStorage['tweb_accounts'] = JSON.stringify(accounts);
    localStorage['tweb_current'] = id;
    localStorage['tweb_previous'] = '';

    await this.init();
    await Promise.all([
      this.storage.setItem('accounts', accounts),
      this.storage.setItem('current', id),
      this.storage.setItem('previous', ''),
    ]);
    window.location.reload(true);
  }
}

const appAccountManager = new AppAccountManager();
export default appAccountManager;
