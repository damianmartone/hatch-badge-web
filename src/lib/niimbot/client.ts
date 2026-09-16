import { isBlankRow, prepareForNiimbot, type NiimbotLayout } from './image'
import {
  decodePackets,
  describeCommand,
  encodePacket,
  hex,
  INFO,
  repliesFor,
  REQ,
  RESP_ERROR,
  RESP_NOT_SUPPORTED,
  u16be,
  type Packet,
} from './protocol'
import { connectBluetooth, connectSerial, type SerialOptions, type Transport } from './transport'

/** Print-head widths in dots (203 dpi) for the common models. */
export const HEAD_WIDTHS: { label: string; dots: number }[] = [
  { label: 'B3S — 72 mm (576 dots)', dots: 576 },
  { label: 'B1 / B21 / B203 — 50 mm (384 dots)', dots: 384 },
  { label: 'B18 — 30 mm (240 dots)', dots: 240 },
  { label: 'D11 / D110 / D101 — 12 mm (96 dots)', dots: 96 },
]

export interface NiimbotOptions {
  /** 1–5 on most models; 3 is a sane default. */
  density: number
  /** 1 = gap/with-gaps labels, 2 = black-mark, 3 = continuous. */
  labelType: number
  headWidth: number
  /** Clockwise turn, from niimbotLayout(). */
  degrees: NiimbotLayout['degrees']
}

/** What the RFID tag on the loaded roll says. It carries no dimensions. */
export interface RollInfo {
  barcode: string
  serial: string
  /** Labels on a full roll, and how many have been printed. */
  total: number
  used: number
  /** 1 = gap labels, 2 = black mark, 3 = continuous — same values as SET_LABEL_TYPE. */
  type: number
}

export interface DeviceInfo {
  name: string
  kind: 'serial' | 'bluetooth'
  model?: string
  serial?: string
  battery?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The printer said no — retrying the same command won't change its mind. */
class PrinterRefused extends Error {}

/**
 * A connected NIIMBOT printer. Talks the packet protocol over whichever
 * transport the user picked, and drives the full page-print handshake.
 */
export class NiimbotClient {
  private buffer = new Uint8Array(0)
  private waiters: {
    request: number
    types: number[]
    resolve: (p: Packet) => void
    reject: (e: Error) => void
  }[] = []
  /** Last few packets received, so a timeout can say what *did* arrive. */
  private recent: Packet[] = []
  private bytesReceived = 0

  private constructor(private transport: Transport) {
    transport.onData((chunk) => this.ingest(chunk))
  }

  static async connect(kind: 'serial' | 'bluetooth', opts: SerialOptions = {}): Promise<NiimbotClient> {
    const transport = kind === 'serial' ? await connectSerial(opts) : await connectBluetooth()
    const client = new NiimbotClient(transport)
    // Newer firmware wants a connect handshake before anything else; older
    // models don't know the command, so a non-answer here is fine.
    await client
      .transceive(REQ.CONNECT, [0x01], [0xc2], { tries: 1, timeout: 800 })
      .catch(() => undefined)
    return client
  }

  get connected(): boolean {
    return this.transport.isOpen()
  }

  get name(): string {
    return this.transport.name
  }

  get kind(): 'serial' | 'bluetooth' {
    return this.transport.kind
  }

  async close(): Promise<void> {
    this.waiters.forEach((w) => w.reject(new Error('Disconnected')))
    this.waiters = []
    await this.transport.close()
  }

  private ingest(chunk: Uint8Array): void {
    this.bytesReceived += chunk.length
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer)
    merged.set(chunk, this.buffer.length)
    const { packets, rest } = decodePackets(merged)
    this.buffer = rest

    for (const packet of packets) {
      this.recent = [...this.recent.slice(-5), packet]

      const idx = this.waiters.findIndex((w) => w.types.includes(packet.type))
      if (idx >= 0) {
        this.waiters.splice(idx, 1)[0].resolve(packet)
        continue
      }

      // An error / unsupported reply answers whatever we're waiting on — fail
      // it now with the real reason instead of letting it time out as silence.
      if ((packet.type === RESP_ERROR || packet.type === RESP_NOT_SUPPORTED) && this.waiters.length > 0) {
        const w = this.waiters.shift()!
        const why = packet.type === RESP_ERROR ? 'reported an error on' : 'does not support'
        w.reject(
          new PrinterRefused(
            `Printer ${why} command ${describeCommand(w.request)}` +
              (packet.data.length ? ` [${hex(packet.data)}]` : ''),
          ),
        )
      }
    }
  }

  /** What arrived from the printer, for error messages. */
  private diagnostics(): string {
    if (this.bytesReceived === 0) {
      return 'Nothing at all came back from the printer — check it is switched on and that the right port was picked.'
    }
    if (this.recent.length === 0) {
      return `${this.bytesReceived} bytes came back but none formed a valid NIIMBOT packet.`
    }
    return `Last replies: ${this.recent.map((p) => `0x${p.type.toString(16)}[${hex(p.data)}]`).join(', ')}`
  }

  /** Fire and forget — used for the thousands of image rows. */
  private async send(type: number, data: number[] | Uint8Array): Promise<void> {
    await this.transport.write(encodePacket(type, data))
  }

