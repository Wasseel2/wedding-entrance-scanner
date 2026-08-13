/*
 * Service worker for the entrance scanner.
 *
 * Its only job is to make the app open with no network at all. Everything the
 * scanner needs is copied into the browser's cache when the app is installed,
 * so on the wedding day the phone can be in aeroplane mode and the app still
 * starts instantly.
 *
 * Bump CACHE when any of the files below change, otherwise phones that already
 * installed the app keep serving the old copy.
 */
"use strict";

const CACHE = "wedding-scanner-3b68b688";

const ASSETS = [
  "./",
  "index.html",
  "lib/jsQR.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable.png",
  "apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails the whole install if a single file is missing, which would
    // leave the app half-cached; fetch them individually and tolerate gaps.
    await Promise.all(ASSETS.map(async url => {
      try{ await cache.add(new Request(url, { cache:"reload" })); }
      catch(e){ console.warn("[sw] could not cache", url, e); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The shared-server endpoints must always hit the network: a cached check-in
  // response would admit a guest twice.
  if (url.pathname.includes("/api/")) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch:true });
    if (cached) return cached;
    try{
      const fresh = await fetch(req);
      if (fresh.ok && fresh.type === "basic"){
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    }catch(err){
      // Offline and not in the cache: for a page request, fall back to the app
      // itself so the scanner opens instead of the browser's error page.
      if (req.mode === "navigate"){
        const shell = await caches.match("index.html") || await caches.match("./");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
