import { isSameDay } from '../core/dates';
import { addDays, startOfDay } from '../core/dates';
import { occurrencesOnDay } from '../core/occurrences';
import type { AppContext } from './context';
import { h, icon } from './dom';
import { describeOccurrence, fmtDayLong, fmtOtherZone, fmtWhen } from './format';

/** The list of events for one day, used in the sidebar, under the month grid and in the "more" dialog. */
export function dayPanel(ctx: AppContext, day: Date): HTMLElement {
  const start = startOfDay(day);
  const occs = occurrencesOnDay(ctx.occurrences(start, addDays(start, 1)), start);
  const isToday = isSameDay(start, new Date());

  const list = occs.length
    ? h(
        'ul',
        { class: 'day-list' },
        occs.map((o) =>
          h(
            'li',
            null,
            h(
              'button',
              {
                type: 'button',
                class: `day-item cat-${o.event.category}`,
                'aria-label': describeOccurrence(o),
                on: { click: () => ctx.openEvent(o.event.id, o) },
              },
              h('span', { class: 'day-item-bar', 'aria-hidden': 'true' }),
              h(
                'span',
                { class: 'day-item-body' },
                h('span', { class: 'day-item-title', text: o.event.title }),
                h('span', { class: 'day-item-meta' }, fmtWhen(o, start), o.recurring ? icon('repeat', 12) : null),
                fmtOtherZone(o) ? h('span', { class: 'day-item-meta', title: 'Time in the event\'s own time zone', text: fmtOtherZone(o) ?? '' }) : null,
                o.event.location ? h('span', { class: 'day-item-meta', text: o.event.location }) : null,
              ),
            ),
          ),
        ),
      )
    : h(
        'div',
        { class: 'empty' },
        h('p', { text: 'Nothing planned.' }),
        h('button', {
          type: 'button',
          class: 'btn btn-ghost',
          text: 'Add an event',
          on: { click: () => ctx.newEvent({ date: start }) },
        }),
      );

  return h(
    'section',
    { class: 'day-panel', 'aria-label': `Events on ${fmtDayLong(start)}` },
    h(
      'header',
      { class: 'day-panel-head' },
      h(
        'div',
        null,
        h('h2', { class: 'day-panel-title', text: fmtDayLong(start) }),
        isToday ? h('span', { class: 'badge', text: 'Today' }) : null,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Add event on ${fmtDayLong(start)}`,
          title: 'Add event',
          on: { click: () => ctx.newEvent({ date: start }) },
        },
        icon('plus'),
      ),
    ),
    list,
  );
}
