import { parseIcs, serializeIcs } from '../core/ics';
import type { EventStore } from '../state/store';
import { toast } from '../ui/toast';
import { datedFilename, downloadText, pickTextFiles } from './files';

export function exportAll(store: EventStore): void {
  const events = store.list();
  if (events.length === 0) {
    toast('There are no events to export yet.', { kind: 'error' });
    return;
  }
  downloadText(datedFilename('calibridge', 'ics'), serializeIcs(events));
  toast(`Exported ${events.length} event${events.length === 1 ? '' : 's'}.`, { kind: 'success' });
}

export async function importFiles(store: EventStore): Promise<void> {
  const files = await pickTextFiles('.ics,text/calendar');
  if (files.length === 0) return;

  const parsed = files.map((f) => parseIcs(f.text));
  const events = parsed.flatMap((p) => p.events);
  const skipped = parsed.reduce((n, p) => n + p.skipped, 0);
  const warnings = [...new Set(parsed.flatMap((p) => p.warnings))];

  if (events.length === 0) {
    toast(skipped > 0 ? 'No importable events found - cancelled or incomplete entries were skipped.' : 'That file does not contain any events.', { kind: 'error' });
    return;
  }

  const { added, updated } = store.upsertMany(events, 'Import');
  const parts = [`${added} added`];
  if (updated > 0) parts.push(`${updated} updated`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  toast(`Imported: ${parts.join(', ')}.`, { kind: 'success', action: { label: 'Undo', run: () => store.undo() }, duration: 9000 });
  for (const w of warnings) toast(w, { duration: 9000 });
}
