import {esc, palette} from './model.js';
import {icon} from './icons.js';
import {bookIcons} from './ledger-store.js';

export function bookMark(meta) {
  return `<span aria-hidden="true" class="ledger-mark" style="--ledger-color:${meta.color}">${esc(meta.icon)}</span>`;
}
const action = (act, label, style='secondary', key='', glyph='') =>
  `<button type="button" class="btn ${style}" data-act="${act}" data-key="${esc(key)}">${glyph ? icon(glyph,16) : ''}${label}</button>`;
export function bookShelf(books, active) {
  const cards = books.map(meta => `<article class="panel ledger-card">
    <div class="ledger-card-head">${bookMark(meta)}${meta.id===active ? '<span class="current-book">'+icon('check',14)+'目前使用</span>' : ''}</div>
    <h2>${esc(meta.name)}</h2>
    <div class="ledger-actions">${action('openBook','開啟帳本','soft',meta.id)}
      <button type="button" class="iconbtn" aria-label="編輯${esc(meta.name)}" title="編輯名稱與圖標" data-act="editBook" data-key="${meta.id}">${icon('edit',17)}</button>
      <button type="button" class="iconbtn book-trash" aria-label="刪除${esc(meta.name)}" title="刪除帳本" data-act="removeBook" data-key="${meta.id}">${icon('trash',17)}</button></div>
  </article>`).join('');
  return `${cards ? '<div class="ledger-grid">'+cards+'</div>' : '<div class="panel empty">'+icon('book',32)+'<h3>建立你的第一本帳本</h3><p>也可以匯入先前的小日帳備份。</p></div>'}
    <div class="ledger-import">${action('import','從備份建立帳本','secondary','','upload')}<input type="file" id="importFile" accept=".csv,.json,text/csv,application/json" hidden></div>`;
}
export function bookEditor(meta, verb='儲存變更') {
  const colorNames=['珊瑚橘','青綠','霧藍','紫色','金黃','灰藍','粉紅','湖藍'];
  return `<form id="bookForm" class="ledger-form">
    <div class="ledger-preview">${bookMark(meta)}<b id="bookPreviewName">${esc(meta.name || '帳本預覽')}</b></div>
    <label class="field">帳本名稱<input required maxlength="40" name="name" value="${esc(meta.name)}" placeholder="例如：家庭生活"></label>
    <fieldset><legend>帳本圖標</legend><div class="glyph-options">${bookIcons.map(mark=>`<button type="button" data-act="pickIcon" data-icon="${mark}" aria-label="選用 ${mark}" aria-pressed="${meta.icon===mark}">${mark}</button>`).join('')}</div>
    <label class="field">自訂圖標<input name="icon" required maxlength="32" value="${esc(meta.icon)}" placeholder="輸入表情符號或一至三個字"></label></fieldset>
    <fieldset><legend>圖標底色</legend><div class="swatches">${[...new Set([...palette,meta.color])].map((color,i)=>`<label><input type="radio" name="color" value="${color}" aria-label="${colorNames[i] || '自訂色'}" ${color===meta.color?'checked':''}><span style="--c:${color}"></span></label>`).join('')}</div></fieldset>
    <div class="form-error" role="alert"></div><div class="dialog-actions">${action('close','取消')}<button type="submit" class="btn primary">${verb}</button></div></form>`;
}
export function exportButtons(prefix='export') {
  return `<div class="ledger-export">${action(prefix+'Json','匯出 JSON','secondary','','download')}${action(prefix+'Csv','匯出 CSV','secondary','','download')}</div>`;
}
export function deleteReview({meta,data}) {
  return `<div class="delete-review"><p>刪除「<strong>${esc(meta.name)}</strong>」會一併移除以下資料。</p>
    <div class="ledger-counts"><span><b>${data.records.length}</b> 筆收支</span><span><b>${data.categories.length}</b> 個分類</span><span><b>${data.goals.length}</b> 個目標</span></div>
    <h3>先備份這本帳本</h3><p class="helper">兩種格式都能還原此帳本。下載後可繼續確認，或取消刪除。</p>
    ${exportButtons('beforeDelete')}<div class="form-error" role="alert"></div><div class="dialog-actions">${action('close','保留帳本')}${action('confirmBookName','繼續刪除','danger')}</div></div>`;
}
export function deleteFinal(meta) {
  return `<form id="deleteBookForm"><p>請輸入完整帳本名稱「<strong>${esc(meta.name)}</strong>」以確認永久刪除。</p>
    <label class="field">帳本名稱<input name="confirmName" required maxlength="40" autocomplete="off" placeholder="輸入完整名稱"></label>
    <p class="helper">刪除後，需匯入先前的備份才能還原。</p>
    <div class="form-error" role="alert"></div><div class="dialog-actions">${action('close','保留帳本')}<button type="submit" class="btn danger" disabled>永久刪除帳本</button></div></form>`;
}
