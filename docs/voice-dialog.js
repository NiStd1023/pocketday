import {icon} from './icons.js';
import {parseSpeech} from './voice-parser.js';
import {speechEngine,localSupport,installLanguage,listen} from './voice-input.js';

function mountVoice(dialog,{context,review,saveRecord}){
 const Engine=speechEngine();
 let mode=Engine?'loading':'unsupported',session=null,disposed=false,busy=false,sequence=0;
 let preferAuto=false;try{preferAuto=localStorage.getItem('pocketday-voice-auto')==='yes'}catch{}
 const wave='<span class="voice-wave" aria-hidden="true">'+[5,11,19,12,26,38,21,12,8].map((n,i)=>`<i style="--h:${n}px;--delay:${i*.08}s"></i>`).join('')+'</span>';
 const body=dialog.querySelector('.dialog-body');
 body.innerHTML=`<div class="voice-form"><div class="voice-destination">${icon('book',15)} 我的帳本</div>
 <section class="voice-capture"><button type="button" id="listenButton" class="voice-start"><span class="voice-art">${wave}<span class="voice-mic">${icon('mic',26)}</span>${wave}</span><span id="listenLabel" class="listen-label">檢查麥克風支援</span></button>
 <p id="modeNote"></p><button id="otherMode" class="voice-link" type="button" hidden>改用瀏覽器語音服務</button></section>
 <label class="field" for="voiceText">聽寫內容</label>
 <textarea id="voiceText" rows="2" maxlength="350" placeholder="例如：昨天午餐花了一百二十元"></textarea>
 <p class="helper" id="voiceStatus" role="status" aria-live="polite">一次說一筆，省略日期會記為今天。</p>
 <label class="voice-option"><input id="voiceAuto" type="checkbox" ${preferAuto?'checked':''}><span><b>說完直接入帳</b><small>日期、項目、金額與分類明確時，自動儲存這筆收支。</small></span></label>
 <div class="dialog-actions"><button class="btn secondary" type="button" data-act="close">取消</button><button class="btn primary" type="button" id="voiceReview" disabled>解析並核對</button></div></div>`;
 const text=body.querySelector('#voiceText'),auto=body.querySelector('#voiceAuto'),parse=body.querySelector('#voiceReview');
 const mic=body.querySelector('#listenButton'),label=body.querySelector('#listenLabel'),note=body.querySelector('#modeNote'),other=body.querySelector('#otherMode'),status=body.querySelector('#voiceStatus');
 const live=()=>!disposed&&dialog.open&&text.isConnected;
 function paint(){
  const active=!!session;
  const labels={loading:'正在檢查辨識支援…',unsupported:'使用鍵盤聽寫或輸入',local:'開始聽寫',browser:'開始瀏覽器聽寫',install:'下載本機中文語言包',installing:'正在下載語言包…'};
  const notes={loading:'',unsupported:'此瀏覽器未提供網頁麥克風辨識。請點下方文字框，使用鍵盤麥克風或直接輸入。',local:'中文語音會在此裝置上辨識。',browser:'啟用後，瀏覽器可能傳送音訊至其語音服務。小日帳不保存錄音。',install:'下載後可在裝置上辨識中文，不必傳送音訊。',installing:'下載完成後，再點一次開始聽寫。'};
  label.textContent=active?'正在聆聽 · 點一下結束':labels[mode];note.textContent=notes[mode];
  mic.setAttribute('aria-label',active?'結束聽寫':labels[mode]);mic.setAttribute('aria-pressed',String(active));
  mic.disabled=busy||mode==='loading'||mode==='installing';
  mic.querySelector('.voice-mic').innerHTML=icon(active?'stop':mode==='install'?'download':mode==='unsupported'?'edit':'mic',26);
  body.querySelector('.voice-capture').classList.toggle('listening',active);
  other.hidden=mode!=='install'||busy;
  text.readOnly=active||busy;auto.disabled=active||busy;
  parse.disabled=active||busy||!text.value.trim();
 }
 function cancelSession(){sequence++;const old=session;session=null;old?.abort()}
 function dispose(){disposed=true;cancelSession();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',suspend)}
 function suspend(){if(!session)return;cancelSession();if(live()){status.textContent='已停止麥克風，文字已保留。';paint()}}
 function visibility(){if(document.hidden)suspend()}
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',suspend);
 async function finish(spoken,uncertain=false){
  if(!live()||busy||!text.value.trim())return;busy=true;paint();
  const draft={...parseSpeech(text.value,context.data),origin:'voice',transcript:text.value.trim()};
  if(uncertain)draft.issues.push('部分語音辨識信心較低，請確認內容。');
  if(context.data.records.some(r=>r.date===draft.date&&r.type===draft.type&&r.title===draft.title&&r.amount===draft.amount))draft.issues.push('當天已有相同項目與金額，請確認是否為另一筆。');
  try{
   if(spoken&&auto.checked&&!draft.issues.length)await saveRecord(draft,context);
   else await review(draft,context);
  }catch(error){
   if(live()){busy=false;status.textContent=error.message||'無法儲存，請核對後再試。';paint()}
  }
 }
 async function handleMic(){
  if(!live()||busy)return;
  if(session){status.textContent='正在完成辨識…';session.stop();return}
  if(mode==='unsupported'){text.focus();return}
  if(mode==='install'){
   mode='installing';paint();
   try{const ok=await installLanguage(Engine);if(!live())return;mode=ok?'local':'install';status.textContent=ok?'語言包已就緒。':'下載未完成，可重試或改用瀏覽器語音服務。'}
   catch{if(live()){mode='install';status.textContent='無法安裝語言包，可改用瀏覽器語音服務。'}}
   if(live())paint();return;
  }
  if(!['local','browser'].includes(mode))return;
  const take=++sequence,previous=text.value;
  const current=()=>live()&&take===sequence;
  status.textContent='請說出一筆收支，例如「昨天午餐一百二十元」。';
  let received=false;
  try{
   session=listen(Engine,{local:mode==='local',
    onText:value=>{if(current()){received=true;text.value=value.slice(0,350)}},
    onError:message=>{if(!current())return;sequence++;session=null;if(!received)text.value=previous;status.textContent=message;paint()},
    onFinish:(value,uncertain)=>{if(!current())return;sequence++;session=null;text.value=value.slice(0,350);paint();void finish(true,uncertain||value.length>350)}
   });paint();
  }catch{session=null;status.textContent='無法啟動聽寫。可允許麥克風權限後重試，或使用鍵盤聽寫。';paint()}
 }
 mic.onclick=handleMic;
 other.onclick=()=>{mode='browser';status.textContent='點「開始瀏覽器聽寫」即可啟用。';paint()};
 text.oninput=()=>{parse.disabled=busy||!text.value.trim()};
 auto.onchange=()=>{try{localStorage.setItem('pocketday-voice-auto',auto.checked?'yes':'no')}catch{}};
 parse.onclick=()=>finish(false);
 paint();
 if(Engine)localSupport(Engine).then(result=>{if(live()&&mode==='loading'){mode=result;paint()}});
 return dispose;
}

export {mountVoice};
