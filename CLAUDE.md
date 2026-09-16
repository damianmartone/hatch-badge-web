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

**The NIIMBOT path has never run against real hardware.** Framing/checksums are
verified and the command ids match the published protocol, but if you get your
hands on a printer, verify the print handshake in `niimbot/client.ts`
(`printCanvas`) and the `SET_PAGE_SIZE` argument order first — those are the
likeliest things to be wrong.

## Testing without hardware

Modules are importable from the Vite dev server, so a browser console is the
fastest test harness:

```js
const { renderBadge } = await import('/src/lib/badgeRenderer.ts')
const { prepareForNiimbot } = await import('/src/lib/niimbot/image.ts')
```

To check the print path without wasting a label, submit a held CUPS job and
cancel it: `lp -d <queue> -o raw -H hold file.zpl` then `cancel <job-id>`.
