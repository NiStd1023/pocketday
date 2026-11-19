
const localOptions={langs:['zh-TW'],processLocally:true};
function speechEngine(host=window){return host.SpeechRecognition||host.webkitSpeechRecognition||null}
async function localSupport(Engine){
 if(!Engine)return 'unsupported';
 try{
  if(typeof Engine.available!=='function'||!('processLocally' in new Engine()))return 'browser';
  const a=await Engine.available(localOptions);
  if(a==='available')return 'local';
  if((a==='downloadable'||a==='downloading')&&typeof Engine.install==='function')return 'install';
 }catch{/* A browser policy can disable on-device language packs. */}
 return 'browser';
}
async function installLanguage(Engine){return await Engine.install(localOptions)}
const errors={'not-allowed':'未取得麥克風權限。可在瀏覽器的網站設定中允許麥克風，或直接輸入一句話。',
 'service-not-allowed':'此瀏覽器目前無法使用這項辨識服務，可改用鍵盤聽寫。',
 'audio-capture':'找不到可用的麥克風，請檢查裝置或使用鍵盤聽寫。',
 'no-speech':'沒有聽到語音，請靠近麥克風再試一次。',
 'network':'語音服務無法連線。可以重試，或用鍵盤聽寫後解析。',
 'language-not-supported':'瀏覽器未提供此模式的繁體中文語音辨識，可改用鍵盤聽寫。',
 aborted:'聽寫已中止。'};
function listen(Engine,{local,onText,onFinish,onError}){
 const rec=new Engine();
 rec.lang='zh-TW';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
 if(local){if(!('processLocally' in rec))throw Error('裝置內語音辨識無法使用。');rec.processLocally=true}
 let closed=false,finalText='',interim='',uncertain=false,finishTimer,listenTimer;
 function detach(){closed=true;clearTimeout(finishTimer);clearTimeout(listenTimer);rec.onresult=rec.onerror=rec.onend=null}
 function abort(){if(closed)return;detach();try{rec.abort()}catch{/* already stopped */}}
 function stop(){if(closed||finishTimer)return;try{rec.stop()}catch{abort();onError('麥克風已停止。');return}
  finishTimer=setTimeout(()=>{if(closed)return;abort();onError('辨識未完成，請核對聽寫文字或再試一次。')},6000)}
 rec.onresult=event=>{
  if(closed)return;const finals=[],partials=[];uncertain=false;
  for(const result of Array.from(event.results)){
   const alt=result[0];if(!alt?.transcript)continue;
   (result.isFinal?finals:partials).push(alt.transcript);
   if(result.isFinal&&alt.confidence>0&&alt.confidence<.65)uncertain=true;
  }
  finalText=finals.join('');interim=partials.join('');onText((finalText+interim).trim());
 };
 rec.onerror=e=>{if(closed)return;abort();onError(errors[e.error]||'語音辨識未完成，請再試一次或輸入文字。')};
 rec.onend=()=>{if(closed)return;detach();if(finalText.trim()&&!interim.trim())onFinish(finalText.trim(),uncertain);
  else onError(interim?'只收到部分語句，請核對文字後按「解析並核對」。':'沒有收到完整語句，請再說一次。')};
 rec.start();
 listenTimer=setTimeout(stop,45000);
 return {abort,stop};
}

export {speechEngine,localSupport,installLanguage,listen};
