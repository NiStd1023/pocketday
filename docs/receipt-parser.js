import {isCash, validDate} from './model.js';

const han = /\p{Script=Han}/u;
const badText = /[\u0000-\u001f\u007f-\u009f\ufffd]|ï¿½|(?:Ã.|Â.){2,}/u;
const priceEnd = /(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(?:元|TWD|TX|T)?$/i;
const countLabel = /(?:共\s*(\d{1,4})\s*(?:個?品項|項)|(?:品項數|品項筆數)\s*[:：]?\s*(\d{1,4}))/;
const columnHeading = /^(?:(?:品名|品項名稱|商品名稱|服務項目)\s*(?:數量|單價|金額|小計)|(?:商品|交易|消費|品項|銷貨)明細\s*$|(?:item|description)\s+(?:qty|quantity|price|amount))/i;
const counterPrefix = /^[*#]\s*\d{3,12}\s+(.+)$/;
const paidTotal = /^(?:實付(?:總額|金額)?|應付(?:總額|金額)?|amount\s*(?:due|paid)|balance\s*due)/i;
const otherTotal = /^(?:發票金額|(?:含稅)?(?:總計|總額|總價|合計|總金額)|grand\s*total|total\b)/i;
const subtotal = /^(?:小計|sub[ -]?total\b)/i;
const payment = /^(?:(?:LINE|APPLE|GOOGLE|SAMSUNG|JKO|街口|台灣|全|悠遊)\s*PAY\b|付款(?:方式|金額)|支付方式|現金|信用卡|找零|刷卡|電子支付|行動支付|悠遊卡|一卡通|積分|點數|紅利|餘額|載具(?:號碼|編號)|共通性載具|CASH\b|CHANGE\b|TENDER\b|PAYMENT\b|CARD\b|VISA\b|MASTERCARD\b)/i;
const tenderAmount = /^(?:(?:LINE|APPLE|GOOGLE|SAMSUNG|JKO|街口|台灣|全|悠遊)\s*PAY|信用卡|刷卡|VISA|MASTERCARD|一卡通|悠遊卡)\s*[:：$]?\s*(?:NT\$\s*)?[\d,]+(?:\.\d{1,2})?\s*(?:元|TWD)?$/i;
const countBoundary = /^(?:\p{Script=Han}\s*)?\d{1,3}\s*項(?:\s|[.,:，。]|$)/u;
const adjustment = /^(?:折扣|折讓|優惠(?:金額|折抵)|折抵|加值稅|營業稅|稅額|未稅|服務費|discount\b|tax\b)/i;
const metadata = /^(?:營業人|統一編號|統編|賣方|買方|電話|地址|門市|店號|分店|櫃號|機號|台號|交易(?:序號|編號|單號|日期|時間)|銷貨號碼|發票|電子發票|載具|收據|收銀|序\s*[:：]|員\s*[:：]|日期|時間|會員|條碼|隨機碼|請保留|請妥善|TEL\b|ADDRESS\b|INVOICE\b|RECEIPT\b|DATE\b|TIME\b|ORDER\b|TERMINAL\b|CASHIER\b)/i;
const compact = s => s.normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/(?<=\p{Script=Han}) (?=\p{Script=Han})/gu, '');
const promo = /^買\s*(\d+)\s*送\s*(\d+)(?:\s*(?:NT\s*)?\$\s*[\d,.]+)?$/i;

// Keep row geometry for split price columns, confidence checks and a local image review.
export function receiptRows(data) {
  const lines = (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines));
  if (!lines.length) return (data.text || '').split(/\r?\n/).map(text => ({text:compact(text)})).filter(r => r.text);
  const rows = lines.map(l => ({text:compact(l.text), bbox:l.bbox, words:l.words || []}))
    .filter(r => r.text).sort((a,b) => (a.bbox.y0+a.bbox.y1) - (b.bbox.y0+b.bbox.y1));
  const merged = [];
  const priceOnly = /^(?:NT\$|\$)?\s*[\d,.]+\s*(?:元|TWD|TX|T)?$/i;
  for (const row of rows) {
    const prev = merged.at(-1);
    if (prev) {
      const [left,right] = prev.bbox.x0 < row.bbox.x0 ? [prev,row] : [row,prev];
      const a=left.bbox, b=right.bbox;
      const height = Math.min(a.y1-a.y0, b.y1-b.y0);
      if (height>0 && a.x1<b.x0 && Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0) >= height*.65
          && !priceOnly.test(left.text) && priceOnly.test(right.text)) {
        merged[merged.length-1] = {text:left.text+' '+right.text, words:[...left.words,...right.words],
          bbox:{x0:a.x0, x1:b.x1, y0:Math.min(a.y0,b.y0), y1:Math.max(a.y1,b.y1)}};
        continue;
      }
    }
    merged.push(row);
  }
  return merged;
}

