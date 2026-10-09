import { addDays, dateKey, isSameDay, monthGrid, parseDateKey, weekdayLabels } from '../core/dates';
import { occurrencesOnDay } from '../core/occurrences';
import type { AppContext } from './context';
import { fmtDayLong, fmtMonthYear } from './format';
import { h, iconButton } from './dom';

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** Set when an arrow key moves the date, so the rebuilt grid focuses the new day rather than the old one. */
let pendingFocusDate: string | null = null;
export function takePendingMiniFocus(): string | null {
  const d = pendingFocusDate;
  pendingFocusDate = null;
  return d;
}

/**
 * A compact month for jumping between dates. Dots mark days that have events. `month` is the month shown;
 * the previous/next buttons only change what the mini calendar shows, not the main view.
 */
export function miniMonth(ctx: AppContext, month: Date, onStepMonth: (dir: 1 | -1) => void): HTMLElement {
  const { weekStart } = ctx.prefs.get();
  const days = monthGrid(month, weekStart);
  const shownMonth = month.getMonth();
  const occs = ctx.occurrences(days[0], addDays(days[41], 1));
  const today = new Date();

  // Roving tabindex: one tab stop for the whole grid, on the selected day if it is in this month.
  const selected = ctx.nav.selected;
  const tabStop = selected.getMonth() === shownMonth && selected.getFullYear() === month.getFullYear()
    ? dateKey(selected)
    : dateKey(new Date(month.getFullYear(), shownMonth, 1));

  return h(
    'section',
    { class: 'mini', 'aria-label': 'Jump to date' },
    h(
      'div',
      { class: 'mini-head' },
      h('h2', { class: 'mini-title', text: fmtMonthYear(month) }),
      h('div', null, iconButton('chevronLeft', 'Previous month', () => onStepMonth(-1)), iconButton('chevronRight', 'Next month', () => onStepMonth(1))),
    ),
    h(
      'div',
      {
        class: 'mini-grid',
        on: {
          keydown: (e) => {
            const step = ARROWS[e.key];
            const from = parseDateKey((e.target as HTMLElement).dataset.date ?? '');
            if (step === undefined || !from) return;
            e.preventDefault();
            e.stopPropagation(); // the global handler would also move the selection
            const target = addDays(from, step);
            pendingFocusDate = dateKey(target);
            ctx.nav.goTo(target);
          },
        },
      },
      weekdayLabels(weekStart, 'narrow').map((d) => h('span', { class: 'mini-dow', 'aria-hidden': 'true', text: d })),
      days.map((day) => {
        const count = occurrencesOnDay(occs, day).length;
        const key = dateKey(day);
        return h('button', {
          type: 'button',
          class: [
            'mini-day',
            day.getMonth() !== shownMonth && 'outside',
            isSameDay(day, today) && 'today',
            isSameDay(day, selected) && 'selected',
            count > 0 && 'busy',
          ].filter(Boolean).join(' '),
          text: String(day.getDate()),
          dataset: { date: key },
          tabindex: key === tabStop ? '0' : '-1',
          'aria-label': `${fmtDayLong(day)}${count ? `, ${count} event${count === 1 ? '' : 's'}` : ''}`,
          'aria-current': isSameDay(day, today) ? 'date' : null,
          'aria-pressed': String(isSameDay(day, selected)),
          on: { click: () => ctx.nav.goTo(day) },
        });
      }),
    ),
  );
}
