import {dateStr, validDate, isCash} from './model.js';

const traditional = {
 '两':'兩','块':'塊','钱':'錢','点':'點','万':'萬','亿':'億','号':'號','礼':'禮','个':'個','这':'這','买':'買','费':'費','车':'車','铁':'鐵','运':'運','计':'計','电':'電','购':'購','网':'網','资':'資','奖':'獎','额':'額','饮':'飲','类':'類','为':'為','账':'帳','记':'記','与':'與','门':'門','票':'票','机':'機','话':'話','间':'間','数':'數','乐':'樂','猫':'貓','币':'幣','台':'台','学':'學','医':'醫','险':'險','宠':'寵','虾':'蝦','周':'週','发':'發','麦':'麥','当':'當','进':'進','银':'銀','实':'實','兑':'兌','转':'轉','盐':'鹽','总':'總','给':'給','从':'從','双':'雙','补':'補'
};
function normalize(text){
 return text.normalize('NFKC').replace(/[^\x00-\x7f]/g,c=>traditional[c]||c)
  .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'')
  .replace(/(?<=[\u3400-\u9fff0-9])\s+(?=[\u3400-\u9fff0-9])/g,'').trim();
}
const smallUnits={十:10,百:100,千:1000},largeUnits={萬:10000,億:100000000};
const digits={零:'0',〇:'0',一:'1',二:'2',兩:'2',三:'3',四:'4',五:'5',六:'6',七:'7',八:'8',九:'9'};
const numChars='0-9零〇一二兩三四五六七八九十百千萬億';
const numberToken=`[${numChars}]+(?:[.點][0-9零〇一二兩三四五六七八九]+)?`;
function numberValue(raw){
 const n=raw.replace(/[零〇一二兩三四五六七八九]/g,c=>digits[c]).replace('點','.');
 if(/^\d+(?:\.\d+)?$/.test(n))return Number(n);
 const [integer,decimal]=n.split('.');
 if(decimal&&!/^\d+$/.test(decimal))return NaN;
 if(!/^(?:\d|[十百千萬億])+$/.test(integer))return NaN;
 let total=0, section=0,buffer='',last=0,lastSmall=Infinity,major=Infinity;
 for(const ch of integer){
  if(/\d/.test(ch)){buffer+=ch;continue}
  const small=smallUnits[ch];
  if(small){
   if(small>=lastSmall||(!buffer&&ch!=='十'))return NaN;
   section+=Number(buffer||1)*small;lastSmall=last=small;
  }else{
   const unit=largeUnits[ch];
   if(unit>=major||(!section&&!buffer))return NaN;
   total+=(section+Number(buffer))*unit;section=0;major=last=unit;lastSmall=Infinity;
  }
  buffer='';
 }
 // 「一百二／三千五」常省略末位的十或百，「一百零二」則為 102。
 let tail=Number(buffer||0);
 if(buffer.length===1&&last>=100&&tail)tail*=last/10;
 return total+section+tail+(decimal?Number('0.'+decimal):0);
}
function ymd(y,m,d){return [String(y).padStart(4,'0'),String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-')}
function parseDate(text,now){
 const ref=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12),year=ref.getFullYear(),month=ref.getMonth()+1;
 const dayAt=n=>{const t=new Date(ref);t.setDate(t.getDate()+n);return dateStr(t)};
 const matches=[];
 function take(re,decode){for(const m of text.matchAll(re))matches.push({value:decode(m),start:m.index,end:m.index+m[0].length})}
 take(/(?<!\d)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?!\d)/g,m=>ymd(+m[1],+m[2],+m[3]));
 take(new RegExp(`(?:(民國)?([${numChars}]+)年)?([${numChars}]+)月([${numChars}]+)(?:日|號)?`,'g'),m=>{
  let y=m[2]?numberValue(m[2]):year;if(m[1]||(y>=100&&y<=199))y+=1911;
  return ymd(y,numberValue(m[3]),numberValue(m[4]));
 });
 take(/(?<![\d/-])(\d{1,2})\/(\d{1,2})(?![\d/-])/g,m=>ymd(year,+m[1],+m[2]));
 take(new RegExp(`(上個月|上月|這個月|本月|下個月|下月)([${numChars}]+)(?:日|號)`,'g'),m=>{const t=new Date(year,month-1+(m[1][0]==='上'?-1:m[1][0]==='下'?1:0),1,12);return ymd(t.getFullYear(),t.getMonth()+1,numberValue(m[2]))});
 take(/大前天|大後天|前天|昨天|昨日|昨晚|今早|今晚|今天|今日|明天|後天/g,m=>dayAt(({大前天:-3,大後天:3,前天:-2,昨天:-1,昨日:-1,昨晚:-1,今早:0,今晚:0,今天:0,今日:0,明天:1,後天:2})[m[0]]));
 take(/(上上|上|本|這|下)?(?:個)?(?:週|星期|禮拜)([一二三四五六日天1-7])/g,m=>{
  const day=({'日':7,'天':7})[m[2]]||numberValue(m[2]),today=(ref.getDay()+6)%7+1;
  const shift=m[1]?({上上:-14,上:-7,本:0,這:0,下:7})[m[1]]:(day>today?-7:0);
  return dayAt(shift+day-today)
 });
 take(new RegExp(`(?<![${numChars}月])([${numChars}]+)(?:日|號)(?!碼)`,'g'),m=>ymd(year,month,numberValue(m[1])));
 const chosen=matches.sort((a,b)=>a.start-b.start||b.end-a.end).filter((x,i,a)=>!a.slice(0,i).some(y=>y.start<=x.start&&y.end>=x.end));
 let remainder=text;for(const x of chosen.slice().reverse())remainder=remainder.slice(0,x.start)+' '+remainder.slice(x.end);
 const unknown=/[0-9一二三四五六七八九十]月|上個?月|下個?月|上週|下週|去年|前年|上次|那天|前幾天|前幾日|月初|月底|週末/.test(remainder);
 const value=chosen[0]?.value;
 if((value&&!validDate(value))||new Set(chosen.map(x=>x.value)).size>1||unknown)return {date:'',remainder,issue:'請確認實際消費日期。'};
 return {date:value||dateStr(ref),remainder,defaulted:!value};
}
function parseMoney(text){
 // Currency units, payment verbs, and a single terminal number are separate evidence.
 const pattern=new RegExp(`(?:新台幣|新臺幣|台幣|臺幣|NT\\s*\\$|TWD|\\$)?\\s*(${numberToken})\\s*(?:元錢|塊錢|元|塊|圓)(?:\\s*([${numChars}]+)\\s*(?:角|毛)(?:\\s*([${numChars}]+)分)?|\\s*([${numChars}])(?=\\s*(?:[。,.，!?！]|$)))?`,'gi');
 let matches=[...text.matchAll(pattern)];
 const markers=new RegExp(`(?:花了?|付了?|支付|刷了?|總共|一共|合計|金額(?:是|為)?|新[台臺]幣|[台臺]幣|NT\\s*\\$|TWD|\\$)\\s*(${numberToken})(?![${numChars}元塊圓年月日號個件份杯張瓶人公里])`,'gi');
 for(const m of text.matchAll(markers))if(!matches.some(x=>x.index<m.index+m[0].length&&m.index<x.index+x[0].length))matches.push(m);
 if(!matches.length){const m=text.match(new RegExp(`(${numberToken})\\s*[。.!！,，]?\\s*$`));if(m)matches=[m]}
 const foreign=/(?:美元|美金|日圓|日元|日幣|歐元|人民幣|港幣|港元|USD|JPY|EUR|HKD|CNY|US\$|歐幣|英鎊|外幣)/i.test(text);
 const issue=foreign?'請換算並填寫新台幣金額。':matches.length>1?'聽到多個金額，請確認這筆交易的總額。':'';
 if(issue||!matches.length)return {amount:null,remainder:text,issue:issue||'請補上這筆交易的金額。'};
 const m=matches[0],start=m.index,end=start+m[0].length;
 const val=numberValue(m[1])+(m[2]?numberValue(m[2])*.1:0)+(m[3]?numberValue(m[3])*.01:0)+(m[4]?numberValue(m[4])*.1:0);
 const centsOnly=text.slice(end).match(new RegExp(`^\\s*([0-9零〇一二兩三四五六七八九])分`));
 const value=val+(centsOnly?numberValue(centsOnly[1])*.01:0);
 const amount=Math.round(value*100);
 const remainder=text.slice(0,start)+' '+text.slice(end+(centsOnly?.[0].length||0)).replace(/^整/,'');
 const strayAmount=new RegExp(`[${numChars}]+(?:[、，,。]|以及|還有|另外|再買|和|跟|又|再付|再加)`).test(remainder);
 const ambiguous=/[.點]$/.test(text.slice(0,start).trim())||strayAmount||new RegExp(`(?:[、，,。]|以及|還有|另外|再買|和|跟|又|再付)(?=.{0,14}[${numChars}])`).test(remainder)||/(?:負|minus|-)\s*$/i.test(text.slice(0,start));
 if(ambiguous||!isCash(amount)||Math.abs(value*100-amount)>.0001)return {amount:null,remainder,issue:'請確認這筆交易的金額。'};
 return {amount,remainder};
}
const keywords={
 food:'午餐|早餐|晚餐|宵夜|便當|餐費|餐廳|吃飯|火鍋|麵包|麵店|麵線|咖啡|拿鐵|奶茶|飲料|珍奶|豆漿|茶飲|雞排|漢堡|拉麵|飯糰|飯團|牛肉麵|甜點|冰淇淋|麥當勞|外送|披薩|三明治|壽司|牛奶|早午餐|餐盒|中餐|晚飯|餐點|餐飲|咖哩|飲食|ubereats|foodpanda',
 transport:'捷運|公車|客運|高鐵|台鐵|臺鐵|火車|車票|悠遊卡|停車|計程車|加油|油錢|交通|通勤|租車|計程|搭車|ubike|youbike|uber|機票',
 shop:'購物|買衣|衣服|衣褲|球鞋|鞋子|超商|超市|全聯|家樂福|便利商店|網購|蝦皮|百貨|日用品|雜貨|好市多|採買|書籍',
 fun:'電影|遊戲|電玩|娛樂|旅遊|演唱會|門票|健身|運動|展覽|串流|netflix|spotify|桌遊',
 home:'房租|租金|水費|電費|水電|瓦斯|網路費|電話費|管理費|家電|家具|寬頻|電信|房貸|網費',
 pay:'薪水|薪資|工資|月薪|薪酬|薪餉',
 bonus:'獎金|稿費|利息|股息|接案|紅包|收入|退款|退費|進帳|入帳'
};
function inferCategory(title,book,type){
 const cats=book.categories.filter(c=>c.type===type),t=normalize(title).toLowerCase().replace(/\s/g,'');
 if(!t)return '';
 const direct=cats.filter(c=>t.includes(normalize(c.name).toLowerCase()));
 if(direct.length)return direct.length===1?direct[0].id:'';
 const history=new Set(book.records.filter(r=>r.type===type&&normalize(r.title).toLowerCase().replace(/\s/g,'')===t).map(r=>r.cat));
 if(history.size===1&&cats.some(c=>history.has(c.id)))return [...history][0];
 if(history.size>1)return '';
 const scores=cats.map(c=>({id:c.id,score:(Object.hasOwn(keywords,c.id)?keywords[c.id]:'').split('|').filter(w=>w&&t.includes(w)).reduce((n,w)=>n+w.length,0)})).filter(s=>s.score).sort((a,b)=>b.score-a.score);
 return scores.length&&scores[0].score!==(scores[1]?.score||0)?scores[0].id:'';
}
function parseSpeech(input,book,now=new Date()){
 const text=normalize(input).replace(/[。！？!?]+$/,'');
 const issues=[];const dates=parseDate(text,now);if(dates.issue)issues.push(dates.issue);
 const type=/薪[水資酬]|工資|月薪|稿費|收入|賺了|進帳|入帳|收到獎金|領到獎金|股息|收款|收到.{0,6}退款/.test(text)&&!/支出|花了|消費|付了|購買/.test(text)?'income':'expense';
 const cash=parseMoney(dates.remainder);if(cash.issue)issues.push(cash.issue);
 let title=cash.remainder.trim().replace(/[,，。;；\s]+$/,'');
 const explicit=title.match(/(?:歸類(?:到|為)?|分類(?:為|是|放在)?|類別(?:為|是)?)\s*([^，,。！？!?]+)$/);
 if(explicit)title=title.slice(0,explicit.index);
 title=title.replace(/^[，,。；;：:\s]+|[，,。；;：:\s]+$/g,'')
  .replace(/^(?:請)?(?:幫我)?(?:記(?:下|一筆|一下)|記帳|記錄)(?:一筆)?/,'')
  .replace(/^[\s,，。；;：:]*(?:我(?:剛剛|剛才)?|剛剛|剛才)?(?:上午|下午|早上|晚上|中午)?(?:在)?(?:買了|購買了?|吃了|搭了|搭乘|喝了|點了|收到了|收到|領了)?/,'')
  .replace(/^(?:花了?|付了?|支付了?|刷了?)\s*(?:來)?(?:買了?|購買|吃了?|喝了?)\s*/, '')
  .replace(/(?:花費了?|花了?|總共|總計|一共|共計|共|合計|金額(?:是|為)?|支付了?|付款|付了?|刷卡|刷了?|新[臺台]幣|[臺台]幣|價格(?:是|為)?|收入是|是)\s*$/g,'')
  .replace(/^(?:消費|支出|收入)\s*[:：,，]?\s*/,'')
  .replace(/^[\s,，。；;：:]+|[\s,，。；;：:]+$/g,'').trim();
 if(!title||/^(?:花|消費|付款|買|付|支出|收入|花了)$/.test(title)||title.length>120){title='';issues.push('請補上項目名稱。')}
 let cat=explicit?book.categories.find(c=>c.type===type&&normalize(c.name)===explicit[1].trim())?.id:inferCategory(title,book,type);
 if(!cat)issues.push('請選擇適合的收支分類。');
 if(/(?:不是|更正|改成|取消|沒有[買付]|沒[買付]|別記|不要記|不必記|好像|大約|大概|差不多)/.test(text))issues.push('句子含修正或概估，請核對後入帳。');
 return {date:dates.date,title,amount:cash.amount,cat:cat||'',type,issues,defaulted:!!dates.defaulted};
}

export {parseSpeech};
