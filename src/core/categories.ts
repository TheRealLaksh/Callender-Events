import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'work', label: 'Work' },
  { id: 'personal', label: 'Personal' },
  { id: 'health', label: 'Health' },
  { id: 'important', label: 'Important' },
];

export const DEFAULT_CATEGORY: CategoryId = 'work';

export function isCategoryId(value: unknown): value is CategoryId {
  return CATEGORIES.some((c) => c.id === value);
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Maps free text (legacy names, iCalendar CATEGORIES) onto a known category. */
export function categoryFromText(text: string | undefined): CategoryId | undefined {
  if (!text) return undefined;
  const lower = text.trim().toLowerCase();
  return CATEGORIES.find((c) => c.id === lower || c.label.toLowerCase() === lower)?.id;
}
