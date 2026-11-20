import {isCash, validDate} from './model.js';
import {parseText, parseReceiptRows, readableName, receiptRows, receiptTitle} from './receipt-parser.js';

const ascii = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8', {fatal:true});
const encodedBytes = text => Uint8Array.from(atob(text), ch=>ch.charCodeAt(0));

function qrDetails(bytes) {
  const header = /^:[^:]*:(\d+):(\d+):([012]):/.exec(ascii.decode(bytes));
  if (!header) return {expected:null,items:[],complete:false};
  const reported = Number(header[1]);
  const expected = Number(header[2]) || null;
  let data = bytes.subarray(header[0].length);
  let encodedNames = false;
  const decoder = header[3]==='0' ? new TextDecoder('big5',{fatal:true}) : utf8;
  if (header[3]==='2') {
    // The standard encodes the entire detail section. Also accept legacy per-name Base64.
    const encoded = ascii.decode(data);
    if (encoded.includes(':')) encodedNames=true;
    else {
      try { data=encodedBytes(encoded); }
      catch { return {expected,items:[],complete:false}; }
    }
  }
  const fields=[];
  let start=0;
  for (let i=0;i<=data.length;i++) {
    if (i===data.length || data[i]===58) {
      fields.push(data.subarray(start,i));
      start=i+1;
    }
  }
  const items=[];
  for (let i=0; i<Math.min(reported,500)*3 && i+2<fields.length; i+=3) {
    const quantity=ascii.decode(fields[i+1]).trim(), price=ascii.decode(fields[i+2]).trim();
    if (!/^\d+(?:\.\d+)?$/.test(quantity) || !/^\d+(?:\.\d+)?$/.test(price) || Number(quantity)<=0) continue;
    const amount=Math.round(Number(quantity)*Number(price)*100);
    let name;
    try { name=decoder.decode(encodedNames?encodedBytes(ascii.decode(fields[i])):fields[i]).trim(); }
    catch { continue; }
    if (readableName(name) && isCash(amount,true)) items.push({name,amount});
  }
  return {expected,items,complete:expected!==null && expected===reported && expected===items.length};
}

function parseQR(codes) {
  const chunks=codes.map(code=>typeof code==='string'?new TextEncoder().encode(code):code);
  const left=chunks.find(c=>c.length>=77 && /^[A-Z]{2}\d{15}(?:\d{4}| {4})[0-9a-fA-F]{16}/.test(ascii.decode(c.subarray(0,37))));
  if (!left) return null;
  const right=chunks.find(c=>c[0]===42 && c[1]===42);
  const body=new Uint8Array(left.length-77+(right?right.length-2:0));
  body.set(left.subarray(77));
  if (right) body.set(right.subarray(2),left.length-77);
  const header=ascii.decode(left.subarray(0,77));
  const date=(Number(header.slice(10,13))+1911)+'-'+header.slice(13,15)+'-'+header.slice(15,17);
  const amount=parseInt(header.slice(29,37),16)*100;
  const details=qrDetails(body);
  return {...details,title:receiptTitle(details.items,'',details.expected).slice(0,120),
    date:validDate(date)?date:'',amount:isCash(amount)?amount:0,invoice:header.slice(0,2)+'-'+header.slice(2,10)};
}

const scripts=new Map();
function script(url) {
  if (!scripts.has(url)) scripts.set(url,new Promise((resolve,reject)=>{
    const element=document.createElement('script');
    element.src=url;
    element.onload=resolve;
    element.onerror=()=>{scripts.delete(url);reject(Error('無法載入辨識元件'));};
    document.head.append(element);
  }));
  return scripts.get(url);
}

function canvas(width,height) {
  const el=document.createElement('canvas');
  el.width=Math.max(1,Math.round(width));
  el.height=Math.max(1,Math.round(height));
  return el;
}

async function imageCanvas(blob) {
  const url=URL.createObjectURL(blob);
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    const scale=Math.min(1,2400/Math.max(image.width,image.height));
    const out=canvas(image.width*scale,image.height*scale);
    const ctx=out.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';
    ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(image,0,0,out.width,out.height);
    return out;
  } finally { URL.revokeObjectURL(url); }
}

function readCodes(image) {
  const scale=Math.min(1,1500/Math.max(image.width,image.height));
  const small=canvas(image.width*scale,image.height*scale);
  const ctx=small.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,small.width,small.height);
  const codes=[];
  function scanWindow(x,width) {
    const p=ctx.getImageData(x,0,width,small.height);
    const result=window.jsQR(p.data,p.width,p.height,{inversionAttempts:'dontInvert'});
    if (!result) return false;
    codes.push(Uint8Array.from(result.binaryData));
    // Mask only the QR search copy. Changing the OCR input can shift its text segmentation.
    ctx.fillStyle='white';
    ctx.beginPath();
    const loc=result.location;
    [loc.topLeftCorner,loc.topRightCorner,loc.bottomRightCorner,loc.bottomLeftCorner].forEach((pt,n)=>{
      if (n===0) ctx.moveTo(x+pt.x,pt.y); else ctx.lineTo(x+pt.x,pt.y);
    });
    ctx.closePath();
    ctx.fill();
    return true;
  }
  const width=small.width;
  if (scanWindow(0,width)) {
    scanWindow(0,width);
    const qr=parseQR(codes);
    if (qr?.complete) return qr;
  }
  // Adjacent QR codes can be mistaken for a single QR finder pattern in a full-page search.
  const span=Math.ceil(width*.6);
  scanWindow(0,span);
  scanWindow(width-span,span);
  return parseQR(codes);
}

