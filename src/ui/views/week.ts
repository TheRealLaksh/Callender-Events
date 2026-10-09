import { addDays, dateKey, isSameDay, startOfDay, weekDays, weekdayLabels } from '../../core/dates';
import { layoutColumns } from '../../core/layout';
import { occurrencesOnDay } from '../../core/occurrences';
import type { Occurrence } from '../../core/types';
import { clamp } from '../../core/util';
import type { AppContext } from '../context';
import { clear, h } from '../dom';
import { describeOccurrence, fmtDayLong, fmtHour, fmtTime } from '../format';

export const HOUR_HEIGHT = 52;
const SNAP_MINUTES = 15;
const MIN_BLOCK_MINUTES = 24;
const DRAG_THRESHOLD_PX = 5;

/** Scroll position survives re-renders (every store change rebuilds the view). */
let scrollTop: number | null = null;

export function renderWeek(host: HTMLElement, ctx: AppContext): void {
  const prevScroll = host.querySelector<HTMLElement>('.week-scroll');
  if (prevScroll) scrollTop = prevScroll.scrollTop;
  clear(host);

  const { weekStart } = ctx.prefs.get();
  const days = weekDays(ctx.nav.anchor, weekStart);
  const occs = ctx.occurrences(days[0], addDays(days[6], 1));
  const today = new Date();
  const labels = weekdayLabels(weekStart);

  const head = h(
    'div',
    { class: 'week-head' },
    h('div', { class: 'week-gutter' }),
    days.map((day, i) =>
      h(
        'button',
        {
          type: 'button',
          class: ['week-dayhead', isSameDay(day, today) && 'today', isSameDay(day, ctx.nav.selected) && 'selected'].filter(Boolean).join(' '),
          'aria-label': fmtDayLong(day),
          on: { click: () => ctx.nav.select(day) },
        },
        h('span', { class: 'week-dow', text: labels[i] }),
        h('span', { class: 'week-num', text: String(day.getDate()) }),
      ),
    ),
  );

  const allDayRow = h(
    'div',
    { class: 'week-allday' },
    h('div', { class: 'week-gutter', text: 'All day' }),
    days.map((day) => {
      const items = occurrencesOnDay(occs, day).filter((o) => o.allDay);
      return h(
        'div',
        { class: 'week-allday-cell', on: { dblclick: (e) => { if (e.target === e.currentTarget) ctx.newEvent({ date: day }); } } },
        items.map((o) => allDayChip(o, ctx)),
      );
    }),
  );

  const body = h('div', { class: 'week-body' });
  const gutter = h(
    'div',
    { class: 'week-gutter time-labels', 'aria-hidden': 'true' },
    Array.from({ length: 24 }, (_, hr) => h('div', { class: 'time-label', style: { height: `${HOUR_HEIGHT}px` } }, hr === 0 ? '' : fmtHour(hr))),
  );
  body.append(gutter);

  const columns = days.map((day) => timeColumn(day, occs, ctx, today));
  columns.forEach((c) => body.append(c));

  const scroll = h('div', { class: 'week-scroll' }, body);
  scroll.addEventListener('scroll', () => { scrollTop = scroll.scrollTop; }, { passive: true });
  host.append(h('div', { class: 'week' }, h('div', { class: 'week-fixed' }, head, allDayRow), scroll));

  if (scrollTop === null) {
    const hour = days.some((d) => isSameDay(d, today)) ? Math.max(0, today.getHours() - 2) : 7;
    scrollTop = Math.max(0, hour * HOUR_HEIGHT - 10);
  }
  scroll.scrollTop = scrollTop;
}

function allDayChip(o: Occurrence, ctx: AppContext): HTMLElement {
  return h('button', {
    type: 'button',
    class: `chip allday cat-${o.event.category}`,
    title: o.event.title,
    'aria-label': describeOccurrence(o),
    on: { click: () => ctx.openEvent(o.event.id) },
  }, h('span', { class: 'chip-title', text: o.event.title }));
}