export function readableName(name) {
  if (!name || name.length>120 || badText.test(name) || /[|={}<>]{2,}/.test(name)) return false;
  return han.test(name) || /[A-Za-z]{2,}/.test(name) || /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d-]{2,12}$/.test(name);
}

function priceAtEnd(text) {
  const match = text.match(priceEnd);
  if (!match || /[a-z\d,./-]/i.test(text[match.index-1] || ' ')) return null;
  const amount = Math.round(Number(match[1].replace(/,/g,''))*100);
  return isCash(amount,true) ? {amount,index:match.index} : null;
}

function counterLabel(text) {
  const match=text.match(counterPrefix);
  return match && !priceAtEnd(match[1]) ? match[1] : '';
}

function readableWords(words) {
  const scored = words.filter(w => /[\p{L}\d]/u.test(w.text) && Number.isFinite(w.confidence));
  if (!scored.length) return true;
  return scored.every(w=>w.confidence>=40) && scored.reduce((sum,w)=>sum+w.confidence,0)/scored.length>=65;
}

function receiptDate(text) {
  const match = text.match(/(?:^|\D)(20\d{2}|1\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})(?!\d)/);
  if (!match) return '';
  const year = +match[1]+(match[1].length===3?1911:0);
  const date = [year,match[2].padStart(2,'0'),match[3].padStart(2,'0')].join('-');
  return validDate(date) ? date : '';
}

