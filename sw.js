// Bump the version whenever a precached file changes.
const cachePrefix = new URL('./', self.location.href).href + 'nwc-offline-'
const cacheName = cachePrefix + '1'
const assets = [
  "./index.html",
  "./converter/index.html",
  "./manifest.webmanifest",
  "./pwa.js",
  "./icons/apple-touch-icon.png",
  "./icons/nwc-192.png",
  "./icons/nwc-512.png",
  "./icons/nwc-maskable-512.png",
  "./viewer/index.html",
  "./viewer/lib/nwc-parser.js",
  "./viewer/lib/nwc2xml/constants.js",
  "./viewer/lib/nwc2xml/cp949.js",
  "./viewer/lib/nwc2xml/index.js",
  "./viewer/lib/nwc2xml/nwctxt-parser.js",
  "./viewer/lib/nwc2xml/objects.js",
  "./viewer/lib/nwc2xml/parser.js",
  "./viewer/lib/nwc2xml/reader.js",
  "./viewer/lib/nwc2xml/text-properties.js",
  "./viewer/lib/nwc2xml/writer.js",
  "./viewer/samples/One Call Away - Dad's Harmony.nwc",
  "./viewer/samples/the blenders-you.nwc",
  "./viewer/src/audio.js",
  "./viewer/src/constants.js",
  "./viewer/src/context.js",
  "./viewer/src/drawing.js",
  "./viewer/src/editing.js",
  "./viewer/src/engraving-rules.js",
  "./viewer/src/exporter.js",
  "./viewer/src/fraction.js",
  "./viewer/src/interpreter.js",
  "./viewer/src/layout/beams.js",
  "./viewer/src/layout/tick-tracker.js",
  "./viewer/src/layout/ties.js",
  "./viewer/src/layout/typeset.js",
  "./viewer/src/loaders.js",
  "./viewer/src/lyric-follow.js",
  "./viewer/src/lyrics.js",
  "./viewer/src/main.js",
  "./viewer/src/midi-import.js",
  "./viewer/src/music-import-utils.js",
  "./viewer/src/musicxml-import.js",
  "./viewer/src/nwc.js",
  "./viewer/src/nwc_constants.js",
  "./viewer/src/nwc_parser.js",
  "./viewer/src/piano-keyboard.js",
  "./viewer/src/playback-highlight.js",
  "./viewer/src/playback-order.js",
  "./viewer/src/practice.js",
  "./viewer/src/sample-scores.js",
  "./viewer/src/viewer-settings.js",
  "./viewer/src/zip.js",
  "./viewer/vendor/bravura-1.211/otf/Bravura.otf",
  "./viewer/vendor/bravura-1.211/otf/BravuraText.otf",
  "./viewer/vendor/inflate.min.js",
  "./viewer/vendor/jspdf.umd.min.js",
  "./viewer/vendor/opentype.min.js",
  "./viewer/vendor/soundfont-engine/src/backends/base.js",
  "./viewer/vendor/soundfont-engine/src/backends/index.js",
  "./viewer/vendor/soundfont-engine/src/backends/oxisynth.js",
  "./viewer/vendor/soundfont-engine/src/backends/rustysynth.js",
  "./viewer/vendor/soundfont-engine/src/backends/spessasynth.js",
  "./viewer/vendor/soundfont-engine/src/backends/wavetable.js",
  "./viewer/vendor/soundfont-engine/src/engine.js",
  "./viewer/vendor/soundfont-engine/src/events.js",
  "./viewer/vendor/soundfont-engine/src/index.js",
  "./viewer/vendor/soundfont-engine/src/scheduler-worklet.js",
  "./viewer/vendor/soundfont-engine/src/scheduler.js",
  "./viewer/vendor/soundfont-engine/vendor/oxisynth/oxisynth.js",
  "./viewer/vendor/soundfont-engine/vendor/oxisynth/oxisynth_bg.wasm",
  "./viewer/vendor/soundfont-engine/vendor/rustysynth/rustysynth.js",
  "./viewer/vendor/soundfont-engine/vendor/rustysynth/rustysynth_bg.wasm",
  "./viewer/vendor/soundfont-engine/vendor/spessasynth/spessasynth_core.bundle.js",
  "./viewer/vendor/soundfont-engine/vendor/spessasynth/spessasynth_lib.bundle.js",
  "./viewer/vendor/soundfont-engine/vendor/spessasynth/spessasynth_processor.min.js",
]
const assetUrls = new Set(assets.map(path => new URL(path, self.location.href).href))
const pageAliases = new Map(['./', './converter/', './viewer/'].map(path => [
  new URL(path, self.location.href).href,
  new URL(path + 'index.html', self.location.href).href,
]))

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    await cache.addAll(assets.map(path => new Request(new URL(path, self.location.href), { cache: 'reload' })))
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName)
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (request.mode === 'navigate') url.search = ''
  const assetUrl = pageAliases.get(url.href) ?? url.href
  if (!assetUrls.has(assetUrl)) return

  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    return (await cache.match(assetUrl)) ?? fetch(request)
  })())
})
