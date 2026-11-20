import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceiptRows,parseText,receiptRows} from '../docs/receipt-parser.js';
import {parseQR,reconcileItems} from '../docs/scan.js';

test('a counter promotion is one purchase; quantity, totals, payment and loyalty are not products',()=>{
  const r=parseText([
    '載具銷貨明細','營業人名稱：練習百貨','交易序號 0086','日期：2025-08-19',
    '*123456 練習茶坊','1000000000001','買 2 送 1$150 150','1 Q 150TX',
    '共 1 項 。 小計 150','總計 150','LINE PAY 150','1 Hae 150','發票金額 150','積分 150',
  ].join('\n'));
  assert.deepEqual(r.items,[{name:'買2送1',amount:15000}]);
  assert.equal(r.title,'練習茶坊（買2送1）');
  assert.equal(r.invoice,'');
  assert.equal(r.date,'2025-08-19');
  assert.equal(r.amount,15000);
  assert.equal(r.itemIssue,'');
});
test('a damaged count label still separates the footer',()=>{
  const r=parseText('綠茶 45\ni a 45\n多 1 項 heh 45\nfooter text 45\nLINE PAY 45\n總計 45');
  assert.deepEqual(r.items,[{name:'綠茶',amount:4500}]);
  assert.ok(r.itemIssue);
});
test('two real products can have the same price and name',()=>{
  const r=parseText('紅茶 45\n紅茶 45\n共2項 合計 90\n現金 100\n找零 10');
  assert.equal(r.items.length,2);
  assert.equal(r.title,'紅茶等 2 項');
  assert.equal(r.amount,9000);
});
test('a transaction number, issuer, receipt title and barcode cannot name the transaction',()=>{
  const r=parseText('交易序號 0086\n門市 0012\n銷貨號碼 AB12345678\n123456789\n電子發票 17\n總計 75');
  assert.deepEqual(r.items,[]);
  assert.equal(r.title,'');
  assert.equal(r.invoice,'');
  assert.equal(r.amount,7500);
});
test('use table heading after a receipt header total and remove quantity/unit-price columns',()=>{
  const r=parseText('AB-12345678\n日期 114/08/19\n總計 120\n品名 數量 單價 小計\n紅茶 2 30 60\n3M 膠帶 1 60 60\n共2項');
  assert.deepEqual(r.items,[{name:'紅茶',amount:6000},{name:'3M 膠帶',amount:6000}]);
  assert.equal(r.date,'2025-08-19');
  assert.equal(r.invoice,'AB-12345678');
});
test('exclude numbered shop headers before the dated transaction, even without column headings',()=>{
  const r=parseText('練習商店 0086\n日期 2025-08-19\n蛋餅 45\n共 1 項\n發票金額 45');
  assert.deepEqual(r.items,[{name:'蛋餅',amount:4500}]);
  assert.equal(r.title,'蛋餅');
});
test('cash less change corroborates a conflicting final figure, with split payments kept separate',()=>{
  const r=parseText('蛋餅 45\n小計 45\n總計 95\n現金 100\n找零 55');
  assert.equal(r.amount,0);
  const split=parseText('餐點 80\n總計 80\nLINE PAY 30\n現金 50\n找零 0');
  assert.equal(split.amount,8000);
});
test('a SKU prefix on a priced row is not a counter heading',()=>{
  const r=parseText('#12345 冷泡茶 50\n總計 50');
  assert.equal(r.title,'冷泡茶');
  assert.equal(r.items[0].amount,5000);
});
test('if too many plausible items survive, ask rather than select the first N',()=>{
  const r=parseText('標示不明 80\n紅茶 80\n共1項\n總計 80');
  assert.deepEqual(r.items,[]);
  assert.equal(r.title,'');
  assert.match(r.itemIssue,/票面標示 1 項/);
  assert.equal(r.amount,8000);
});
test('missing products do not erase verified fields or force totals to equal item sums',()=>{
  const r=parseText('蛋糕 88\n共 3 項\n總計 188');
  assert.equal(r.items.length,1);
  assert.match(r.itemIssue,/可確認 1 項/);
  assert.equal(r.amount,18800);
});
test('discounts, cash and change do not become items or an inflated total',()=>{
  const r=parseText('豆漿 130\n小計 130\n折扣 10\n實付 120\n現金 200\n找零 80');
  assert.equal(r.items.length,1);
  assert.equal(r.amount,12000);
});
test('conflicting explicit totals or a corroborated payment conflict require review',()=>{
  for (const s of ['拿鐵 55\n總計 55\n發票金額 85','茶飲 65\n小計 65\n總計 85\nLINE PAY 65']) {
    const r=parseText(s);
    assert.equal(r.amount,0);
    assert.match(r.issues.join(' '),/矛盾/);
    assert.ok(r.retryRows.length);
  }
});
test('payment only, malformed amounts, and missing date produce empty fields',()=>{
  for (const tail of ['LINE PAY 250','積分 250','總計 2O5','合計 1,23','合計筆數 2']) {
    const r=parseText(tail);
    assert.equal(r.amount,0);
    assert.equal(r.date,'');
    assert.equal(r.items.length,0);
  }
});
test('replacement characters and low-confidence names or prices stay out of the draft',()=>{
  const rows=[
    {text:'紅� 50'},
    {text:'可能字串 60',words:[{text:'可能字串',confidence:31},{text:'60',confidence:95}]},
    {text:'咖啡 80',words:[{text:'咖啡',confidence:90},{text:'80',confidence:40}]},
    {text:'發票金額 200'},
  ];
  const r=parseReceiptRows(rows);
  assert.equal(r.title,'');
  assert.deepEqual(r.items,[]);
  assert.deepEqual(r.retryRows,[0,1,2]);
  assert.equal(r.amount,20000);
});
test('separate OCR blocks join by line position, not the nearest number on another row',()=>{
  const line=(text,x0,y0,x1)=>({text,bbox:{x0,y0,x1,y1:y0+20},words:[{text,confidence:90}]});
  const rows=receiptRows({blocks:[
    {paragraphs:[{lines:[line('奶茶',10,51,60),line('綠茶',10,80,60),line('合計',10,106,60)]}]},
    {paragraphs:[{lines:[line('80',215,50,250),line('45',215,81,250),line('125',210,105,250)]}]},
  ]});
  const r=parseReceiptRows(rows);
  assert.deepEqual(r.items,[{name:'奶茶',amount:8000},{name:'綠茶',amount:4500}]);
  assert.equal(r.amount,12500);
});
test('a weak counter name is reviewed separately from an independently verified promotion',()=>{
  const rows=receiptRows({text:'#123456 練習苗坊\n1300000000000\n買2送1$90 90\n共1項\n總計 90'});
  rows[0].words=[{text:'#123456',confidence:88},{text:'練習',confidence:85},{text:'苗坊',confidence:28}];
  const r=parseReceiptRows(rows);
  assert.equal(r.title,'買2送1');
  assert.equal(r.amount,9000);
  assert.deepEqual(r.retryRows,[0]);
  assert.deepEqual(r.reviewRows,[0]);
});
test('conflicting dated labels require input and a coupon expiry never overrides the sale date',()=>{
  assert.equal(parseText('日期 2025-08-19\n有效期限 2025-10-01').date,'2025-08-19');
  assert.equal(parseText('日期 2025-08-19\n日期 2025-08-10').date,'');
});
test('currency, English names and cents are preserved',()=>{
  const r=parseText('Green Tea NT$1,234.50\nTea x2 70\nGrand Total 1,304.50');
  assert.deepEqual(r.items,[{name:'Green Tea',amount:123450},{name:'Tea',amount:7000}]);
  assert.equal(r.amount,130450);
});

