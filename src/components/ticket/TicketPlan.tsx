/** The "your block" picture: the stadium plan with the ticket's block (or skybox) highlighted. */
import { blockById, getLayout, type SeatLabel } from '@/lib/stadium';
import { StadiumPlan, type BlockTone } from '../plan/StadiumPlan';

export function TicketPlan({ label, title }: { label: SeatLabel; title: string }) {
  const L = getLayout();
  const block = label.kind === 'bowl' ? (blockById(label.block)?.index ?? -1) : -1;
  const tones = L.blocks.map((b): BlockTone => (b.index === block ? 'highlight' : 'neutral'));
  return (
    <div className="absolute inset-0 grid place-items-center bg-paper-2 p-2">
      <StadiumPlan
        tones={tones}
        highlightBox={label.kind === 'vip' ? label.box : undefined}
        className="h-full w-auto max-w-full"
        title={title}
      />
    </div>
  );
}
