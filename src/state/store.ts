import { normalizeEvent } from '../core/normalize';
import { LEGACY_STORAGE_KEY, migrateLegacy } from '../core/migrate';
import type { CalEvent, EventDraft } from '../core/types';
import { newId, newUid } from '../core/util';

export const STORAGE_KEY = 'calibridge:v2';
const SCHEMA_VERSION = 2;
const HISTORY_LIMIT = 100;

type Listener = () => void;

interface Snapshot {
  events: readonly CalEvent[];
  label: string;
}

export interface UpsertResult {
  added: number;
  updated: number;
}

/**
 * The single source of truth for events. Every mutation snapshots the previous state so
 * it can be undone, persists to storage, and notifies subscribers.
 */
export class EventStore {
  private events: readonly CalEvent[] = [];
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<Listener>();
  /** Set when the last write to storage failed (quota, private mode). */
  persistError: Error | null = null;

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.load();
  }

  // -- reading ------------------------------------------------------------

  list(): readonly CalEvent[] {
    return this.events;
  }

  get(id: string): CalEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // -- writing ------------------------------------------------------------

  add(draft: EventDraft, label = 'Event added'): CalEvent {
    const now = new Date().toISOString();
    const ev: CalEvent = { ...draft, id: draft.id ?? newId(), uid: draft.uid ?? newUid(), createdAt: now, updatedAt: now };
    this.commit([...this.events, ev], label);
    return ev;
  }

  update(id: string, patch: Partial<Omit<CalEvent, 'id'>>, label = 'Event updated'): CalEvent | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next: CalEvent = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
    if (!next.recurrence) delete next.recurrence;
    this.commit(this.events.map((e) => (e.id === id ? next : e)), label);
    return next;
  }

  remove(id: string, label = 'Event deleted'): CalEvent | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    this.commit(this.events.filter((e) => e.id !== id), label);
    return current;
  }

  /** Applies several changes as one undoable step. */
  transact(label: string, change: (events: readonly CalEvent[]) => readonly CalEvent[]): void {
    this.commit(change(this.events), label);
  }

  clear(): number {
    const n = this.events.length;
    if (n > 0) this.commit([], `Deleted ${n} event${n === 1 ? '' : 's'}`);
    return n;
  }

  /** Adds events, replacing any existing event with the same `uid`. One undo step. */
  upsertMany(drafts: readonly (EventDraft & { uid: string })[], label: string): UpsertResult {
    const byUid = new Map<string, CalEvent>(this.events.map((e) => [e.uid, e]));
    const order = [...byUid.keys()];
    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;

    for (const d of drafts) {
      const existing = byUid.get(d.uid);
      if (existing) {
        byUid.set(d.uid, { ...d, id: existing.id, createdAt: existing.createdAt, updatedAt: now });
        updated++;
      } else {
        byUid.set(d.uid, { ...d, id: newId(), createdAt: now, updatedAt: now });
        order.push(d.uid);
        added++;
      }
    }
    if (added + updated > 0) this.commit(order.map((uid) => byUid.get(uid) as CalEvent), label);
    return { added, updated };
  }

  // -- history ------------------------------------------------------------

  undo(): string | null {
    const snap = this.undoStack.pop();
    if (!snap) return null;
    this.redoStack.push({ events: this.events, label: snap.label });
    this.events = snap.events;
    this.persist();
    this.emit();
    return snap.label;
  }

  redo(): string | null {
    const snap = this.redoStack.pop();
    if (!snap) return null;
    this.undoStack.push({ events: this.events, label: snap.label });
    this.events = snap.events;
    this.persist();
    this.emit();
    return snap.label;
  }

  // -- persistence --------------------------------------------------------

  /** Re-reads storage, e.g. after another tab wrote to it. */
  reload(): void {
    this.load();
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  private load(): void {
    const read = (key: string): unknown => {
      try {
        const raw = this.storage?.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    };

    const current = read(STORAGE_KEY) as { events?: unknown[] } | undefined;
    if (current && Array.isArray(current.events)) {
      this.events = current.events.map(normalizeEvent).filter((e): e is CalEvent => e !== null);
      return;
    }

    // First run on v2: bring over v1 data, leaving the old key untouched as a backup.
    const legacy = read(LEGACY_STORAGE_KEY);
    this.events = legacy ? migrateLegacy(legacy) : [];
    if (legacy) this.persist();
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, events: this.events }));
      this.persistError = null;
    } catch (err) {
      this.persistError = err instanceof Error ? err : new Error(String(err));
    }
  }

  private commit(next: readonly CalEvent[], label: string): void {
    this.undoStack.push({ events: this.events, label });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.events = next;
    this.persist();
    this.emit();
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}

function safeStorage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    s.getItem(STORAGE_KEY);
    return s;
  } catch {
    return null;
  }
}
