import { useSyncExternalStore } from 'react'
import { NiimbotClient, type DeviceInfo } from './client'
import { serialSupported } from './transport'

/**
 * One live NIIMBOT connection for the whole app. It can't live in settings —
 * it's an open port, not a value — and it has to survive navigating between the
 * kiosk and the staff screens.
 */

export interface ConnectionState {
  client: NiimbotClient | null
  info: DeviceInfo | null
  connecting: boolean
  error: string | null
}

let state: ConnectionState = { client: null, info: null, connecting: false, error: null }
const listeners = new Set<() => void>()

function set(patch: Partial<ConnectionState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useNiimbot(): ConnectionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}

export const getNiimbot = (): NiimbotClient | null =>
  state.client && state.client.connected ? state.client : null

/** Must be called from a user gesture — Chrome shows a device chooser. */
export async function connectNiimbot(kind: 'serial' | 'bluetooth'): Promise<void> {
  if (state.connecting) return
  await disconnectNiimbot()
  set({ connecting: true, error: null })
  try {
    const client = await NiimbotClient.connect(kind)
    const info = await client.describe().catch(() => ({ name: client.name, kind: client.kind }))
    set({ client, info, connecting: false, error: null })
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    // A cancelled chooser is a normal outcome, not an error worth shouting about.
    set({
      client: null,
      info: null,
      connecting: false,
      error: /No port selected|User cancelled|chooser/i.test(msg) ? null : msg,
    })
  }
}

export async function disconnectNiimbot(): Promise<void> {
  const client = state.client
  set({ client: null, info: null, error: null })
  await client?.close().catch(() => {})
}

/**
 * After a page reload Chrome still remembers a USB port the user granted, so a
 * plugged-in printer can come back on its own with no click.
 */
export async function tryReconnectSerial(): Promise<void> {
  if (state.client || state.connecting || !serialSupported()) return
  try {
    const ports = await navigator.serial.getPorts()
    if (ports.length === 0) return
    set({ connecting: true })
    const client = await NiimbotClient.connect('serial', { reuseGranted: true })
    const info = await client.describe().catch(() => ({ name: client.name, kind: client.kind }))
    set({ client, info, connecting: false, error: null })
  } catch {
    set({ connecting: false })
  }
}
