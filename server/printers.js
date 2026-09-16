import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * The laptop's own print system (CUPS on macOS/Linux) is the whole printer
 * story here: anything the OS has installed — USB, Bluetooth-paired, or on the
 * WiFi — is already a queue, so there is no printer IP to configure.
 */

/** `usb://Zebra%20Technologies/ZTC...` -> "USB", dnssd/ipp -> "Network", etc. */
function connectionOf(uri = '') {
  const scheme = uri.split(':')[0].toLowerCase()
  if (scheme === 'usb') return 'USB'
  if (scheme === 'bluetooth' || uri.toLowerCase().includes('bluetooth')) return 'Bluetooth'
  if (['dnssd', 'ipp', 'ipps', 'socket', 'lpd', 'http', 'https', 'smb'].includes(scheme)) return 'Network'
  if (scheme === 'file') return 'File'
  return scheme ? scheme.toUpperCase() : 'Unknown'
}

/** A Zebra/ZPL queue can take raw ZPL; anything else should get an image. */
function looksZpl(name = '', info = '', uri = '') {
  const hay = `${name} ${info} ${uri}`.toLowerCase()
  return /zebra|zpl|ztc|zd\d|zq\d|zt\d|gk\d|gx\d|label/.test(hay)
}

async function tryRun(cmd, args) {
  try {
    const { stdout } = await run(cmd, args, { timeout: 10_000 })
    return stdout
  } catch (e) {
    // lpstat exits non-zero when a class of query has no results; keep its output.
    return e.stdout || ''
  }
}

/** Every installed print queue, with the bits the UI needs to pick one. */
export async function listPrinters() {
  const [pOut, vOut, dOut, lOut] = await Promise.all([
    tryRun('lpstat', ['-p']),
    tryRun('lpstat', ['-v']),
    tryRun('lpstat', ['-d']),
    tryRun('lpstat', ['-l', '-p']),
  ])

  const uris = new Map()
  for (const line of vOut.split('\n')) {
    const m = line.match(/^device for (.+?):\s*(.+)$/)
    if (m) uris.set(m[1], m[2].trim())
  }

  // "Description: Zebra ZD421" lines from `lpstat -l -p`, keyed by printer.
  const descriptions = new Map()
  let current = null
  for (const line of lOut.split('\n')) {
    const p = line.match(/^printer (\S+)/)
    if (p) { current = p[1]; continue }
    const d = line.match(/^\s+Description:\s*(.+)$/)
    if (d && current) descriptions.set(current, d[1].trim())
  }

  const defaultName = (dOut.match(/system default destination:\s*(\S+)/) || [])[1] || ''

  const printers = []
  for (const line of pOut.split('\n')) {
    const m = line.match(/^printer (\S+) is (\S+?)\.?(\s|$)/)
    if (!m) continue
    const name = m[1]
    const uri = uris.get(name) || ''
    const description = descriptions.get(name) || ''
    printers.push({
      name,
      description,
      state: m[2],
      uri,
      connection: connectionOf(uri),
      zpl: looksZpl(name, description, uri),
      isDefault: name === defaultName,
    })
  }
  // Label printers first — that is what staff are looking for.
  printers.sort((a, b) => Number(b.zpl) - Number(a.zpl) || a.name.localeCompare(b.name))
  return printers
}

async function withTempFile(name, data, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'hatch-badge-'))
  const file = join(dir, name)
  try {
    await writeFile(file, data)
    return await fn(file)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function jobIdFrom(stdout = '') {
  return (stdout.match(/request id is (\S+)/) || [])[1] || ''
}

/**
 * Raw ZPL straight to a Zebra queue. `-o raw` is what CUPS wants; some newer
 * queues only accept the explicit document-format, so we try that next.
 */
export async function printRaw(printer, zpl, title = 'Hatch badge') {
  return withTempFile('badge.zpl', zpl, async (file) => {
    const attempts = [
      ['-d', printer, '-o', 'raw', '-t', title, file],
      ['-d', printer, '-o', 'document-format=application/vnd.cups-raw', '-t', title, file],
    ]
    let last = ''
    for (const args of attempts) {
      try {
        const { stdout } = await run('lp', args, { timeout: 20_000 })
        return { ok: true, jobId: jobIdFrom(stdout) }
      } catch (e) {
        last = (e.stderr || e.message || '').trim()
      }
    }
    return { ok: false, error: last || 'lp failed' }
  })
}

/** PNG through the printer's own driver — works with any printer, Zebra or not. */
export async function printImage(printer, pngBuffer, widthMm, heightMm, title = 'Hatch badge') {
  return withTempFile('badge.png', pngBuffer, async (file) => {
    const args = [
      '-d', printer,
      '-o', `media=Custom.${widthMm}x${heightMm}mm`,
      '-o', 'fit-to-page',
      '-o', 'position=center',
      '-t', title,
      file,
    ]
    try {
      const { stdout } = await run('lp', args, { timeout: 20_000 })
      return { ok: true, jobId: jobIdFrom(stdout) }
    } catch (e) {
      // Some drivers reject a custom media size; fall back to the queue default.
      try {
        const { stdout } = await run('lp', ['-d', printer, '-o', 'fit-to-page', '-t', title, file], { timeout: 20_000 })
        return { ok: true, jobId: jobIdFrom(stdout) }
      } catch (e2) {
        return { ok: false, error: (e2.stderr || e.stderr || e2.message || '').trim() || 'lp failed' }
      }
    }
  })
}
