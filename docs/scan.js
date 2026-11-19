import {validDate} from './model.js';

function parseQR(codes){
 const chunks=codes.map(c=>c instanceof Uint8Array?c:new TextEncoder().encode(c));
 const dec=new TextDecoder('latin1'),str=a=>dec.decode(a),left=chunks.find(c=>/^[A-Z]{2}\d{19}[0-9a-fA-F]{16}/.test(str(c)));
 if(!left||left.length<77)return null;
 const right=chunks.find(c=>str(c).startsWith('**')),bytes=new Uint8Array(left.length+(right?right.length-2:0));bytes.set(left);if(right)bytes.set(right.subarray(2),left.length);
 const s=str(bytes),header=s.slice(77).split(':'),encoding=header[4];
 const parts=new TextDecoder(encoding==='0'?'big5':'utf-8').decode(bytes.subarray(77)).split(':');
 const yr=Number(s.slice(10,13))+1911,date=yr+'-'+s.slice(13,15)+'-'+s.slice(15,17);
 const items=[];
 for(let i=5;i+2<parts.length;i+=3){let name=parts[i].trim();if(encoding==='2'){try{name=new TextDecoder().decode(Uint8Array.from(atob(name),c=>c.charCodeAt(0)))}catch{continue}}const qty=Number(parts[i+1]),price=Number(parts[i+2]);if(name&&Number.isFinite(qty)&&Number.isFinite(price)&&qty>0&&price>=0)items.push({name:name.slice(0,120),amount:Math.round(qty*price*100)})}
 return {title:items[0]?.name||'',date:validDate(date)?date:'',amount:parseInt(s.slice(29,37),16)*100,invoice:s.slice(0,2)+'-'+s.slice(2,10),items};
}
function parseText(text){
 const t=text.normalize('NFKC').replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,m=>m.includes('\n')?m:''),lines=t.split(/\n/).map(s=>s.trim()).filter(Boolean);
 const inv=t.toUpperCase().match(/\b([A-Z]{2})\s*[-–]?\s*(\d(?:[ \t]?\d){7})(?!\d)/),d=t.match(/(?:^|\D)(20\d{2}|1\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})(?!\d)/);
 let date='';if(d){date=(+d[1]+(d[1].length===3?1911:0))+'-'+d[2].padStart(2,'0')+'-'+d[3].padStart(2,'0');if(!validDate(date))date=''}
 const end=/(-?\d[\d,]*(?:\.\d{1,2})?)\s*(?:元|TWD|TX|T)?\s*$/i,totalLabel=/(?:總[計額价價]|合[計计]|應付(?:金額)?|實付(?:金額)?|grand\s*total|amount\s*due|\btotal\b)/i;
 const toC=s=>Math.round(Number(s.replace(/,/g,''))*100);
 let amount=0;const items=[];
 for(const line of lines){const n=line.match(end);if(!n)continue;
 if(totalLabel.test(line)&&!/小計|subtotal|sub\s+total|未稅|稅額/i.test(line)){amount=toC(n[1]);continue}
 if(/發票|統編|統一編號|電話|找零|現金|應收|信用卡|稅|折扣|優惠|合計|總計|小計|收據|日期|時間|cash|change|tax|subtotal|tender|discount|invoice|receipt|payment|card|^tel/i.test(line))continue;
 let name=line.slice(0,n.index).replace(/[“”‘’\"'「」]+\s*$/g,'').replace(/[\s$＄¥：:]+$/,'').replace(/(?:\s+|[*x×])\d+(?:\.\d+)?\s*(?:[*x×]\s*\d+(?:\.\d+)?)?$/i,'').trim();
 if(!name||!/[A-Za-z\u3400-\u9fff]/.test(name)||/^(?:[A-Z]{2}[- ]?\d*|NT|TWD|USD)$/i.test(name)||line.includes(':')||line.match(/\d[-/.]\d/))continue;
 const a=toC(n[1]);if(a>=0&&a<99999999999)items.push({name:name.slice(0,120),amount:a})
 }
 return {title:items[0]?.name||'',date,amount:amount>0?amount:0,invoice:inv?inv[1]+'-'+inv[2].replace(/\s/g,''):'',items:items.slice(0,500)};
}
const scripts=new Map();
function script(url){if(!scripts.has(url))scripts.set(url,new Promise((yes,no)=>{const s=document.createElement('script');s.src=url;s.onload=yes;s.onerror=()=>{scripts.delete(url);no(Error('辨識元件載入失敗，請連線後再試。'))};document.head.append(s)}));return scripts.get(url)}
async function imageCanvas(blob){
 const url=URL.createObjectURL(blob),im=new Image();try{im.src=url;await im.decode();const scale=Math.min(1,2400/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);return c}finally{URL.revokeObjectURL(url)}
}
async function scanReceipt(blob,status,signal){
 const c=await imageCanvas(blob);signal.throwIfAborted();await script('./vendor/jsQR.js');status('正在讀取發票 QR Code…');
 const qc=document.createElement('canvas'),k=Math.min(1,1500/Math.max(c.width,c.height));qc.width=Math.round(c.width*k);qc.height=Math.round(c.height*k);
 const x=qc.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0,qc.width,qc.height);const codes=[];
 for(let i=0;i<2;i++){const p=x.getImageData(0,0,qc.width,qc.height),r=window.jsQR(p.data,p.width,p.height,{inversionAttempts:'dontInvert'});if(!r)break;codes.push(r.chunks?.every(ch=>ch.type==='byte')?Uint8Array.from(r.binaryData):(/[^\u0000-\u007f]/.test(r.data)?new TextEncoder().encode(r.data):Uint8Array.from(r.binaryData)));const loc=r.location;x.fillStyle='white';x.beginPath();['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'].forEach((key,j)=>{const q=loc[key];if(!j)x.moveTo(q.x,q.y);else x.lineTo(q.x,q.y)});x.fill()}
 const qr=parseQR(codes);if(qr?.items.length)return {...qr,source:'發票 QR Code'};
 signal.throwIfAborted();let worker;
 const stop=()=>{if(worker)worker.terminate()};
 signal.addEventListener('abort',stop,{once:true});
 try{status('正在載入本機文字辨識…');await script('./vendor/tesseract.min.js');signal.throwIfAborted();
 const path=p=>new URL('./vendor/'+p,location.href).href;
 worker=await window.Tesseract.createWorker('chi_tra+eng',1,{workerPath:path('worker.min.js'),corePath:path('tesseract-core-lstm.wasm.js'),langPath:path(''),workerBlobURL:false,logger:m=>{if(m.status==='recognizing text'&&!signal.aborted)status('正在辨識品項與金額 · '+Math.round(m.progress*100)+'%')}});
 signal.throwIfAborted();await worker.setParameters({tessedit_pageseg_mode:'6'});const r=await worker.recognize(c);signal.throwIfAborted();const o=parseText(r.data.text);
 return qr?{...o,invoice:qr.invoice,date:qr.date||o.date,amount:qr.amount||o.amount,source:'QR Code 與文字辨識'}:{...o,source:'文字辨識'};
 }catch(e){if(qr&&!signal.aborted)return {...qr,source:'發票 QR Code'};throw e}finally{signal.removeEventListener('abort',stop);if(worker&&!signal.aborted)await worker.terminate();else if(worker)await worker.terminate().catch(()=>{})}
}

export {parseQR,parseText,scanReceipt};
