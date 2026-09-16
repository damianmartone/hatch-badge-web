import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listPrinters, printRaw, printImage } from './printers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DIST = join(ROOT, 'dist')

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'

const DEFAULT_FUNCTION_URL =
  process.env.BADGE_FUNCTION_URL ||
  'https://dpacnmgiyezxtodtodac.supabase.co/functions/v1/badge-checkin'

const app = express()

/**
 * Settings, camera and USB-printer permissions are all stored per origin, and
 * localhost and 127.0.0.1 are different origins — open the kiosk via one, then
 * the other, and the PIN looks lost. Send page loads to a single address.
 * (/api is left alone: the Vite dev proxy reaches it as 127.0.0.1.)
 */
app.use((req, res, next) => {
  if (req.hostname === '127.0.0.1' && req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.redirect(302, `http://localhost:${PORT}${req.originalUrl}`)
  }
  next()
})

app.use(express.json({ limit: '12mb' }))

/**
 * The browser never calls the edge function directly: proxying through here
 * sidesteps CORS and keeps the staff PIN on a single hop. Only HTTPS Supabase
 * function URLs are forwarded, so a stray settings value can't turn this into
 * an open relay.
 */
function validFunctionUrl(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return null
    if (!/(^|\.)supabase\.(co|net)$/.test(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

app.post('/api/badge', async (req, res) => {
  const { functionUrl, pin, ...body } = req.body || {}
  const url = validFunctionUrl(functionUrl || DEFAULT_FUNCTION_URL)
  if (!url) {
    return res.status(400).json({ error: 'bad_function_url', detail: 'Function URL must be an https Supabase URL.' })
  }
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-staff-pin': pin || '' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const text = await upstream.text()
    res.status(upstream.status).type('application/json').send(text)
  } catch (e) {
    res.status(502).json({ error: 'network', detail: String(e?.message || e) })
  }
})

app.get('/api/printers', async (_req, res) => {
  try {
    res.json({ printers: await listPrinters() })
  } catch (e) {
    res.status(500).json({ error: 'lpstat_failed', detail: String(e?.message || e) })
  }
})

app.post('/api/print', async (req, res) => {
  const { printer, mode = 'raw', zpl, pngBase64, widthMm = 80, heightMm = 50, title } = req.body || {}
  if (!printer) return res.status(400).json({ error: 'no_printer', detail: 'Pick a printer first.' })

  try {
    const result = mode === 'image'
      ? await printImage(printer, Buffer.from(String(pngBase64 || ''), 'base64'), widthMm, heightMm, title)
      : await printRaw(printer, String(zpl || ''), title)

    if (!result.ok) return res.status(500).json({ error: 'print_failed', detail: result.error })
    res.json({ ok: true, jobId: result.jobId })
  } catch (e) {
    res.status(500).json({ error: 'print_failed', detail: String(e?.message || e) })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true, platform: process.platform }))

if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')))
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .type('text/plain')
      .send('Companion server is up. Run `npm run dev` and open http://localhost:5173, or `npm start` to serve the built app from here.'),
  )
}

app.listen(PORT, HOST, () => {
  console.log(`Hatch badge companion server on http://${HOST}:${PORT}`)
  if (!existsSync(DIST)) console.log('No dist/ build yet — the Vite dev server on :5173 proxies here.')
})