  /** Send and wait for the matching reply, retrying a couple of times. */
  private async transceive(
    type: number,
    data: number[] | Uint8Array,
    expect: number[] = repliesFor(type),
    { timeout = 2000, tries = 3 } = {},
  ): Promise<Packet> {
    let lastError: Error = new Error(`No reply to command ${describeCommand(type)}`)
    for (let attempt = 0; attempt < tries; attempt++) {
      const waiter = new Promise<Packet>((resolve, reject) => {
        const entry = { request: type, types: expect, resolve, reject }
        this.waiters.push(entry)
        setTimeout(() => {
          const i = this.waiters.indexOf(entry)
          if (i >= 0) {
            this.waiters.splice(i, 1)
            reject(new Error(`Printer did not answer command ${describeCommand(type)}. ${this.diagnostics()}`))
          }
        }, timeout)
      })
      try {
        await this.send(type, data)
        return await waiter
      } catch (e) {
        lastError = e as Error
        if (e instanceof PrinterRefused) break
      }
    }
    throw lastError
  }

  // ---- Queries ----

  private async info(key: number): Promise<Packet | null> {
    try {
      // GET_INFO replies with 0x40 + key, so accept a window of ids.
      return await this.transceive(REQ.GET_INFO, [key], [(REQ.GET_INFO + key) & 0xff], { tries: 1, timeout: 1200 })
    } catch {
      return null
    }
  }

  async describe(): Promise<DeviceInfo> {
    const dec = new TextDecoder()
    const [serial, battery] = await Promise.all([this.info(INFO.DEVICE_SERIAL), this.info(INFO.BATTERY)])
    return {
      name: this.name,
      kind: this.kind,
      serial: serial ? dec.decode(serial.data).replace(/[^\x20-\x7e]/g, '') : undefined,
      battery: battery?.data.length ? battery.data[battery.data.length - 1] : undefined,
    }
  }

  /**
   * Reads the loaded roll's RFID tag. Null when there's no tag (third-party
   * rolls) or the model doesn't answer.
   *
   * Layout: uuid(8) · barcodeLen · barcode · serialLen · serial ·
   *         total(u16) · used(u16) · type(u8)
   */
  async readRoll(): Promise<RollInfo | null> {
    let packet: Packet
    try {
      packet = await this.transceive(REQ.GET_RFID, [0x01], repliesFor(REQ.GET_RFID), { tries: 1, timeout: 1500 })
    } catch {
      return null
    }
    const d = packet.data
    if (d.length < 9 || d[0] === 0) return null

    const text = new TextDecoder()
    let i = 8
    const readString = (): string | null => {
      if (i >= d.length) return null
      const len = d[i++]
      if (i + len > d.length) return null
      const value = text.decode(d.slice(i, i + len))
      i += len
      return value
    }
    const barcode = readString()
    const serial = readString()
    if (barcode === null || serial === null || i + 5 > d.length) return null

    return {
      barcode,
      serial,
      total: (d[i] << 8) | d[i + 1],
      used: (d[i + 2] << 8) | d[i + 3],
      type: d[i + 4],
    }
  }

  async heartbeat(): Promise<boolean> {
    try {
      await this.transceive(REQ.HEARTBEAT, [0x01], repliesFor(REQ.HEARTBEAT), { tries: 1, timeout: 1500 })
      return true
    } catch {
      return false
    }
  }

  // ---- Printing ----

  /**
   * Full page print: configure, stream the rows, then wait for the printer to
   * report the page as finished before releasing it.
   */
  async printCanvas(source: HTMLCanvasElement, opts: NiimbotOptions, quantity = 1): Promise<void> {
    const image = prepareForNiimbot(source, opts.headWidth, opts.degrees)

    await this.transceive(REQ.SET_LABEL_TYPE, [opts.labelType])
    await this.transceive(REQ.SET_DENSITY, [opts.density])
    await this.transceive(REQ.PRINT_START, [0x01])
    await this.transceive(REQ.PAGE_START, [0x01])
    await this.transceive(REQ.SET_PAGE_SIZE, [...u16be(image.height), ...u16be(image.width)])
    await this.transceive(REQ.SET_QUANTITY, u16be(quantity))

    for (let y = 0; y < image.rows.length; y++) {
      const row = image.rows[y]
      if (isBlankRow(row)) {
        // Empty rows have their own cheap command.
        await this.send(REQ.PRINT_EMPTY_ROW, [...u16be(y), 0x01])
      } else {
        // [row, blackCount x3, repeat, …bits]. Zeroed counts are accepted.
        const payload = new Uint8Array(6 + row.length)
        payload.set([...u16be(y), 0, 0, 0, 0x01])
        payload.set(row, 6)
        await this.send(REQ.PRINT_BITMAP_ROW, payload)
      }
    }

    await this.transceive(REQ.PAGE_END, [0x01])
    await this.waitForPage(quantity)
    await this.transceive(REQ.PRINT_END, [0x01])
  }

  /** Poll until the printer says the page came out (or we give up waiting). */
  private async waitForPage(quantity: number, timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    await sleep(300)
    while (Date.now() < deadline) {
      try {
        const status = await this.transceive(REQ.PRINT_STATUS, [0x01], repliesFor(REQ.PRINT_STATUS), {
          tries: 1,
          timeout: 1500,
        })
        const page = (status.data[0] << 8) | status.data[1]
        if (page >= quantity) return
      } catch {
        // Some models stop answering once the page is done; that's a finish too.
        return
      }
      await sleep(400)
    }
  }
}
