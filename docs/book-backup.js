import {validate} from './model.js';
import {bookInfo} from './ledger-store.js';

const columns = ['資料類型','日期','收支','名稱','分類','金額（TWD）','發票號碼','目標金額（TWD）','已存金額（TWD）','識別碼','所屬紀錄','分類識別碼','圖標','顏色','目標樣式','建立時間'];
const kinds = {income:'收入', expense:'支出'};
const types = new Map(Object.entries(kinds).map(([key,label]) => [label,key]));
const amountText = value => (value / 100).toFixed(2);
function cash(text) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw Error('CSV 金額格式有誤。');
  return Math.round(Number(text)*100);
}
// Quote fields and protect spreadsheet text cells. Doubling a literal leading
// apostrophe lets a Pocketday CSV round trip through the importer losslessly.
function csvCell(value) {
  let text = String(value ?? '');
  if (/^'|^\s*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function exportBook(format, meta, book, when = new Date()) {
  const details = bookInfo(meta);
  if (format === 'json') return JSON.stringify({app:'pocketday',version:1,exportedAt:when.toISOString(),ledger:details,book},null,2);
  if (format !== 'csv') throw Error('未知的匯出格式。');
  const rows = [columns];
  function add(kind, fields) {
    const row = Array(columns.length).fill('');
    row[0] = kind;
    for (const [index,value] of Object.entries(fields)) row[index] = value;
    rows.push(row);
  }
  add('帳本',{3:details.name,12:details.icon,13:details.color});
  const cats = new Map(book.categories.map(c => [c.id,c.name]));
  for (const r of book.records) {
    add('收支',{1:r.date,2:kinds[r.type],3:r.title,4:cats.get(r.cat),5:amountText(r.amount),6:r.invoice,9:r.id,11:r.cat,15:r.created});
    for (const item of r.items) add('品項',{3:item.name,5:amountText(item.amount),10:r.id});
  }
  for (const c of book.categories) add('分類',{2:kinds[c.type],3:c.name,9:c.id,12:c.icon,13:c.color});
  for (const g of book.goals) add('理財目標',{3:g.name,7:amountText(g.target),8:amountText(g.saved),9:g.id,14:g.theme});
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function parseRows(source) {
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finish = () => { row.push(cell.startsWith("'") ? cell.slice(1) : cell); cell=''; closed=false; };
  for (let i=0; i<source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (source[i+1] === '"') { cell += '"'; i++; }
      else { quoted=false; closed=true; }
    } else if (ch === ',') finish();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i+1] === '\n') i++;
      finish(); rows.push(row); row=[];
    } else if (ch === '"' && !cell && !closed) quoted=true;
    else if (closed || ch === '"') throw Error('CSV 引號或分隔符號有誤。');
    else cell += ch;
  }
  if (quoted) throw Error('CSV 檔案不完整。');
  if (row.length || cell || closed) { finish(); rows.push(row); }
  return rows;
}
export function importBook(text, csv) {
  text = text.replace(/^\uFEFF/, '');
  if (!csv) {
    let backup;
    try { backup = JSON.parse(text); } catch { throw Error('無法讀取小日帳 JSON 備份。'); }
    if (backup?.app !== 'pocketday' || backup.version !== 1) throw Error('無法辨識備份版本。');
    return {data:validate(backup.book), meta:backup.ledger ? bookInfo(backup.ledger) : null};
  }
  const [header,...rows] = parseRows(text);
  const invalid = () => { throw Error('CSV 格式有誤，請選擇小日帳匯出的完整 CSV。'); };
  if (!header || header.length !== columns.length || columns.some((c,i)=>c!==header[i])) invalid();
  const data = {categories:[],records:[],goals:[]};
  let meta;
  const items = new Map();
  for (const row of rows) {
    if (row.length !== columns.length) invalid();
    const [kind,date,type,name,,amount,invoice,target,saved,id,parent,cat,icon,color,theme,created] = row;
    switch (kind) {
      case '帳本':
        if (meta) invalid();
        meta = bookInfo({name,icon,color}); break;
      case '分類':
        data.categories.push({id,name,type:types.get(type),icon,color}); break;
      case '收支':
        if (!created.trim()) invalid();
        data.records.push({id,date,title:name,type:types.get(type),cat,amount:cash(amount),invoice,created:Number(created),items:[]}); break;
      case '品項':
        if (!items.has(parent)) items.set(parent,[]);
        items.get(parent).push({name,amount:cash(amount)}); break;
      case '理財目標':
        data.goals.push({id,name,target:cash(target),saved:cash(saved),theme}); break;
      default: invalid();
    }
  }
  if (!meta) invalid();
  for (const r of data.records) { r.items = items.get(r.id) || []; items.delete(r.id); }
  if (items.size) invalid();
  return {data:validate(data),meta};
}

export function downloadBook(format, meta, book, date) {
  const csv = format === 'csv';
  const blob = new Blob([exportBook(format,meta,book)], {type:csv?'text/csv;charset=utf-8':'application/json'});
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url;
  link.download='小日帳-'+meta.name.replace(/[\\/:*?"<>|]/g,'_')+'-'+date+'.'+format;
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
