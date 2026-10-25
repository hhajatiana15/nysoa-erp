// NYSOA: network-first for application code to prevent stale GitHub Pages versions.
const CACHE_NAME = 'nysoa-erp-test-corrige-20261025-2';
const ASSETS = ['./index.html','./app.js','./style.css','./manifest.json','./assets/logo_nysoa_construct.svg'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('nysoa-erp-') && k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
 const request = event.request;
 if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
 event.respondWith(fetch(request).then(response => {
   if (response.ok) { const copy=response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request,copy)); }
   return response;
 }).catch(async () => {
   const cache=await caches.open(CACHE_NAME);
   return (await cache.match(request)) || (request.mode === 'navigate' ? await cache.match('./index.html') : Response.error());
 }));
});
