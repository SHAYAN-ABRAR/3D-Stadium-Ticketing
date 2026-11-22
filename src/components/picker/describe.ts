/** Human descriptions of a selection, in the visitor's language. */
import type { SelectionSummary } from '@/lib/picker/selection';
import type { Fmt } from '../useFormat';

type T = (key: string, values?: Record<string, string | number>) => string;

export function describeSelection(sum: SelectionSummary, fmt: Fmt, t: T): string {
  if (sum.kind === 'vip') {
    if (sum.wholeBox && sum.box != null) return t('describe.wholeBox', { box: sum.box });
    return t('describe.vip', { box: sum.box ?? '', seats: sum.seats, count: sum.count });
  }
  if (sum.kind === 'bowl') {
    const stand = sum.stand ? fmt.stand(sum.stand) : '';
    if (sum.block != null && sum.row != null)
      return t('describe.row', { stand, block: sum.block, row: sum.row, seats: sum.seats, count: sum.count });
    if (sum.block != null) return t('describe.block', { stand, block: sum.block, count: sum.count });
  }
  return t('describe.many', { count: sum.count });
}
