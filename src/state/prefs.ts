import type { CategoryId, ThemeMode, ViewMode, WeekStart } from '../core/types';

const KEY = 'calibridge:prefs';

export interface Prefs {
  view: ViewMode;
  theme: ThemeMode;
  weekStart: WeekStart;
  hiddenCategories: CategoryId[];
  /** Whether the user has been shown the notification prompt. */
  notificationsAsked: boolean;
}

const DEFAULTS: Prefs = {
  view: 'month',
  theme: 'system',
  weekStart: 0,
  hiddenCategories: [],
  notificationsAsked: false,
};

type Listener = () => void;

export class PrefsStore {
  private value: Prefs = { ...DEFAULTS };
  private listeners = new Set<Listener>();

  constructor(private readonly storage: Storage | null = safeStorage()) {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) this.value = sanitize(JSON.parse(raw));
    } catch {
      /* corrupt prefs fall back to defaults */
    }
  }

  get(): Readonly<Prefs> {
    return this.value;
  }

  set(patch: Partial<Prefs>): void {
    this.value = { ...this.value, ...patch };
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* non-fatal: preferences just will not persist */
    }
    for (const fn of [...this.listeners]) fn();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function sanitize(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    view: r.view === 'week' || r.view === 'agenda' || r.view === 'month' ? r.view : DEFAULTS.view,
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULTS.theme,
    weekStart: r.weekStart === 1 || r.weekStart === 6 || r.weekStart === 0 ? r.weekStart : DEFAULTS.weekStart,
    hiddenCategories: Array.isArray(r.hiddenCategories)
      ? (r.hiddenCategories.filter((c) => ['work', 'personal', 'health', 'important'].includes(c as string)) as CategoryId[])
      : [],
    notificationsAsked: r.notificationsAsked === true,
  };
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
