const CACHE='pocketday-shell-multi-v1.2.0';
const ASSETS=['./','./index.html','./style.css','./app.js','./model.js','./ledger-store.js','./book-backup.js','./book-ui.js','./scan.js','./voice-parser.js','./voice-input.js','./voice-dialog.js','./icons.js','./travel.webp','./dm-sans.woff2','./icon-192.png','./icon-512.png','./manifest.webmanifest','./vendor/jsQR.js','./vendor/tesseract.min.js','./vendor/worker.min.js','./vendor/tesseract-core-lstm.wasm.js','./vendor/eng.traineddata.gz','./vendor/chi_tra.traineddata.gz'];
self.addEventListener('install',e=>e.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('pocketday-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(e.request.mode==='navigate'){e.respondWith((async()=>{try{return await fetch(e.request)}catch{return (await caches.open(CACHE)).match(new URL('./index.html',self.registration.scope))}})());return}
 if(!ASSETS.some(p=>new URL(p,self.registration.scope).pathname===url.pathname))return;
 e.respondWith((async()=>{const cached=await (await caches.open(CACHE)).match(url.origin+url.pathname);return cached||fetch(e.request)})())
});
