import type { CalEvent } from './types';

export function matchEvents(events: readonly CalEvent[], query: string): CalEvent[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return events.filter((ev) => {
    const hay = `${ev.title}\n${ev.location}\n${ev.description}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
