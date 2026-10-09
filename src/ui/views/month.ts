import { addDays, dateKey, diffDays, isSameDay, monthGrid, startOfDay, weekdayLabels } from '../../core/dates';
import { occurrencesOnDay } from '../../core/occurrences';
import type { Occurrence } from '../../core/types';
import type { AppContext } from '../context';
import { dayPanel } from '../dayPanel';
import { clear, h, icon } from '../dom';
import { describeOccurrence, fmtDayLong, fmtTime } from '../format';

let observer: ResizeObserver | null = null;
const CHIP_HEIGHT = 22; // 20px chip + 2px gap
const MORE_HEIGHT = 18;

interface Drag {
  eventId: string;
  fromDay: Date;
}
let drag: Drag | null = null;

export function renderMonth(host: HTMLElement, ctx: AppContext): void {
  observer?.disconnect();
  clear(host);

  const { weekStart } = ctx.prefs.get();
  const days = monthGrid(ctx.nav.anchor, weekStart);
  const month = ctx.nav.anchor.getMonth();
  const occs = ctx.occurrences(days[0], addDays(days[41], 1));
  const today = new Date();

  const head = h(
    'div',
    { class: 'month-head', role: 'row' },
    weekdayLabels(weekStart).map((label) => h('div', { class: 'month-dow', role: 'columnheader', text: label })),
  );

  const cells = days.map((day) => {
    const dayOccs = occurrencesOnDay(occs, day);
    const key = dateKey(day);
    const isToday = isSameDay(day, today);
    const isSelected = isSameDay(day, ctx.nav.selected);
    const label = `${fmtDayLong(day)}${dayOccs.length ? `, ${dayOccs.length} event${dayOccs.length === 1 ? '' : 's'}` : ''}`;

    const cell = h(
      'div',
      {
        class: ['cell', day.getMonth() !== month && 'outside', isToday && 'today', isSelected && 'selected'].filter(Boolean).join(' '),
        role: 'gridcell',
        'aria-selected': String(isSelected),
        dataset: { date: key },
        on: {
          click: () => ctx.nav.select(day),
          dblclick: (e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('chips')) ctx.newEvent({ date: day });
          },
          dragover: (e) => {
            if (!drag) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            (e.currentTarget as HTMLElement).classList.add('drop');
          },
          dragleave: (e) => (e.currentTarget as HTMLElement).classList.remove('drop'),
          drop: (e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).classList.remove('drop');
            if (!drag) return;
            const delta = diffDays(drag.fromDay, day);
            if (delta !== 0) ctx.moveEvent(drag.eventId, delta);
            drag = null;
          },
        },
      },
      h(
        'div',
        { class: 'cell-head' },
        h('button', {
          type: 'button',
          class: 'cell-num',
          text: String(day.getDate()),
          'aria-label': label,
          'aria-current': isToday ? 'date' : null,
          on: { click: (e) => { e.stopPropagation(); ctx.nav.select(day); } },
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'cell-add',
            'aria-label': `Add event on ${fmtDayLong(day)}`,
            title: 'Add event',
            tabindex: '-1',
            on: { click: (e) => { e.stopPropagation(); ctx.newEvent({ date: day }); } },
          },
          icon('plus', 14),
        ),
      ),
      h('div', { class: 'chips' }, dayOccs.map((o) => chip(o, day, ctx))),
      h('button', {
        type: 'button',
        class: 'more',
        hidden: true,
        on: { click: (e) => { e.stopPropagation(); ctx.openDay(day); } },
      }),
      dayOccs.length
        ? h(
            'div',
            { class: 'dots', 'aria-hidden': 'true' },
            dayOccs.slice(0, 4).map((o) => h('span', { class: `dot cat-${o.event.category}` })),
          )
        : null,
    );
    return cell;
  });

  const grid = h('div', { class: 'month-grid', role: 'grid', 'aria-label': 'Month' }, cells);
  host.append(h('div', { class: 'month' }, head, grid), h('div', { class: 'month-day-panel' }, dayPanel(ctx, ctx.nav.selected)));

  const fit = () => cells.forEach(fitCell);
  observer = new ResizeObserver(fit);
  observer.observe(grid);
  requestAnimationFrame(fit);
}

function chip(o: Occurrence, day: Date, ctx: AppContext): HTMLElement {
  const startsToday = isSameDay(o.start, day);
  const showTime = !o.allDay && startsToday;
  return h(
    'button',
    {
      type: 'button',
      class: `chip cat-${o.event.category}${startsToday ? '' : ' cont'}${o.allDay ? ' allday' : ''}`,
      draggable: true,
      'aria-label': describeOccurrence(o),
      title: o.event.title,
      on: {
        click: (e) => { e.stopPropagation(); ctx.openEvent(o.event.id); },
        dragstart: (e) => {
          drag = { eventId: o.event.id, fromDay: startOfDay(day) };
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', o.event.title);
          }
        },
        dragend: () => { drag = null; },
      },
    },
    showTime ? h('span', { class: 'chip-time', text: fmtTime(o.start).replace(/\s?(AM|PM)$/i, (m) => m.trim().toLowerCase().slice(0, 1)) }) : null,
    h('span', { class: 'chip-title', text: o.event.title }),
  );
}

/** Shows as many chips as the cell has room for, then a "+N more" button. */
function fitCell(cell: HTMLElement): void {
  const chips = Array.from(cell.querySelectorAll<HTMLElement>('.chip'));
  const more = cell.querySelector<HTMLElement>('.more');
  const head = cell.querySelector<HTMLElement>('.cell-head');
  if (!more || !head) return;

  chips.forEach((c) => (c.hidden = false));
  more.hidden = true;
  const available = cell.clientHeight - head.offsetHeight - 10;
  if (chips.length * CHIP_HEIGHT <= available) return;

  const capacity = Math.max(0, Math.floor((available - MORE_HEIGHT) / CHIP_HEIGHT));
  chips.forEach((c, i) => (c.hidden = i >= capacity));
  more.textContent = `+${chips.length - capacity} more`;
  more.hidden = false;
}
