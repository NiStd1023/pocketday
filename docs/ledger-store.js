import {demoBook, emptyBook, palette, uid, validate} from './model.js';

export const bookIcons = ['📒', '🏠', '✈️', '☕', '💼', '🎓', '🎯', '🌱'];
const defaults = [
  {id:'personal', name:'我的帳本', icon:'📒', color:palette[0], order:0},
  {id:'demo', name:'示範帳本', icon:'🌱', color:palette[1], order:1}
];

export function bookInfo({name, icon, color}) {
  name = String(name ?? '').trim();
  icon = String(icon ?? '').trim();
  if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) throw Error('帳本名稱請填寫 1 至 40 個字元。');
  const length = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter().segment(icon)].length : [...icon.replace(/[\uFE0F\u200D]/g, '')].length;
  if (!icon || icon.length > 32 || length > 3 || /[\x00-\x1f\x7f]/.test(icon)) throw Error('圖標可使用一個表情符號，或一至三個文字。');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('請選擇圖標底色。');
  return {name, icon, color};
}

let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const req = indexedDB.open('pocketday-local-v1', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      const books = db.objectStoreNames.contains('books')
        ? req.transaction.objectStore('books') : db.createObjectStore('books');
      const catalog = db.createObjectStore('catalog', {keyPath:'id'});
      for (const old of defaults) {
        catalog.add({...old, version:0});
        const request = books.get(old.id);
        request.onsuccess = () => {
          if (request.result === undefined) books.add({rev:0, data:old.id === 'demo' ? demoBook() : emptyBook()}, old.id);
        };
      }
    };
    req.onblocked = () => window.dispatchEvent(new Event('pocketday-upgrade-blocked'));
    req.onerror = () => { connection = null; reject(req.error); };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  });
  return connection;
}
function result(request) {
  return new Promise((yes, no) => {
    request.onsuccess = () => yes(request.result);
    request.onerror = () => no(request.error);
  });
}
async function transact(stores, mode, operation) {
  const db = await database();
  const tx = db.transaction(stores, mode);
  const done = new Promise((yes, no) => {
    tx.oncomplete = yes;
    tx.onabort = () => no(tx.error || Error('交易已取消，請重新開啟帳本後再試。'));
  });
  try {
    const [value] = await Promise.all([operation(tx), done]);
    return value;
  } catch (error) {
    try { tx.abort(); } catch {}
    throw error;
  }
}

export function listBooks() {
  return transact(['catalog'], 'readonly', async tx => {
    const rows = await result(tx.objectStore('catalog').getAll());
    return rows.sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
  });
}
async function snapshot(tx, key) {
  const [meta, book] = await Promise.all([
    result(tx.objectStore('catalog').get(key)), result(tx.objectStore('books').get(key))
  ]);
  if (!meta || !book) throw Error('這本帳本已刪除，請選擇其他帳本。');
  return {...book, meta};
}
export const readBook = key => transact(['catalog','books'], 'readonly', tx => snapshot(tx,key));

async function unique(catalog, info, id) {
  const rows = await result(catalog.getAll());
  if (rows.some(item => item.id !== id && item.name === info.name)) throw Error('已有同名帳本，請換一個名稱。');
}
export function createBook(details, data = emptyBook()) {
  const info = bookInfo(details);
  validate(data);
  return transact(['catalog','books'], 'readwrite', async tx => {
    const catalog = tx.objectStore('catalog');
    await unique(catalog,info);
    const meta = {...info, id:uid(), version:0, order:Date.now()};
    await result(catalog.add(meta));
    await result(tx.objectStore('books').add({rev:0,data},meta.id));
    return meta;
  });
}
export function editBook(id, version, details) {
  const info = bookInfo(details);
  return transact(['catalog'], 'readwrite', async tx => {
    const catalog = tx.objectStore('catalog');
    const current = await result(catalog.get(id));
    if (!current || current.version !== version) throw Error('帳本設定已變更，請重新開啟後再編輯。');
    await unique(catalog,info,id);
    const meta = {...current,...info,version:version+1};
    await result(catalog.put(meta));
    return meta;
  });
}
export function commit(key, rev, change) {
  return transact(['books','catalog'], 'readwrite', async tx => {
    const current = await snapshot(tx,key);
    if (current.rev !== rev) throw Error('帳本已在另一個視窗更新，請重新開啟並確認。');
    const data = validate(change(current.data) || current.data);
    const next = {rev:rev+1, data};
    await result(tx.objectStore('books').put(next,key));
    return next;
  });
}
export function deleteBook(meta, rev, typedName) {
  return transact(['books','catalog'], 'readwrite', async tx => {
    const current = await snapshot(tx,meta.id);
    if (current.rev !== rev || current.meta.version !== meta.version)
      throw Error('帳本內容或名稱已更新。請取消後重新檢查並備份。');
    if (typedName !== current.meta.name) throw Error('輸入的名稱與帳本不符。');
    await result(tx.objectStore('books').delete(meta.id));
    await result(tx.objectStore('catalog').delete(meta.id));
  });
}
