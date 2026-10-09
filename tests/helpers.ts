import type { CalEvent } from '../src/core/types';

export function ev(partial: Partial<CalEvent> & Pick<CalEvent, 'start' | 'end'>): CalEvent {
  return {
    id: partial.id ?? 'e1',
    uid: partial.uid ?? `${partial.id ?? 'e1'}@test`,
    title: 'Test',
    location: '',
    description: '',
    category: 'work',
    allDay: false,
    tz: 'America/New_York',
    reminders: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  };
}

/** In-memory Storage double. */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}
