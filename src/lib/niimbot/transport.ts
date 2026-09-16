/**
 * Byte transports to a NIIMBOT printer. Both run in the browser, because that
 * is where the USB-serial and BLE APIs live — the companion server is not
 * involved in a NIIMBOT print at all.
 */

export interface Transport {
  readonly kind: 'serial' | 'bluetooth'
  readonly name: string
  write(bytes: Uint8Array): Promise<void>
  onData(cb: (bytes: Uint8Array) => void): void
  close(): Promise<void>
  isOpen(): boolean
}

export const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator
export const bluetoothSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------- USB serial (the "plugged in" case) ----------------

export interface SerialOptions {
  baudRate?: number
  /**
   * Silently reuse a port the user already granted (used to come back after a
   * reload). The Connect button leaves this off so staff can always pick a
   * different printer from Chrome's chooser.
   */
  reuseGranted?: boolean
}

/**
 * Opens a USB-serial NIIMBOT. `requestPort()` must be called from a user
 * gesture — the Connect button in Settings — because Chrome shows a chooser.
 */
export async function connectSerial({ baudRate = 115200, reuseGranted = false }: SerialOptions = {}): Promise<Transport> {
  if (!serialSupported()) throw new Error('This browser has no Web Serial. Use Chrome or Edge.')

  const granted = reuseGranted ? await navigator.serial.getPorts() : []
  const port = granted[0] ?? (await navigator.serial.requestPort())
  await port.open({ baudRate })

  let listener: ((b: Uint8Array) => void) | null = null
  let open = true
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  const pump = async () => {
    while (open && port.readable) {
      reader = port.readable.getReader()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          if (value && listener) listener(value)
        }
      } catch {
        /* the port went away — the loop below will notice `open` */
      } finally {
        reader.releaseLock()
        reader = null
      }
      if (open) await sleep(50)
    }
  }
  void pump()

  const info = port.getInfo?.() ?? {}
  const name =
    info.usbVendorId != null
      ? `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0)
          .toString(16)
          .padStart(4, '0')}`
      : 'USB serial printer'

  return {
    kind: 'serial',
    name,
    isOpen: () => open,
    onData: (cb) => {
      listener = cb
    },
    async write(bytes) {
      const writer = port.writable!.getWriter()
      try {
        await writer.write(bytes)
      } finally {
        writer.releaseLock()
      }
    },
    async close() {
      open = false
      try {
        await reader?.cancel()
      } catch {
        /* already gone */
      }
      await port.close().catch(() => {})
    },
  }
}

// ---------------- BLE ----------------

/** Service/characteristic pairs seen across NIIMBOT models; first match wins. */
const BLE_SERVICES: { service: string; write: string; notify?: string }[] = [
  {
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
  {
    service: '0000ff00-0000-1000-8000-00805f9b34fb',
    write: '0000ff02-0000-1000-8000-00805f9b34fb',
    notify: '0000ff01-0000-1000-8000-00805f9b34fb',
  },
  {
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    write: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    notify: '49535343-1e4d-4bd9-ba61-23c647249616',
  },
]

/** BLE writes are capped by the MTU; 20 bytes is the safe floor. */
const BLE_CHUNK = 20

export async function connectBluetooth(): Promise<Transport> {
  if (!bluetoothSupported()) throw new Error('This browser has no Web Bluetooth. Use Chrome or Edge.')

  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { namePrefix: 'D11' }, { namePrefix: 'D110' }, { namePrefix: 'D101' },
      { namePrefix: 'B1' }, { namePrefix: 'B18' }, { namePrefix: 'B21' },
      { namePrefix: 'B203' }, { namePrefix: 'NIIMBOT' }, { namePrefix: 'JC' },
    ],
    optionalServices: BLE_SERVICES.map((s) => s.service),
  })

  const server = await device.gatt!.connect()

  let writeChar: BluetoothRemoteGATTCharacteristic | null = null
  let notifyChar: BluetoothRemoteGATTCharacteristic | null = null
  for (const cfg of BLE_SERVICES) {
    try {
      const service = await server.getPrimaryService(cfg.service)
      writeChar = await service.getCharacteristic(cfg.write)
      notifyChar = cfg.notify ? await service.getCharacteristic(cfg.notify).catch(() => null) : writeChar
      break
    } catch {
      /* try the next known service */
    }
  }
  if (!writeChar) {
    server.disconnect()
    throw new Error('Connected, but this printer exposes no known NIIMBOT service.')
  }

  let listener: ((b: Uint8Array) => void) | null = null
  if (notifyChar?.properties.notify) {
    await notifyChar.startNotifications().catch(() => {})
    notifyChar.addEventListener('characteristicvaluechanged', (e) => {
      const v = (e.target as BluetoothRemoteGATTCharacteristic).value
      if (v && listener) listener(new Uint8Array(v.buffer.slice(0)))
    })
  }

  const withoutResponse = writeChar.properties.writeWithoutResponse

  return {
    kind: 'bluetooth',
    name: device.name || 'NIIMBOT (Bluetooth)',
    isOpen: () => Boolean(device.gatt?.connected),
    onData: (cb) => {
      listener = cb
    },
    async write(bytes) {
      for (let i = 0; i < bytes.length; i += BLE_CHUNK) {
        const chunk = bytes.slice(i, i + BLE_CHUNK)
        if (withoutResponse) await writeChar!.writeValueWithoutResponse(chunk)
        else await writeChar!.writeValueWithResponse(chunk)
      }
    },
    async close() {
      try {
        await notifyChar?.stopNotifications()
      } catch {
        /* already stopped */
      }
      device.gatt?.disconnect()
    },
  }
}