const encoder=new TextEncoder();
const head='AB123456781140819123400000000000000500000000012345678'+'a'.repeat(24);
function qr(suffix,right) {
  const codes=[typeof suffix==='string'?head+suffix:Buffer.concat([encoder.encode(head),suffix])];
  if(right) codes.push(right);
  return parseQR(codes);
}
test('joined QR codes decode UTF-8 including a multibyte character split at the boundary',()=>{
  const data=encoder.encode(':**********:2:2:1:牛奶:1:50:茶:1:30');
  const offset=data.indexOf(encoder.encode('茶')[0])+1;
  const r=qr(data.slice(0,offset),Buffer.concat([Buffer.from('**'),data.slice(offset)]));
  assert.equal(r.complete,true);
  assert.deepEqual(r.items,[{name:'牛奶',amount:5000},{name:'茶',amount:3000}]);
  assert.equal(r.amount,8000);
  assert.equal(r.invoice,'AB-12345678');
});
test('Base64 covers the entire list and cannot be treated as raw product names',()=>{
  const data=Buffer.from('早餐:2:25:紅茶:1:30').toString('base64');
  const r=qr(':**********:2:2:2:'+data.slice(0,11),'**'+data.slice(11));
  assert.equal(r.complete,true);
  assert.equal(r.items[0].name,'早餐');
  assert.equal(r.items[0].amount,5000);
});
test('Big5 QR and legacy per-name Base64 decode without replacement characters',()=>{
  const big5=qr(Buffer.concat([Buffer.from(':**********:1:1:0:'),Buffer.from([0xaf,0xf9]),Buffer.from(':1:80')]));
  assert.deepEqual(big5.items,[{name:'茶',amount:8000}]);
  const name=Buffer.from('茶').toString('base64');
  assert.equal(qr(':**********:1:1:2:'+name+':1:80').items[0].name,'茶');
});
test('unrelated QR, bad names and incomplete lists do not claim a complete receipt',()=>{
  assert.equal(parseQR(['https://shop.example/receipt']),null);
  const bad=qr(Buffer.concat([Buffer.from(':**********:1:1:1:'),Buffer.from([0xff]),Buffer.from(':1:80')]));
  assert.equal(bad.items.length,0);
  assert.equal(bad.complete,false);
  assert.equal(bad.amount,8000);
  const partial=qr(':**********:1:3:1:麵包:1:50:備註:1:30');
  assert.equal(partial.items.length,1);
  assert.equal(partial.expected,3);
  assert.equal(partial.complete,false);
});
test('partial QR and printed rows reconcile with multiplicity, without appending duplicates',()=>{
  const partial=qr(':**********:1:2:1:麵包:1:50');
  const ocr=parseReceiptRows(receiptRows({text:'麵包 50\n紅茶 30\n共2項'}),partial);
  const r=reconcileItems(ocr,partial);
  assert.deepEqual(r.items,[{name:'麵包',amount:5000},{name:'紅茶',amount:3000}]);
  assert.equal(r.date,'2025-08-19');
  assert.equal(r.amount,8000);
  const unconfirmed=reconcileItems({...ocr,items:[{name:'餅乾',amount:5000}]},partial);
  assert.deepEqual(unconfirmed.items,partial.items);
  assert.match(unconfirmed.itemIssue,/核對/);
});