function rowImage(image,box,enhance=false) {
  const pad=Math.max(3,Math.round((box.y1-box.y0)*.15));
  const x=Math.max(0,box.x0-pad), y=Math.max(0,box.y0-pad);
  const w=Math.max(1,Math.min(image.width,box.x1+pad)-x);
  const h=Math.max(1,Math.min(image.height,box.y1+pad)-y);
  const scale=enhance ? Math.min(2,Math.max(1,56/h),1800/w) : Math.min(1,850/w);
  const out=canvas(w*scale,h*scale);
  const ctx=out.getContext('2d');
  if (enhance) ctx.filter='grayscale(1) contrast(1.25)';
  ctx.drawImage(image,x,y,w,h,0,0,out.width,out.height);
  return out;
}

function qrReview(qr) {
  const missingAmount=!qr.amount;
  return {...qr,source:'發票 QR Code',issues:[
    ...(!qr.complete?['QR Code 的商品明細不完整，請依票面核對。']:[]),
    ...(missingAmount?['總金額待確認。']:[]),
    ...(!qr.date?['日期待確認。']:[])
  ]};
}

// Never concatenate both sets. The same item and price may occur more than once.
function reconcileItems(ocr,qr) {
  if (!qr?.items.length) return ocr;
  const key=item=>JSON.stringify([item.name.normalize('NFKC').replace(/\s/g,''),item.amount]);
  const available=ocr.items.map(key);
  const includesQr=qr.items.every(item=>{
    const index=available.indexOf(key(item));
    if (index<0) return false;
    available.splice(index,1);
    return true;
  });
  if (includesQr && ocr.items.length>=qr.items.length) return ocr;
  return {...ocr,items:qr.items,title:qr.title,itemIssue:qr.complete?'':'已保留 QR Code 可確認的 '+qr.items.length+' 項，請核對其餘明細。'};
}

async function scanReceipt(blob,status,signal) {
  const image=await imageCanvas(blob);
  signal.throwIfAborted();
  await script('./vendor/jsQR.js');
  status('正在讀取發票 QR Code…');
  const qr=readCodes(image);
  if (qr?.complete && qr.amount && qr.date) return qrReview(qr);
  signal.throwIfAborted();
  let worker;
  let aborted;
  const stop=()=>{
    if (worker) { worker.terminate().catch(()=>{}); worker=null; }
    aborted?.();
  };
  signal.addEventListener('abort',stop,{once:true});
  try {
    status('正在載入本機文字辨識…');
    await script('./vendor/tesseract.min.js');
    signal.throwIfAborted();
    const path=p=>new URL('./vendor/'+p,location.href).href;
    worker=await window.Tesseract.createWorker('chi_tra+eng',1,{
      workerPath:path('worker.min.js'),corePath:path('tesseract-core-lstm.wasm.js'),langPath:path(''),workerBlobURL:false,
      logger:m=>{if(m.status==='recognizing text'&&!signal.aborted)status('正在辨識收據 · '+Math.round(m.progress*100)+'%');}
    });
    signal.throwIfAborted();
    const cancelled=new Promise((_,reject)=>{aborted=()=>reject(signal.reason);});
    async function recognize(input,mode) {
      signal.throwIfAborted();
      await Promise.race([worker.setParameters({tessedit_pageseg_mode:mode}),cancelled]);
      const result=await Promise.race([worker.recognize(input,{}, {text:true,blocks:true}),cancelled]);
      signal.throwIfAborted();
      return receiptRows(result.data);
    }
    const rows=await recognize(image,'6');
    const fixed=qr || {};
    let parsed=parseReceiptRows(rows,fixed);
    for (const index of parsed.retryRows.slice(0,2)) {
      const box=rows[index].bbox;
      if (!box) continue;
      status('正在重讀待確認的欄位…');
      try {
        const retry=await recognize(rowImage(image,box,true),'7');
        if (retry.length===1 && (index!==parsed.counterReview || /^[*#]\s*\d/.test(retry[0].text))) {
          rows[index]={...retry[0],bbox:box};
        }
      } catch {
        signal.throwIfAborted();
        break; // Keep the first pass when a cropped retry is unavailable.
      }
    }
    if (parsed.retryRows.length) parsed=parseReceiptRows(rows,fixed);
    const result=reconcileItems(parsed,qr);
    const issues=[result.itemIssue,...result.issues].filter(Boolean);
    const previews=[];
    if (issues.length) {
      const boxes=result.reviewRows.slice(0,2).map(i=>rows[i]?.bbox).filter(Boolean);
      if (!boxes.length) boxes.push({x0:0,y0:0,x1:image.width,y1:image.height});
      for (const box of boxes) previews.push(rowImage(image,box).toDataURL('image/jpeg',.82));
    }
    return {title:result.title,date:result.date,amount:result.amount,invoice:result.invoice,items:result.items,
      issues,previews,source:qr?'QR Code 與文字辨識':'文字辨識'};
  } catch (error) {
    if (qr && !signal.aborted) return qrReview(qr);
    throw error;
  } finally {
    signal.removeEventListener('abort',stop);
    if (worker) await worker.terminate();
  }
}

export {parseQR,parseText,scanReceipt,reconcileItems};
