import { addDays, dateKey, isSameDay, startOfDay } from '../../core/dates';
import { occurrencesOnDay } from '../../core/occurrences';
import type { AppContext } from '../context';
import { clear, h, icon } from '../dom';
import { describeOccurrence, fmtDayLong, fmtMonthYear, fmtWhen } from '../format';

export function renderAgenda(host: HTMLElement, ctx: AppContext): void {
  clear(host);
  const first = new Date(ctx.nav.anchor.getFullYear(), ctx.nav.anchor.getMonth(), 1);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const occs = ctx.occurrences(first, next);
  const today = new Date();

  const groups: HTMLElement[] = [];
  for (let day = first; day < next; day = addDays(day, 1)) {
    const items = occurrencesOnDay(occs, day);
    if (items.length === 0) continue;
    groups.push(
      h(
        'section',
        { class: 'agenda-day', dataset: { date: dateKey(day) } },
        h(
          'h3',
          { class: `agenda-date${isSameDay(day, today) ? ' today' : ''}` },
          h('button', { type: 'button', text: fmtDayLong(day), on: { click: () => ctx.nav.select(day) } }),
          isSameDay(day, today) ? h('span', { class: 'badge', text: 'Today' }) : null,
        ),
        h(
          'ul',
          { class: 'agenda-list' },
          items.map((o) =>
            h(
              'li',
              null,
              h(
                'button',
                {
                  type: 'button',
                  class: `agenda-item cat-${o.event.category}`,
                  'aria-label': describeOccurrence(o),
                  on: { click: () => ctx.openEvent(o.event.id) },
                },
                h('span', { class: 'agenda-when', text: fmtWhen(o, startOfDay(day)) }),
                h('span', { class: 'agenda-bar', 'aria-hidden': 'true' }),
                h(
                  'span',
                  { class: 'agenda-main' },
                  h('span', { class: 'agenda-title', text: o.event.title }),
                  o.event.location ? h('span', { class: 'agenda-sub', text: o.event.location }) : null,
                ),
                o.recurring ? h('span', { class: 'agenda-icon', title: 'Repeats' }, icon('repeat', 14)) : null,
              ),
            ),
          ),
        ),
      ),
    );
  }

  host.append(
    h(
      'div',
      { class: 'agenda' },
      groups.length
        ? groups
        : h(
            'div',
            { class: 'empty empty-large' },
            icon('calendar', 40),
            h('p', { text: `No events in ${fmtMonthYear(first)}.` }),
            h('button', { type: 'button', class: 'btn btn-primary', text: 'Create event', on: { click: () => ctx.newEvent({ date: ctx.nav.selected }) } }),
          ),
    ),
  );
}
