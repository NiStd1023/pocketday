import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSpeech} from '../docs/voice-parser.js';
import {localSupport,listen} from '../docs/voice-input.js';
import {emptyBook} from '../docs/model.js';

const ref=new Date(2026,10,19,12);
const parse=(line,book=emptyBook(),day=ref)=>parseSpeech(line,book,day);
for(const [line,date,amount,cat] of [
 ['昨天午餐花了一百二十元','2026-11-18',12000,'food'],
 ['前天晚餐一百二','2026-11-17',12000,'food'],
 ['上週五高鐵一千四百九十元','2026-11-13',149000,'transport'],
 ['上個月2號電費2,400元','2026-10-02',240000,'home'],
 ['民國115年11月18日拿鐵六十五塊五','2026-11-18',6550,'food'],
 ['2024/2/29電影票三百元整','2024-02-29',30000,'fun'],
 ['十一月十八日公車十五元','2026-11-18',1500,'transport'],
 ['昨天午餐 NT$1,080.50','2026-11-18',108050,'food'],
 ['7-11咖啡五十元','2026-11-19',5000,'food'],
 ['房租一萬二','2026-11-19',1200000,'home'],
 ['今天薪資四萬八千元','2026-11-19',4800000,'pay'],
 ['咖啡四十五元三角五分','2026-11-19',4535,'food'],
 ['咖啡四十五元五分','2026-11-19',4505,'food'],
 ['今天坐地铁车票四十五块钱','2026-11-19',4500,'transport']
])test(line,()=>{const p=parse(line);assert.equal(p.date,date);assert.equal(p.amount,amount);assert.equal(p.cat,cat);assert.deepEqual(p.issues,[])});
test('date rollover and fallback',()=>{assert.equal(parse('昨天午餐50元',emptyBook(),new Date(2026,0,1,12)).date,'2025-12-31');assert.equal(parse('早餐55元').defaulted,true);assert.equal(parse('2月30日午餐120元').date,'')});
test('category history follows edits and custom names',()=>{const b=emptyBook();b.categories.push({id:'pet',name:'寵物用品',type:'expense'});b.records.push({type:'expense',title:'貓砂',cat:'pet'});assert.equal(parse('昨天貓砂三百元',b).cat,'pet');assert.equal(parse('昨天罐頭200元，分類是寵物用品',b).cat,'pet');b.categories=b.categories.filter(c=>c.id!=='pet');assert.equal(parse('昨天貓砂三百元',b).cat,'')});
for(const line of ['昨天午餐','咖啡100元便當80元','兩杯咖啡六十和午餐100元','今天五十元','電費負五十元','昨天午餐100美元','大概午餐100元','今天和昨天咖啡100元','去年咖啡50元','未知品項三百元','2月30日咖啡50元','午餐0元','午餐十億元'])
 test('review required '+line,()=>assert.ok(parse(line).issues.length));
class Engine{
 constructor(){this.processLocally=false;Engine.last=this}
 static async available(){return 'available'}
 start(){} stop(){} abort(){this.aborted=true}
}
function harness(){
 const events=[];
 const api=listen(Engine,{local:true,onText:t=>events.push(['text',t]),onFinish:(s,low)=>events.push(['done',s,low]),onError:e=>events.push(['error',e])});
 const rec=Engine.last;const give=(t,final,confidence=1)=>{const seg=[{transcript:t,confidence}];seg.isFinal=final;rec.onresult?.({results:[seg]})};
 return {rec,api,give,events}
}
test('local availability and unsupported browser',async()=>{assert.equal(await localSupport(null),'unsupported');assert.equal(await localSupport(Engine),'local');assert.equal(await localSupport(class {}),'browser')});
test('only one completed utterance, even with repeated results',()=>{const {give,rec,events}=harness();assert.equal(rec.processLocally,true);assert.equal(rec.lang,'zh-TW');give('午',false);give('午餐一百元',true);give('午餐一百元',true);rec.onend();rec.onend?.();assert.deepEqual(events.filter(x=>x[0]==='done'),[['done','午餐一百元',false]])});
test('uncertain output is marked for review',()=>{const {give,rec,events}=harness();give('午餐十元',true,.35);rec.onend();assert.equal(events.at(-1)[2],true)});
test('cancel, interim-only and permission errors never finalize a record',()=>{for(const action of ['abort','interim','error']){const {api,rec,give,events}=harness();give('午餐',false);if(action==='abort')api.abort();if(action==='error')rec.onerror({error:'not-allowed'});rec.onend?.();assert.equal(events.filter(e=>e[0]==='done').length,0)}});

