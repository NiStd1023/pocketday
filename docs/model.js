export const palette=['#ed8a63','#76b3a6','#809ac8','#b29dce','#e7b863','#83939e','#ca86a0','#68a9c0'];
const defs=[['food','餐飲美食','food',0],['shop','日常購物','bag',1],['transport','交通通勤','train',2],['fun','休閒娛樂','fun',3],['home','居家生活','home',4],['pay','薪資收入','work',1],['bonus','其他收入','gift',4]];
export const uid=()=>crypto.randomUUID();
export const money=c=>(c/100).toLocaleString('en-US',{maximumFractionDigits:2});
export const cents=x=>Math.round(Number(x)*100);
export const dateStr=(d=new Date())=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
export const monthNow=()=>dateStr().slice(0,7);
export const labelMonth=m=>Number(m.slice(0,4))+' 年 '+Number(m.slice(5))+' 月';
export const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function emptyBook(){return {categories:defs.map(([id,name,icon,p],i)=>({id,name,icon,color:palette[p],type:i<5?'expense':'income'})),records:[],goals:[]}}
export function demoBook(now=new Date()){
 const b=emptyBook(),m=dateStr(now).slice(0,7),day=n=>m+'-'+String(Math.max(1,Math.round(n*now.getDate()/19))).padStart(2,'0');
 const items=[[19,'日常咖啡・拿鐵','food',120],[18,'全聯福利中心','shop',680],[17,'悠遊卡加值','transport',500],[16,'週末電影票','fun',340],[15,'專案設計收入','bonus',6000],[14,'超市家庭採買','shop',2220],[13,'台鐵車票','transport',1500],[12,'朋友聚餐','food',1680],[11,'本月水電費','home',1200],[10,'日常用品','shop',700],[9,'運動月票','fun',1260],[8,'午餐餐費','food',2100],[7,'通勤月票','transport',800],[6,'餐廳聚會','food',1500],[5,'薪資入帳','pay',48000],[4,'家用網路費','home',600],[3,'早餐與咖啡','food',600]];
 b.records=items.map(([d,title,cat,amount],i)=>({id:'r'+i,date:day(d),title,cat,amount:cents(amount),type:b.categories.find(c=>c.id===cat).type,invoice:'',items:[],created:100-i}));
 b.goals=[{id:'travel',name:'日本旅行基金',target:5000000,saved:3200000,theme:'travel'}];return b;
}
export function total(rs){return rs.reduce((a,r)=>a+r.amount,0)}
export function monthly(b,m){return b.records.filter(r=>r.date.startsWith(m)).sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created)}
export function breakdown(book,rows,type){return book.categories.filter(c=>c.type===type).map(c=>({...c,sum:total(rows.filter(r=>r.cat===c.id))})).filter(c=>c.sum>0).sort((a,b)=>b.sum-a.sum)}
export function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s}
export const isCash=(v,zero=false)=>Number.isSafeInteger(v)&&v>=(zero?0:1)&&v<=99999999999;
const textOk=(s,n)=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
export function validate(b){
 const fail=()=>{throw Error('備份資料的格式或欄位有誤。請使用小日帳匯出的 JSON 檔。')};
 if(!b||!Array.isArray(b.categories)||!Array.isArray(b.records)||!Array.isArray(b.goals)||b.records.length>100000||b.goals.length>500||b.categories.length>500)fail();
 const types=['income','expense'];
 for(const a of [b.categories,b.records,b.goals])if(a.some(x=>!x||!textOk(x.id,80)||!/^[a-zA-Z0-9_-]+$/.test(x.id))||new Set(a.map(x=>x.id)).size!==a.length)fail();
 for(const c of b.categories)if(!types.includes(c.type)||!textOk(c.name,40)||!/^#[a-f0-9]{6}$/i.test(c.color)||!['food','bag','train','home','fun','work','gift','dot','categories','coin','leaf','plane'].includes(c.icon))fail();
 if(!types.every(t=>b.categories.some(c=>c.type===t)))fail();
 const cats=new Map(b.categories.map(c=>[c.id,c]));
 for(const r of b.records)if(!validDate(r.date)||!textOk(r.title,120)||!isCash(r.amount)||cats.get(r.cat)?.type!==r.type||!types.includes(r.type)||!Number.isFinite(r.created)||typeof r.invoice!=='string'||r.invoice.length>50||!Array.isArray(r.items)||r.items.length>500||r.items.some(i=>!i||!textOk(i.name,120)||!isCash(i.amount,true)))fail();
 for(const g of b.goals)if(!textOk(g.name,60)||!isCash(g.target)||!isCash(g.saved,true)||!['travel','plant','savings'].includes(g.theme))fail();
 return b
}
let dbPromise;
function db(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open('pocketday-local-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('books');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});return dbPromise}
export async function readBook(key){const conn=await db();return new Promise((resolve,reject)=>{const t=conn.transaction('books','readwrite'),s=t.objectStore('books'),r=s.get(key);let val;r.onsuccess=()=>{val=r.result;if(!val){val={rev:0,data:key==='demo'?demoBook():emptyBook()};s.put(val,key)}};t.oncomplete=()=>resolve(val);t.onabort=()=>reject(t.error)})}
export async function commit(key,rev,change){const conn=await db();return new Promise((resolve,reject)=>{const t=conn.transaction('books','readwrite'),s=t.objectStore('books'),r=s.get(key);let val,err;r.onsuccess=()=>{try{val=r.result;if(!val||val.rev!==rev)throw Error('帳本已在另一個視窗更新，請重新開啟並確認。');const b=change(val.data)||val.data;val={rev:rev+1,data:validate(b)};s.put(val,key)}catch(e){err=e;t.abort()}};t.oncomplete=()=>resolve(val);t.onabort=()=>reject(err||t.error||Error('裝置無法儲存，請檢查可用空間。'))})}