function timeColumn(day: Date, occs: Occurrence[], ctx: AppContext, today: Date): HTMLElement {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const timed = occurrencesOnDay(occs, day).filter((o) => !o.allDay);

  const segments = timed.map((o) => {
    const s = Math.max(o.start.getTime(), dayStart);
    const e = Math.min(Math.max(o.end.getTime(), o.start.getTime() + MIN_BLOCK_MINUTES * 60_000), dayEnd);
    const startMin = (s - dayStart) / 60_000;
    // `dayEnd` can be 23 or 25 hours after `dayStart` on DST days; clamp to the visible 24h grid.
    const endMin = Math.min(24 * 60, Math.max(startMin + MIN_BLOCK_MINUTES, (e - dayStart) / 60_000));
    return { o, startMin, endMin };
  });
  const layout = layoutColumns(segments.map((s) => ({ key: s.o.key, start: s.startMin, end: s.endMin })));

  const col = h('div', {
    class: ['week-col', isSameDay(day, today) && 'today', isSameDay(day, ctx.nav.selected) && 'selected'].filter(Boolean).join(' '),
    dataset: { date: dateKey(day) },
    style: { height: `${24 * HOUR_HEIGHT}px` },
    on: {
      click: (e) => {
        if (e.target !== e.currentTarget) return;
        const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
        const minutes = clamp(Math.floor(((y / HOUR_HEIGHT) * 60) / 30) * 30, 0, 23 * 60 + 30);
        ctx.nav.select(day);
        ctx.newEvent({ date: day, minutes, durationMinutes: 60 });
      },
    },
  });

  for (const { o, startMin, endMin } of segments) {
    const place = layout.get(o.key);
    const cols = place?.cols ?? 1;
    const idx = place?.col ?? 0;
    const heightPx = ((endMin - startMin) / 60) * HOUR_HEIGHT;
    const block = h(
      'button',
      {
        type: 'button',
        class: `block cat-${o.event.category}`,
        style: {
          top: `${(startMin / 60) * HOUR_HEIGHT}px`,
          height: `${heightPx - 2}px`,
          left: `calc(${(idx / cols) * 100}% + 1px)`,
          width: `calc(${100 / cols}% - 3px)`,
        },
        title: o.event.title,
        'aria-label': describeOccurrence(o),
      },
      h('span', { class: 'block-title', text: o.event.title }),
      heightPx >= 38 ? h('span', { class: 'block-time', text: `${fmtTime(o.start)} – ${fmtTime(o.end)}` }) : null,
      heightPx >= 62 && o.event.location ? h('span', { class: 'block-time', text: o.event.location }) : null,
    );
    attachDrag(block, o, ctx);
    col.append(block);
  }

  if (isSameDay(day, today)) {
    const mins = today.getHours() * 60 + today.getMinutes();
    col.append(h('div', { class: 'now-line', style: { top: `${(mins / 60) * HOUR_HEIGHT}px` }, 'aria-hidden': 'true' }, h('span', { class: 'now-dot' })));
  }
  return col;
}

/**
 * Pointer-driven drag to move a block between days and times. A press that never moves is a click.
 * Touch input is left to scroll the page; a tap opens the event instead.
 */
function attachDrag(block: HTMLElement, o: Occurrence, ctx: AppContext): void {
  let justDragged = false;

  block.addEventListener('click', (e) => {
    e.stopPropagation();
    if (justDragged) return; // the click that follows a drag must not open the dialog
    ctx.openEvent(o.event.id);
  });

  block.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || down.pointerType === 'touch') return;
    const startX = down.clientX;
    const startY = down.clientY;
    let dragging = false;
    let deltaDays = 0;
    let deltaMinutes = 0;

    const homeCol = block.parentElement as HTMLElement;
    const cols = Array.from(block.closest('.week-body')?.querySelectorAll<HTMLElement>('.week-col') ?? []);
    const homeIndex = cols.indexOf(homeCol);
    const colWidth = homeCol.getBoundingClientRect().width;
    block.setPointerCapture(down.pointerId);

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      block.classList.add('dragging');
      deltaDays = clamp(Math.round(dx / colWidth), -homeIndex, cols.length - 1 - homeIndex);
      deltaMinutes = Math.round(((dy / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
      block.style.transform = `translate(${deltaDays * colWidth}px, ${(deltaMinutes / 60) * HOUR_HEIGHT}px)`;
    };

    const finish = (e: PointerEvent) => {
      block.removeEventListener('pointermove', onMove);
      block.removeEventListener('pointerup', finish);
      block.removeEventListener('pointercancel', finish);
      if (block.hasPointerCapture(e.pointerId)) block.releasePointerCapture(e.pointerId);
      block.classList.remove('dragging');
      block.style.transform = '';
      if (!dragging) return;
      justDragged = true;
      window.setTimeout(() => { justDragged = false; }, 0);
      if (e.type === 'pointerup' && (deltaDays !== 0 || deltaMinutes !== 0)) ctx.moveEvent(o.event.id, deltaDays, deltaMinutes);
    };

    block.addEventListener('pointermove', onMove);
    block.addEventListener('pointerup', finish);
    block.addEventListener('pointercancel', finish);
  });
}
