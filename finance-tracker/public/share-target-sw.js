/* Web Share Target handler, pulled into the generated service worker with
 * workbox importScripts (see vite.config.ts). It runs before workbox's own
 * routes and only answers POST <scope>share-target.
 *
 * The shared text or file is put in the Cache API on this device and the app is
 * opened with ?share=text or ?share=file, where it is picked up (after login if
 * needed). Nothing is sent to the network and nothing is saved automatically. */
;(() => {
  const CACHE = 'finvu-share-target'
  const MAX_FILE_BYTES = 10 * 1024 * 1024
  const MAX_TEXT = 2000

  self.addEventListener('fetch', event => {
    const req = event.request
    if (req.method !== 'POST') return
    const scope = self.registration.scope
    if (req.url.split('?')[0] !== new URL('share-target', scope).href) return

    event.respondWith((async () => {
      let dest = new URL('./', scope)
      try {
        const form = await req.formData()
        const cache = await caches.open(CACHE)
        const file = form.getAll('file').find(f => typeof f === 'object' && f && f.size > 0)
        if (file && file.size <= MAX_FILE_BYTES) {
          await cache.put(new URL('__share/file', scope).href, new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/xml',
              'X-File-Name': encodeURIComponent(file.name || 'vypis.xml'),
            },
          }))
          dest = new URL('./?share=file', scope)
        } else if (!file) {
          const field = name => String(form.get(name) || '').slice(0, MAX_TEXT)
          await cache.put(new URL('__share/text', scope).href, new Response(
            JSON.stringify({ title: field('title'), text: field('text'), url: field('url') }),
            { headers: { 'Content-Type': 'application/json' } },
          ))
          dest = new URL('./?share=text', scope)
        }
      } catch {
        /* fall through to opening the app */
      }
      return Response.redirect(dest.href, 303)
    })())
  })
})()
