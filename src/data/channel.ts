/**
 * Change notices between tabs: after a transaction commits, the store publishes what changed. Listeners in
 * this tab hear it at once; other tabs of the same browser hear it through a BroadcastChannel.
 */
import type { SeatChanges } from './store';

export type DataMessage =
  | { type: 'seats'; eventId: string; version: number; changes: SeatChanges }
  | { type: 'reload'; eventId: string; version: number }
  | { type: 'orders' };

type Listener = (m: DataMessage) => void;

export class DataChannel {
  private readonly listeners = new Set<Listener>();
  private readonly bc: BroadcastChannel | null;

  constructor(name: string) {
    this.bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
    this.bc?.addEventListener('message', (e: MessageEvent<DataMessage>) => this.deliver(e.data));
  }

  publish(message: DataMessage) {
    this.deliver(message);
    this.bc?.postMessage(message);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.listeners.clear();
    this.bc?.close();
  }

  private deliver(message: DataMessage) {
    for (const l of [...this.listeners]) {
      try {
        l(message);
      } catch (e) {
        console.error('[data] listener failed:', e);
      }
    }
  }
}
