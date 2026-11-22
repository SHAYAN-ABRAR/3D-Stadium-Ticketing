/**
 * What the picker needs from the data layer: the event's seats with live changes, and this tab's hold.
 * StoreBackend adapts any DataStore (in the app: LocalStore in the visitor's browser).
 */
import type { DataStore, HoldInfo, HoldResult, SeatState, SeatUpdate } from '@/data/store';

export type { HoldInfo, HoldResult } from '@/data/store';

export interface PickerBackend {
  seats(): Promise<SeatState>;
  /** Seat changes from this tab, other tabs and the sales simulator. Returns the unsubscribe function. */
  onSeats(listener: (update: SeatUpdate) => void): () => void;
  hold(seats: number[]): Promise<HoldResult>;
  release(holdId: string): Promise<void>;
  /** This tab's active hold for the event (restores it after a reload). */
  current(): Promise<HoldInfo | null>;
}

export class StoreBackend implements PickerBackend {
  constructor(
    private readonly store: DataStore,
    private readonly eventId: string,
  ) {}

  seats() {
    return this.store.seats(this.eventId);
  }

  onSeats(listener: (update: SeatUpdate) => void) {
    return this.store.onSeats(this.eventId, listener);
  }

  hold(seats: number[]) {
    return this.store.hold(this.eventId, seats);
  }

  async release(holdId: string) {
    await this.store.releaseHold(holdId);
  }

  current() {
    return this.store.currentHold(this.eventId);
  }
}
