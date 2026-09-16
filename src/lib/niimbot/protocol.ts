/**
 * NIIMBOT packet protocol.
 *
 * NIIMBOT label printers (D11, D110, B1, B21, B18…) speak a small proprietary
 * binary protocol rather than ZPL, and macOS has no driver for them — they never
 * appear as a CUPS queue. So we talk to them directly over USB serial (Web
 * Serial) or BLE (Web Bluetooth) instead of going through `lp`.
 *
 * Frame: 55 55 <type> <len> <data…> <checksum> AA AA
 * where checksum = type XOR len XOR every data byte.
 */

export const REQ = {
  CONNECT: 0xc1,
  PRINT_START: 0x01,
  PAGE_START: 0x03,
  SET_PAGE_SIZE: 0x13,
  SET_QUANTITY: 0x15,
  SET_DENSITY: 0x21,
  SET_LABEL_TYPE: 0x23,
  GET_INFO: 0x40,
  GET_RFID: 0x1a,
  PRINT_EMPTY_ROW: 0x84,
  PRINT_BITMAP_ROW: 0x85,
  PRINT_STATUS: 0xa3,
  HEARTBEAT: 0xdc,
  PAGE_END: 0xe3,
  PRINT_END: 0xf3,
} as const

/** Keys for GET_INFO. */
export const INFO = {
  DENSITY: 1,
  PRINT_SPEED: 2,
  LABEL_TYPE: 3,
  AUTO_SHUTDOWN: 7,
  DEVICE_TYPE: 8,
  SOFT_VERSION: 9,
  BATTERY: 10,
  DEVICE_SERIAL: 11,
  HARD_VERSION: 12,
} as const

export interface Packet {
  type: number
  data: Uint8Array
}

export function encodePacket(type: number, data: Uint8Array | number[]): Uint8Array {
  const body = data instanceof Uint8Array ? data : Uint8Array.from(data)
  let checksum = type ^ body.length
  for (const b of body) checksum ^= b

  const out = new Uint8Array(body.length + 7)
  out[0] = 0x55
  out[1] = 0x55
  out[2] = type
  out[3] = body.length
  out.set(body, 4)
  out[body.length + 4] = checksum & 0xff
  out[body.length + 5] = 0xaa
  out[body.length + 6] = 0xaa
  return out
}

/**
 * Pulls whole frames out of a rolling byte buffer. Returns the packets found
 * and whatever tail bytes belong to a frame that hasn't fully arrived yet.
 */
export function decodePackets(buffer: Uint8Array): { packets: Packet[]; rest: Uint8Array<ArrayBuffer> } {
  const packets: Packet[] = []
  let i = 0

  while (i + 7 <= buffer.length) {
    if (buffer[i] !== 0x55 || buffer[i + 1] !== 0x55) {
      i++ // resync on the next candidate header
      continue
    }
    const type = buffer[i + 2]
    const len = buffer[i + 3]
    const end = i + 4 + len + 3
    if (end > buffer.length) break // incomplete — wait for more bytes

    const data = buffer.slice(i + 4, i + 4 + len)
    let checksum = type ^ len
    for (const b of data) checksum ^= b

    if ((checksum & 0xff) === buffer[i + 4 + len] && buffer[end - 2] === 0xaa && buffer[end - 1] === 0xaa) {
      packets.push({ type, data })
      i = end
    } else {
      i++ // bad frame — resync
    }
  }
  // Copy rather than slice so the tail owns a plain ArrayBuffer of its own.
  const rest = new Uint8Array(buffer.length - i)
  rest.set(buffer.subarray(i))
  return { packets, rest }
}

export const u16be = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff]

/**
 * The reply id the printer sends back for each request. Most are request + 1,
 * but a few settings/status commands answer at request + 0x10 — assuming +1
 * everywhere makes those look like the printer never answered.
 */
const REPLY_OVERRIDES: Record<number, number[]> = {
  [REQ.SET_DENSITY]: [0x31],
  [REQ.SET_LABEL_TYPE]: [0x33],
  [REQ.PRINT_STATUS]: [0xb3],
  [REQ.HEARTBEAT]: [0xdd, 0xde, 0xdf, 0xd9],
}

export function repliesFor(requestType: number): number[] {
  return REPLY_OVERRIDES[requestType] ?? [(requestType + 1) & 0xff]
}

/** Replies that mean "no" rather than "done". */
export const RESP_ERROR = 0xdb
export const RESP_NOT_SUPPORTED = 0x00

const NAMES: Record<number, string> = {
  [REQ.CONNECT]: 'connect',
  [REQ.PRINT_START]: 'print start',
  [REQ.PAGE_START]: 'page start',
  [REQ.SET_PAGE_SIZE]: 'page size',
  [REQ.SET_QUANTITY]: 'quantity',
  [REQ.SET_DENSITY]: 'density',
  [REQ.SET_LABEL_TYPE]: 'label type',
  [REQ.GET_INFO]: 'get info',
  [REQ.PRINT_STATUS]: 'print status',
  [REQ.HEARTBEAT]: 'heartbeat',
  [REQ.PAGE_END]: 'page end',
  [REQ.PRINT_END]: 'print end',
}

/** "0x23 (label type)" — for error messages staff might read out to us. */
export const describeCommand = (type: number): string =>
  `0x${type.toString(16).padStart(2, '0')}${NAMES[type] ? ` (${NAMES[type]})` : ''}`

export const hex = (bytes: Uint8Array | number[]): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
