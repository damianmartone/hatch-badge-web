# Hatch Badge — laptop web kiosk

Web version of [hatch-badge-android](https://github.com/damianmartone/hatch-badge-android),
laid out **horizontally** for a laptop screen and printing to whatever printer
the **laptop** already has — no printer IP, no port, no same-WiFi requirement.

```
┌────────────────────────┬──────────────────────────────┐
│                        │  Hanna Kang                  │
│      live webcam       │  GETYOURGUIDE                │
│   (attendee holds      │  ┌────────────────────────┐  │
│    their ticket QR)    │  │   badge preview (WYSI…)│  │
│                        │  └────────────────────────┘  │
│                        │  [Edit details][Check in &   │
│                        │                     Print]   │
└────────────────────────┴──────────────────────────────┘
```

The camera never shrinks: the badge sits *beside* it instead of below it, so the
whole flow — scan, review, edit, print — happens without anything moving.

---

## Running it

```bash
npm install
npm start
```

Then open **http://localhost:8787** in **Chrome** or **Edge**.

For development with hot reload:

```bash
npm run dev          # Vite on :5173, companion server on :8787
```

> Use Chrome or Edge. Safari has no Web Serial / Web Bluetooth, which the
> NIIMBOT backend needs, and its `BarcodeDetector` support is patchy.

### Why there's a local server

A browser can't reach a printer on its own. `server/index.js` is a small
companion process that does two things the page cannot:

1. **Printing** — lists the laptop's print queues (`lpstat`) and submits jobs
   (`lp`). Anything macOS/Linux already has installed shows up: USB, Bluetooth-paired,
   or on the WiFi. Adding a printer is a job for *System Settings → Printers & Scanners*,
   not for this app.
2. **Proxying the edge function** — so there's no CORS setup and the staff PIN
   takes a single hop.

NIIMBOT printing is the exception: it happens entirely in the browser (see below).

---

## Printers

Pick one of two backends in **Settings → Printer**.

### 1. A printer the laptop has installed (default)

Every CUPS queue is offered, with its connection shown (USB / Bluetooth / Network)
and label printers sorted first. Two ways to send the badge:

| Mode | What goes down the wire | Use it for |
| --- | --- | --- |
| **Raw ZPL** | The badge canvas as a ZPL `^GFA` graphic | Zebra label printers — sharpest, and the print is pixel-identical to the preview |
| **Image via driver** | A PNG sized to the label | Anything else, including office printers |

The Zebra path is byte-for-byte the same pipeline as the Android app, so a badge
printed from the laptop matches one printed from the tablet.

### 2. NIIMBOT (D11 / D110 / D101 / B1 / B21 / B18)

NIIMBOTs **don't speak ZPL and have no macOS driver**, so they never appear in
*Printers & Scanners* and `lp` can't reach them. This app talks to them directly
from the browser instead, over the NIIMBOT binary protocol:

- **Plugged in over USB** → Web Serial
- **Paired over Bluetooth** → Web Bluetooth (BLE)

Hit **Connect printer** in Settings (Chrome shows a device chooser — that click
is required by the browser, it can't be automated). A USB printer you've already
approved reconnects by itself after a reload.

Because a NIIMBOT print head is narrow (50 mm on a B1/B21, 12 mm on a D11) and a
badge is 80 mm wide, the badge is **turned sideways** automatically and scaled to
the head width. An 80 × 50 mm badge becomes a 384 × 613 dot strip on a B1/B21.

> ⚠️ **The NIIMBOT backend has not been tested against real hardware.** The
> protocol, framing and checksums are verified, and the packets match the
> published NIIMBOT command set, but nothing has been confirmed on an actual
> printer. Try **Save & test print** first and expect to adjust *Model / print
> head*, *Darkness* and *Label stock* for your model.

---

## Settings

Settings live in `localStorage` (per browser profile). A fresh load lands on the
Settings screen; hit **Back to kiosk** to run.

| | |
| --- | --- |
| **Access PIN** | Shared staff/admin PIN, sent as `x-staff-pin` |
| **Edge function URL** | Pre-filled; must be an https Supabase URL |
| **Staff override code** | Authorises re-printing an already checked-in badge (default `2468`) |
| **Terminal mode** | `EVENT` (badge printing) or `SESSIONS` (RSVP check-in, no printing) |
| **Printer** | Backend, queue/device, and how to send the badge |
| **Label** | `80 × 50 mm @ 203 dpi` by default; the layout re-flows if you change it |
| **Camera** | Which webcam scans |

### Staff menu

Hidden, so attendees don't find it:

- **Press and hold the top-left corner** for ~1 second, or
- Press **⌘⇧S** (Ctrl+Shift+S).

It opens *Printer, PIN & mode* or *Staff search / check-in* (list beside badge —
staff can see the queue and the badge at once).

---

## How it works

```
Browser (Chrome) ──/api/badge──▶ companion server ──HTTPS──▶ Supabase Edge Function
     │                                 │                       `badge-checkin`
     │                                 └──lp──▶ any installed printer (USB/BT/WiFi)
     │
     └──Web Serial / Web Bluetooth──▶ NIIMBOT printer
```

The badge is rendered **in the browser** to a canvas at the label's dot
resolution using the embedded **Geist** font, and that same canvas is both the
on-screen preview and the thing that gets printed.

### Badge layout rules

Ported dot-for-dot from the Android renderer:

- **QR** = 0.36 × badge width, right-aligned near the top, encoding the
  attendee's LinkedIn URL (omitted if they have none).
- **First name** (Geist Bold), **last name** (SemiBold) fill the left column
  beside the QR; they auto-shrink and ellipsize so text **never touches the QR**.
- **Company** (Medium, uppercased) sits below the QR and uses the full width,
  auto-shrunk to ~60 mm.
- Bottom band: a **role star + tag** (SPEAKER/FACILITATOR/…) or one **circle per
  day number**.

---

## Project layout

```
server/
  index.js          Express: /api/badge proxy, /api/printers, /api/print, static dist/
  printers.js       lpstat/lp wrappers — queue discovery, raw ZPL, image printing
src/
  App.tsx           Screen routing, staff menu, wake lock, toasts
  theme.css         Geist + the horizontal kiosk shell
  lib/
    api.ts          badge-checkin client (via the proxy)
    settings.ts     localStorage settings
    label.ts        Label geometry (mm/dpi → dots)
    badgeRenderer.ts  Badge → canvas using Geist (port of BadgeBitmapRenderer)
    qr.ts           Module-exact QR canvas
    zpl.ts          Canvas → ZPL ^GFA graphic
    print.ts        Routes a badge to the chosen backend
    scanner.ts      Webcam QR scanning (BarcodeDetector, jsQR fallback)
    useKiosk.ts     EVENT flow state machine
    useSessions.ts  SESSIONS flow state machine
    niimbot/
      protocol.ts   Packet framing + checksums
      transport.ts  Web Serial and Web Bluetooth transports
      image.ts      Canvas → 1-bit rows, rotation to fit the print head
      client.ts     Connect, query, full page-print handshake
      connection.ts App-wide connection store
  components/       Camera pane, badge preview, kiosk/session flows, settings, staff search
```

## Fonts

`Geist` (SIL OFL 1.1) is embedded at `public/fonts/geist_variable.ttf`.
License: `GEIST-OFL.txt`.