function productName(prefix, quantityColumn) {
  // Some tills print the advertised price in the description and again in the price column.
  let name = prefix.replace(/^[*#]\s*\d{3,12}\s+/, '').replace(/\s*(?:NT\$|[$＄:：])\s*$/i,'').trim()
    .replace(/\s+(?:[×x*]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[×x*]\s*\d+(?:\.\d+)?)$/i,'').trim();
  if (quantityColumn) name = name.replace(/\s+\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?)?$/, '').trim();
  const deal = name.match(promo);
  if (deal) return '買'+deal[1]+'送'+deal[2];
  return name;
}

function merchandiseStart(rows) {
  const heading=rows.findIndex(row=>columnHeading.test(row.text) || counterLabel(row.text));
  if (heading>=0) return heading;
  let start=0;
  for (const [i,{text}] of rows.entries()) {
    if (paidTotal.test(text) || otherTotal.test(text) || subtotal.test(text) || payment.test(text) || countLabel.test(text)) break;
    if (metadata.test(text) || receiptDate(text)) start=i+1;
  }
  return start;
}

function sumOrConflict(totals) {
  for (const group of [totals.paid, totals.final]) {
    const values = new Set(group);
    if (values.size===1) return {amount:group[0], conflict:false};
    if (values.size>1) return {amount:0, conflict:true};
  }
  return {amount:0,conflict:false};
}

export function receiptTitle(items, counter='', count=null) {
  if (!items.length) return '';
  const first = items[0].name;
  if (items.length===1) return counter && promo.test(first) ? counter+'（'+first+'）' : first;
  return count===null || count===items.length ? first+'等 '+items.length+' 項' : first+'等';
}

export function parseReceiptRows(rows, fixed={}) {
  const numberPattern = /(?:發票(?:字軌)?號碼\s*[:：]?\s*|^)([A-Z]{2})[ \t]*[-–]?[ \t]*(\d(?:[ \t]?\d){7})(?![\dA-Z])/i;
  const numberMatch = rows.map(r=>r.text.match(numberPattern)).find(Boolean);
  const invoice = fixed.invoice || (numberMatch ? numberMatch[1].toUpperCase()+'-'+numberMatch[2].replace(/\s/g,'') : '');
  const dated=rows.filter(r=>!/有效期|到期日|兌換期限|使用期限|expiry|expiration/i.test(r.text))
    .map(r=>({value:receiptDate(r.text),labelled:/日期|交易日|開立日|\bdate\b/i.test(r.text)})).filter(d=>d.value);
  const labelled=dated.filter(d=>d.labelled);
  const dates=new Set((labelled.length?labelled:dated).map(d=>d.value));
  const date=fixed.date || (dates.size===1 ? [...dates][0] : '');
  const printedCounts = rows.map(r=>r.text.match(countLabel)).filter(Boolean).map(m=>Number(m[1]||m[2]));
  const expected = fixed.expected ?? (new Set(printedCounts).size===1 ? printedCounts[0] : null);
  const start = merchandiseStart(rows);
  const tenders=[],cash=[],change=[],subtotals=[];
  const totals={paid:[],final:[]}, items=[], uncertain=[], candidateRows=[], totalRows=[], issues=[];
  let counter='', firstCounter='', unclearCounter=null, firstUnclearCounter=null, ended=false, quantityColumn=false;
  for (const [i,row] of rows.entries()) {
    const {text,words=[]}=row;
    const pricedText=text.replace(/\s+[,;:.]+$/, '');
    const price=priceAtEnd(pricedText);
    const priceIndex=words.findLastIndex(w=>/\d/.test(w.text));
    const priceClear=priceIndex<0 || words[priceIndex].confidence>=60;
    if (columnHeading.test(text)) {
      ended=false;
      quantityColumn=/數量|quantity|qty/i.test(text);
      continue;
    }
    const label=counterLabel(text);
    if (label) {
      counter=readableName(label) && readableWords(words.slice(1)) ? label : '';
      unclearCounter=counter ? null : i;
      ended=false;
      continue;
    }
    const totalText=text.replace(/^(?:共\s*\d+\s*(?:個?品項|項))[\s。,:;，、]*/, '');
    const countOnly=/(?:筆數|項數|件數|數量)/.test(totalText);
    const paid=!countOnly && paidTotal.test(totalText), final=!countOnly && otherTotal.test(totalText);
    if (paid || final) {
      const label=paid?paidTotal:otherTotal;
      const suffixAfterLabel=totalText.replace(/\s+[,;:.]+$/, '').replace(label,'');
      const totalPrice=priceAtEnd(suffixAfterLabel);
      const qualifier=totalPrice ? suffixAfterLabel.slice(0,totalPrice.index) : '';
      if (totalPrice && priceClear && /^(?:[\s:;.,()$]|金額|含稅|NTD?|TWD)*$/i.test(qualifier)) {
        totals[paid?'paid':'final'].push(totalPrice.amount);
      }
      totalRows.push(i);
      ended=true;
      continue;
    }
    if (countOnly || subtotal.test(text) || countLabel.test(text) || countBoundary.test(text) || payment.test(text)) {
      if (price && priceClear) {
        if (subtotal.test(text) || /小計/.test(text)) subtotals.push(price.amount);
        if (tenderAmount.test(pricedText)) tenders.push(price.amount);
        if (/^(?:現金(?:收款)?|cash)\s*[:$]?\s*(?:NT\$)?[\d,.]+(?:元)?$/i.test(pricedText)) cash.push(price.amount);
        if (/^(?:找零|change)\s*[:$]?\s*(?:NT\$)?[\d,.]+(?:元)?$/i.test(pricedText)) change.push(price.amount);
      }
      ended=true;
      continue;
    }
    if (ended || i<start || metadata.test(text) || adjustment.test(text)) continue;
    if (!price) {
      if (row.bbox && /\s[\dOoIlSB]*\d[\dOoIlSB]*$/i.test(text) && /[OoIlSB]\d|\d[OoIlSB]/i.test(text)) uncertain.push(i);
      continue;
    }
    const prefix=pricedText.slice(0,price.index);
    if (!prefix.trim() || /[:：;]/.test(prefix) || /\d[./-]\d/.test(prefix) ||
        /^[\d\s#*.,()$-]+$/.test(prefix) || /\*{2,}/.test(prefix)) continue;
    const name=productName(prefix,quantityColumn);
    if (!name || /^(?:NT|TWD|USD|[QX]|\d+\s*[QX]|[A-Z]{2}[- ]?\d{5,})$/i.test(name)) continue;
    const nameWords=priceIndex<0 ? words : words.slice(0,priceIndex);
    if (!readableName(name) || !readableWords(nameWords) || !priceClear) {
      uncertain.push(i);
      continue;
    }
    if (!items.length) { firstCounter=counter; firstUnclearCounter=unclearCounter; }
    items.push({name,amount:price.amount});
    candidateRows.push(i);
  }
  const total=sumOrConflict(totals);
  const itemSum=items.reduce((sum,item)=>sum+item.amount,0);
  // Tender by itself can be partial payment. Require another independent check before flagging a total.
  let tender=tenders.length===1 && !cash.length ? tenders[0] : 0;
  if (!tenders.length && cash.length===1 && change.length===1) tender=cash[0]-change[0];
  const corroborated=tender>0 && (subtotals.includes(tender) || (items.length>0 && itemSum===tender && (!expected || items.length===expected)));
  const inconsistent=total.conflict || (corroborated && total.amount>0 && tender!==total.amount);
  const amount=fixed.amount || (inconsistent?0:total.amount);
  // Excess rows are ambiguous. Taking the first N would hide misclassified headers.
  const excess=expected!==null && items.length>expected;
  const accepted=excess ? [] : items.slice(0,500);
  let itemIssue='';
  if (excess) itemIssue='票面標示 '+expected+' 項，但讀到 '+items.length+' 筆可能的商品。請對照原圖補入明細。';
  else if (expected!==null && accepted.length<expected) itemIssue='票面標示 '+expected+' 項，目前可確認 '+accepted.length+' 項。';
  else if (items.length>accepted.length) itemIssue='只帶入前 '+accepted.length+' 筆品項，請核對收據。';
  else if (uncertain.length && expected===null) itemIssue='有品名或價格讀不清楚，請核對商品區。';
  if (!accepted.length && !itemIssue) itemIssue='品名待確認，請查看收據後填寫項目名稱。';
  if (!amount) issues.push(inconsistent?'票面上的總金額互相矛盾，請核對後填入。':'未能確認總金額，請依票面填入。');
  if (!date) issues.push('日期待確認，請依票面填入。');
  const retryRows=excess || (expected!==null && accepted.length===expected) ? [] : uncertain.slice();
  const counterReview=accepted.length===1 && promo.test(accepted[0].name) ? firstUnclearCounter : null;
  if (counterReview!==null) {
    retryRows.unshift(counterReview);
    if (!itemIssue) itemIssue='櫃位名稱待確認，項目名稱先帶入票面上的促銷文字。';
  }
  if (!amount) retryRows.unshift(...totalRows);
  const reviewRows=excess ? [...candidateRows,...retryRows] : [...retryRows];

  return {title:receiptTitle(accepted,firstCounter,expected).slice(0,120),date,amount,invoice,
    items:accepted,itemIssue,issues,expected,retryRows,reviewRows,counterReview};
}

export function parseText(text) {
  return parseReceiptRows(receiptRows({text}));
}
