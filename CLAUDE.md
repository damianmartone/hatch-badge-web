# hatch-badge-web

Laptop web kiosk for Hatch 2026 badge check-in & printing. Horizontal sibling of
`../hatch-badge-android` (same Supabase `badge-checkin` edge function, same badge
design). Read `README.md` first — it covers the architecture and both printer
backends.

## Shape of the thing

- **Vite + React + TypeScript** client in `src/`, plain **Node/Express** companion
  server in `server/` (no build step, ESM).
- `npm run dev` = Vite on :5173 proxying `/api` to the server on :8787.
  `npm start` = build, then serve everything from :8787.
- The server exists because a browser can't reach a printer or dodge CORS. Keep
  it thin: printer discovery/submission and one API proxy.

## Rules that matter

- **The badge renderer is a port, not a redesign.** `src/lib/badgeRenderer.ts`
  mirrors Android's `BadgeBitmapRenderer.kt` proportion for proportion (margins
  as fractions of height, QR at 0.36 × width, the same auto-shrink rules). If you
  change one, change both, or badges printed from the laptop and the tablet stop
  matching.
- **Canvas is the single source of truth for printing.** The preview canvas *is*
  what gets converted to ZPL / NIIMBOT rows. Never render the badge twice.
- Geist must be loaded before any canvas text measurement — `await ensureGeist()`.
  Skipping it silently measures a fallback font and shifts the whole layout.
- Settings are client-side (`localStorage`). The server only ever receives the
  function URL + PIN per request, and validates the URL is an https Supabase host.

## Printing

Two backends, chosen in Settings:

- `system` — CUPS. `lp -o raw` for Zebra/ZPL queues, PNG through the driver
  otherwise. Works for USB, Bluetooth-paired and WiFi printers alike, because
  macOS has already done the connecting.
- `niimbot` — the browser speaks the NIIMBOT binary protocol over Web Serial
  (USB) or Web Bluetooth (BLE). The server is not involved.

**NIIMBOT reply ids are not always request + 1.** `SET_LABEL_TYPE` answers
0x33, `SET_DENSITY` 0x31, `PRINT_STATUS` 0xB3 — see `repliesFor()` in
`niimbot/protocol.ts`. Assuming +1 made a real B3S look silent. Timeout errors
now list what the printer *did* send, so read the error text before guessing.

The hardware in use is a **NIIMBOT B3S_P** (USB VID 0x3513 / PID 2,
`/dev/cu.usbmodem*`; its Bluetooth side is `/dev/cu.B3S_P-*`). Nothing past the
first handshake command has run on it yet; if the next failure is at
`PRINT_START` or `SET_PAGE_SIZE`, the B3S likely wants the newer longer payloads
(7-byte print start, 6-byte page size with copies).

## Testing without hardware

Modules are importable from the Vite dev server, so a browser console is the
fastest test harness:

```js
const { renderBadge } = await import('/src/lib/badgeRenderer.ts')
const { prepareForNiimbot } = await import('/src/lib/niimbot/image.ts')
```

To check the print path without wasting a label, submit a held CUPS job and
cancel it: `lp -d <queue> -o raw -H hold file.zpl` then `cancel <job-id>`.

## Where things stand (16 Sep 2026)

Built in one pass as a port of `../hatch-badge-android`; that repo is the
reference for anything about the badge design or the edge function.

Verified:
- Badge renderer against four cases, including a name long enough to force
  shrink-and-ellipsize. Output matches the Android layout.
- Printer discovery on this laptop (`Zebra_Technologies_ZTC_ZD421_203dpi_ZPL`,
  currently USB; the Canon and OKI are the WiFi ones).
- That the Zebra queue accepts `lp -o raw` — confirmed with a held job that was
  then cancelled, so no label was spent.
- NIIMBOT packet framing/checksums and the sideways-rotation image path
  (639×400 badge → 384×613 dot strip for a 384-dot head).

Not verified:
- **A full NIIMBOT print.** A B3S failed at the first command (reply-id bug,
  now fixed and tested against a simulated printer); not yet re-tried.
- Live check-in against the edge function (no PIN was entered during the build),
  so `lookup`/`search`/`checkin`/`update` have only been exercised as types.

Remote: https://github.com/damianmartone/hatch-badge-web (private).
