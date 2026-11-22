'use client';
/**
 * The auto tour (prototype: runTour): stand, block, seat, view, skybox, VIP chair. Uses Block 232 row 10
 * (kept free in every on-sale sample event). Any pointer or wheel input stops it.
 */
import { blockById, getLayout, indexOf } from '@/lib/stadium';
import { runAroundSeat } from '@/lib/picker/runs';
import { nearestBox } from '@/lib/picker/selection';
import { allowedNow, chooseChairs, middleOf, setSelection, toggleChair, usePicker } from './store';

let current: { stop: boolean; cleanup: () => void } | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function stopTour() {
  if (!current) return;
  current.stop = true;
  current.cleanup();
  current = null;
  usePicker.setState({ tour: false });
}

export async function startTour() {
  const s = usePicker.getState(),
    e = s.engine;
  if (!e || s.status !== 'ready' || current) return;
  const onInput = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    if (target?.closest?.('[aria-pressed]')) return; // the tour button itself
    stopTour();
  };
  document.addEventListener('pointerdown', onInput, true);
  document.addEventListener('wheel', onInput, { capture: true, passive: true });
  const me = {
    stop: false,
    cleanup: () => {
      document.removeEventListener('pointerdown', onInput, true);
      document.removeEventListener('wheel', onInput, true);
    },
  };
  current = me;
  usePicker.setState({ tour: true });
  const on = () => current === me && !me.stop;
  const wait = async (ms: number) => {
    await sleep(ms);
    return on();
  };
  const L = getLayout();
  try {
    if (e.navState.level !== 'overview') {
      await e.goOverview();
      if (!(await wait(500))) return;
    }
    const statuses = usePicker.getState().statuses;
    const freeIn = (bi: number) => {
      const b = L.blocks[bi];
      let n = 0;
      for (let i = b.firstSeat; i < b.firstSeat + b.seatCount; i++) if (!statuses || statuses[i] === 0) n++;
      return n;
    };
    let b = blockById(232);
    if (!b || freeIn(b.index) < 1) {
      b = L.blocks
        .filter((x) => x.standKey === 'N' && x.tierKey === 'M')
        .sort((x, y) => freeIn(y.index) - freeIn(x.index))[0];
    }
    e.highlight('stand', b.stand, { at: e.screenOfTarget('stand', b.stand) });
    if (!(await wait(1600))) return;
    await e.goStand(b.stand);
    if (!(await wait(500))) return;
    e.highlight('block', b.index, { at: e.screenOfTarget('block', b.index) });
    if (!(await wait(1600))) return;
    await e.goBlock(b.index);
    if (!(await wait(400))) return;

    const q = usePicker.getState().quantity;
    const st = usePicker.getState().statuses;
    let seat = indexOf(232, 10, 8);
    let run = st && seat >= 0 ? runAroundSeat(st, seat, q, allowedNow) : null;
    if (!run && st) {
      for (let i = b.firstSeat; i < b.firstSeat + b.seatCount && !run; i++) {
        run = runAroundSeat(st, i, q, allowedNow);
        if (run) seat = i;
      }
    }
    if (!run) return;
    e.highlight('seat', seat, { run, at: e.screenOfTarget('seat', seat) });
    if (!(await wait(1900))) return;
    setSelection(run);
    await e.goSeat(middleOf(run));
    // Match day: the crowd starts a Mexican wave while the visitor takes in the view.
    e.startWave();
    if (!(await wait(3400))) return;
    const boxIndex = nearestBox(middleOf(run));
    await e.goBox(boxIndex);
    if (!(await wait(3200))) return;
    const box = L.boxes[boxIndex];
    const st2 = usePicker.getState().statuses;
    const k = [1, 2, 0, 3, 5, 6, 4, 7].find((c) => !st2 || st2[box.firstSeat + c] === 0);
    if (k === undefined) return;
    chooseChairs(true);
    e.highlight('vip', k, { at: e.screenOfTarget('vip', k) });
    if (!(await wait(1600))) return;
    toggleChair(k);
  } finally {
    if (current === me) stopTour();
  }
}
