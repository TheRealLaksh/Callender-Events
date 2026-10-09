import { CATEGORIES } from '../core/categories';
import { addDays, dateKey, parseDateKey, startOfDay, weekdayLabels } from '../core/dates';
import { reminderLabel } from '../core/duration';
import { eventSpan } from '../core/occurrences';
import { retargetSeries } from '../core/series';
import type { CalEvent, CategoryId, EventDraft, Occurrence, Recurrence, RecurrenceFreq } from '../core/types';
import { instantToWallString, listTimeZones, localTimeZone, wallStringToInstant } from '../core/tz';
import { newUid, pad2 } from '../core/util';
import type { AppContext, NewEventInit } from './context';
import { h, icon } from './dom';
import { detachOccurrence, excludeOccurrence } from '../state/actions';
import { scopeDialog } from './dialogs';
import { fmtDayShort } from './format';
import { modalHeader, openModal } from './modal';
import { toast } from './toast';
import { notificationState, requestNotifications } from '../services/notifications';

const QUICK_REMINDERS: number[] = [0, 10, 30, 60, 1440];
const MAX_REMINDER_MINUTES = 60 * 24 * 60;
const FREQ_UNITS: Record<RecurrenceFreq, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

interface FormModel {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  tz: string;
  freq: RecurrenceFreq | 'none';
  /** Extra weekdays for weekly repeats (0 = Sunday). The start's own weekday is always included. */
  weekdays: number[];
  interval: number;
  ends: 'never' | 'until' | 'count';
  until: string;
  count: number;
  category: CategoryId;
  reminders: number[];
  location: string;
  description: string;
}

const splitWall = (wall: string): [string, string] => [wall.slice(0, 10), wall.slice(11, 16)];

/** Date + time (as plain wall-clock numbers) shifted by `deltaMs`, returned in the same string form. */
function shiftWall(date: string, time: string, deltaMs: number): [string, string] {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + deltaMs);
  return [`${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`, `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`];
}

const wallMs = (date: string, time: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
};

function modelFromEvent(ev: CalEvent, occ?: Occurrence): FormModel {
  const rec = ev.recurrence;
  const base = {
    title: ev.title,
    allDay: ev.allDay,
    tz: ev.tz,
    freq: rec?.freq ?? ('none' as const),
    weekdays: rec?.weekdays ?? [],
    interval: rec?.interval ?? 1,
    ends: rec?.until ? ('until' as const) : rec?.count ? ('count' as const) : ('never' as const),
    until: rec?.until ?? '',
    count: rec?.count ?? 10,
    category: ev.category,
    reminders: [...ev.reminders],
    location: ev.location,
    description: ev.description,
  };
  // When an occurrence of a repeating event was opened, show that occurrence's date, not the series start.
  if (ev.allDay) {
    const startDate = occ ? dateKey(occ.start) : ev.start;
    const endDate = occ ? dateKey(addDays(occ.end, -1)) : ev.end;
    return { ...base, startDate, startTime: '09:00', endDate, endTime: '10:00' };
  }
  const [startDate, startTime] = splitWall(instantToWallString(occ ? occ.start.getTime() : Date.parse(ev.start), ev.tz));
  const [endDate, endTime] = splitWall(instantToWallString(occ ? occ.end.getTime() : Date.parse(ev.end), ev.tz));
  return { ...base, startDate, startTime, endDate, endTime };
}

function modelFromInit(init: NewEventInit, selected: Date): FormModel {
  const date = startOfDay(init.date ?? selected);
  const now = new Date();
  const allDay = init.minutes === null;
  let minutes = init.minutes ?? null;
  if (minutes === null || minutes === undefined) {
    // Default to the next whole hour when planning for today, otherwise 09:00.
    minutes = dateKey(date) === dateKey(now) ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;
  }
  const duration = init.durationMinutes ?? 60;
  const [startDate, startTime] = [dateKey(date), `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`];
  const [endDate, endTime] = shiftWall(startDate, startTime, duration * 60_000);
  return {
    title: init.title ?? '',
    allDay,
    startDate,
    startTime,
    endDate: allDay ? startDate : endDate,
    endTime,
    tz: localTimeZone(),
    freq: 'none',
    weekdays: [],
    interval: 1,
    ends: 'never',
    until: '',
    count: 10,
    category: 'work',
    reminders: [],
    location: '',
    description: '',
  };
}

export function openEventDialog(
  ctx: AppContext,
  target: { event: CalEvent; occurrence?: Occurrence } | { init: NewEventInit },
): void {
  const editing = 'event' in target ? target.event : null;
  const model: FormModel = 'event' in target ? modelFromEvent(target.event, target.occurrence) : modelFromInit(target.init, ctx.nav.selected);
  // Which occurrence is being edited (the series' first one when opened from search).
  const occurrenceStart: Date | null = !('event' in target)
    ? null
    : target.occurrence
      ? target.occurrence.start
      : (() => { const sp = eventSpan(target.event); return sp ? new Date(sp.startMs) : null; })();
  const occurrenceRef: Pick<Occurrence, 'start' | 'end' | 'allDay'> | null = !('event' in target) || !occurrenceStart
    ? null
    : target.occurrence ?? (() => { const sp = eventSpan(target.event); return sp ? { start: new Date(sp.startMs), end: new Date(sp.endMs), allDay: target.event.allDay } : null; })();
  let dirty = false;
  const touch = () => { dirty = true; };

  const titleId = 'event-dialog-title';
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const showError = (msg: string, field?: HTMLElement) => {
    err.textContent = msg;
    err.hidden = false;
    field?.focus();
  };

  // -- inputs -----------------------------------------------------------------
  const title = h('input', { type: 'text', id: 'ev-title', class: 'input input-title', placeholder: 'Add title', value: model.title, maxlength: '200', autocomplete: 'off', 'aria-required': 'true' });
  const allDay = h('input', { type: 'checkbox', id: 'ev-allday', checked: model.allDay });
  const startDate = h('input', { type: 'date', id: 'ev-start-date', class: 'input', value: model.startDate, required: true });
  const startTime = h('input', { type: 'time', id: 'ev-start-time', class: 'input', value: model.startTime, step: '300', 'aria-label': 'Start time' });
  const endDate = h('input', { type: 'date', id: 'ev-end-date', class: 'input', value: model.endDate, required: true });
  const endTime = h('input', { type: 'time', id: 'ev-end-time', class: 'input', value: model.endTime, step: '300', 'aria-label': 'End time' });

  const zones = listTimeZones();
  if (!zones.includes(model.tz)) zones.unshift(model.tz);
  const tz = h(
    'select',
    { id: 'ev-tz', class: 'input' },
    zones.map((z, i) => h('option', { value: z, selected: z === model.tz, text: i === 0 && z === localTimeZone() ? `${z.replace(/_/g, ' ')} (this device)` : z.replace(/_/g, ' ') })),
  );

  const freq = h(
    'select',
    { id: 'ev-freq', class: 'input' },
    ([['none', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']] as const).map(([v, label]) =>
      h('option', { value: v, text: label, selected: v === model.freq }),
    ),
  );
  const interval = h('input', { type: 'number', id: 'ev-interval', class: 'input input-num', min: '1', max: '99', value: String(model.interval), 'aria-label': 'Repeat every' });
  const intervalUnit = h('span', { class: 'muted' });
  const ends = h(
    'select',
    { id: 'ev-ends', class: 'input', 'aria-label': 'Ends' },
    ([['never', 'Never ends'], ['until', 'Ends on a date'], ['count', 'Ends after a number of times']] as const).map(([v, label]) =>
      h('option', { value: v, text: label, selected: v === model.ends }),
    ),
  );
  const until = h('input', { type: 'date', id: 'ev-until', class: 'input', value: model.until, 'aria-label': 'Repeat until' });
  const count = h('input', { type: 'number', id: 'ev-count', class: 'input input-num', min: '1', max: '999', value: String(model.count), 'aria-label': 'Number of occurrences' });
  const countUnit = h('span', { class: 'muted', text: 'times' });

  let category = model.category;
  const categoryGroup = h(
    'div',
    { class: 'cat-picker', role: 'radiogroup', 'aria-label': 'Category' },
    CATEGORIES.map((c) =>
      h(
        'label',
        { class: `cat-option cat-${c.id}` },
        h('input', { type: 'radio', name: 'ev-category', value: c.id, checked: c.id === category, on: { change: () => { category = c.id; touch(); } } }),
        h('span', { class: 'cat-swatch', 'aria-hidden': 'true' }),
        h('span', { text: c.label }),
      ),
    ),
  );

  const location = h('input', { type: 'text', id: 'ev-location', class: 'input', placeholder: 'Add location', value: model.location, maxlength: '300', autocomplete: 'off' });
  const description = h('textarea', { id: 'ev-notes', class: 'input', rows: '3', placeholder: 'Add notes', maxlength: '5000' });
  description.value = model.description;

  // -- reminders ----------------------------------------------------------------
  let reminders = [...model.reminders];
  const reminderChips = h('div', { class: 'chip-row', 'aria-live': 'polite' });
  const quickRow = h('div', { class: 'chip-row' });
  const customValue = h('input', { type: 'number', class: 'input input-num', min: '1', value: '2', 'aria-label': 'Custom reminder amount' });
  const customUnit = h(
    'select',
    { class: 'input', 'aria-label': 'Custom reminder unit' },
    ([['1', 'minutes'], ['60', 'hours'], ['1440', 'days'], ['10080', 'weeks']] as const).map(([v, label]) => h('option', { value: v, text: label, selected: v === '60' })),
  );

  const renderReminders = () => {
    reminders = [...new Set(reminders)].sort((a, b) => a - b);
    const chips = reminders.map((m) =>
      h(
        'span',
        { class: 'tag' },
        icon('bell', 12),
        reminderLabel(m),
        h(
          'button',
          {
            type: 'button',
            class: 'tag-x',
            'aria-label': `Remove reminder: ${reminderLabel(m)}`,
            on: { click: () => { reminders = reminders.filter((x) => x !== m); touch(); renderReminders(); } },
          },
          icon('x', 12),
        ),
      ),
    );
    reminderChips.replaceChildren(...(chips.length ? chips : [h('span', { class: 'muted small', text: 'No reminders' })]));
    quickRow.replaceChildren(
      ...QUICK_REMINDERS.map((m) =>
        h('button', {
          type: 'button',
          class: 'chip-btn',
          'aria-pressed': String(reminders.includes(m)),
          text: m === 0 ? 'At start' : reminderLabel(m).replace(' before', ''),
          on: { click: () => { reminders = reminders.includes(m) ? reminders.filter((x) => x !== m) : [...reminders, m]; touch(); renderReminders(); } },
        }),
      ),
    );
  };
  const addCustom = () => {
    const minutes = Math.round(Number(customValue.value) * Number(customUnit.value));
    if (!(minutes > 0) || minutes > MAX_REMINDER_MINUTES) {
      showError('Enter a reminder between 1 minute and 60 days.', customValue);
      return;
    }
    err.hidden = true;
    reminders.push(minutes);
    touch();
    renderReminders();
  };

  // -- weekly weekdays ---------------------------------------------------------------
  const chosenWeekdays = new Set<number>(model.weekdays);
  const weekdayRow = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Repeat on' });
  const startWeekday = (): number => {
    const d = parseDateKey(startDate.value);
    return d ? d.getDay() : 0;
  };
  const renderWeekdays = () => {
    const names = weekdayLabels(0, 'short');
    const own = startWeekday();
    weekdayRow.replaceChildren(
      ...names.map((name, day) =>
        h('button', {
          type: 'button',
          class: 'chip-btn',
          text: name,
          disabled: day === own,
          'aria-pressed': String(day === own || chosenWeekdays.has(day)),
          on: {
            click: () => {
              if (chosenWeekdays.has(day)) chosenWeekdays.delete(day);
              else chosenWeekdays.add(day);
              touch();
              renderWeekdays();
            },
          },
        }),
      ),
    );
  };

  // -- behaviour --------------------------------------------------------------------
  const syncVisibility = () => {
    weekdayRow.hidden = freq.value !== 'weekly';
    const timed = !allDay.checked;
    for (const el of [startTime, endTime]) el.hidden = !timed;
    tzField.hidden = !timed;
    const repeating = freq.value !== 'none';
    repeatOptions.hidden = !repeating;
    intervalUnit.textContent = `${FREQ_UNITS[(freq.value === 'none' ? 'daily' : freq.value) as RecurrenceFreq]}${Number(interval.value) === 1 ? '' : 's'}`;
    until.hidden = ends.value !== 'until';
    count.hidden = countUnit.hidden = ends.value !== 'count';
    if (ends.value === 'until' && !until.value) until.value = startDate.value;
  };

  let lastDurationMs = wallMs(model.endDate, model.allDay ? '00:00' : model.endTime) - wallMs(model.startDate, model.allDay ? '00:00' : model.startTime);
  const rememberDuration = () => {
    const ms = wallMs(endDate.value, allDay.checked ? '00:00' : endTime.value) - wallMs(startDate.value, allDay.checked ? '00:00' : startTime.value);
    if (ms >= 0) lastDurationMs = ms;
  };
  // Moving the start moves the end with it, so the duration is kept (as calendar apps do).
  const onStartChange = () => {
    if (!startDate.value) return;
    renderWeekdays();
    const [d, t] = shiftWall(startDate.value, allDay.checked ? '00:00' : startTime.value || '00:00', lastDurationMs);
    endDate.value = d;
    if (!allDay.checked) endTime.value = t;
  };

  startDate.addEventListener('change', onStartChange);
  startTime.addEventListener('change', onStartChange);
  endDate.addEventListener('change', rememberDuration);
  endTime.addEventListener('change', rememberDuration);
  allDay.addEventListener('change', () => { rememberDuration(); syncVisibility(); });
  for (const el of [freq, interval, ends]) el.addEventListener('change', syncVisibility);
  interval.addEventListener('input', syncVisibility);

  const buildDraft = (): EventDraft | null => {
    err.hidden = true;
    const name = title.value.trim();
    if (!name) { showError('Give the event a title.', title); return null; }
    if (!startDate.value || !endDate.value) { showError('Choose a start and end date.', startDate); return null; }
    if (!parseDateKey(startDate.value) || !parseDateKey(endDate.value)) { showError('That date is not valid.', startDate); return null; }

    const timed = !allDay.checked;
    if (timed && (!startTime.value || !endTime.value)) { showError('Choose a start and end time.', startTime); return null; }
    const zone = timed ? tz.value : localTimeZone();

    let start: string;
    let end: string;
    if (timed) {
      const s = wallStringToInstant(`${startDate.value}T${startTime.value}`, zone);
      const e = wallStringToInstant(`${endDate.value}T${endTime.value}`, zone);
      if (Number.isNaN(s) || Number.isNaN(e)) { showError('That date or time is not valid.', startDate); return null; }
      if (e < s) { showError('The event cannot end before it starts.', endDate); return null; }
      start = new Date(s).toISOString();
      end = new Date(e).toISOString();
    } else {
      if (endDate.value < startDate.value) { showError('The event cannot end before it starts.', endDate); return null; }
      start = startDate.value;
      end = endDate.value;
    }

    let recurrence: Recurrence | undefined;
    if (freq.value !== 'none') {
      const n = Math.max(1, Math.min(99, Math.floor(Number(interval.value)) || 1));
      recurrence = { freq: freq.value as RecurrenceFreq, interval: n };
      if (recurrence.freq === 'weekly') {
        const days = new Set([...chosenWeekdays, startWeekday()]);
        if (days.size > 1) recurrence.weekdays = [...days].sort((a, b) => a - b);
      }
      if (ends.value === 'until') {
        if (!until.value || until.value < startDate.value) { showError('Choose an end date on or after the start date.', until); return null; }
        recurrence.until = until.value;
      } else if (ends.value === 'count') {
        const c = Math.floor(Number(count.value));
        if (!(c >= 1)) { showError('Enter how many times the event repeats.', count); return null; }
        recurrence.count = Math.min(999, c);
      }
    }

    return {
      title: name,
      location: location.value.trim(),
      description: description.value.trim(),
      category,
      allDay: !timed,
      start,
      end,
      tz: zone,
      reminders,
      ...(recurrence ? { recurrence } : {}),
    };
  };

  const afterSave = async (draft: EventDraft) => {
    const day = draft.allDay ? parseDateKey(draft.start) : new Date(draft.start);
    if (day) ctx.nav.goTo(day);
    if (draft.reminders.length > 0 && notificationState() === 'default' && !ctx.prefs.get().notificationsAsked) {
      ctx.prefs.set({ notificationsAsked: true });
      toast('Want reminders to pop up on this device?', {
        action: { label: 'Enable', run: () => { void requestNotifications().then((s) => toast(s === 'granted' ? 'Notifications enabled.' : 'Notifications are blocked in your browser settings.', { kind: s === 'granted' ? 'success' : 'error' })); } },
        duration: 10_000,
      });
    }
  };

  const finish = (draft: EventDraft, message: string) => {
    toast(message, { kind: 'success', action: { label: 'Undo', run: () => ctx.store.undo() } });
    modal.close();
    void afterSave(draft);
  };

  const save = () => {
    const draft = buildDraft();
    if (!draft) return;
    if (!editing) {
      ctx.store.add(draft);
      finish(draft, 'Event created');
      return;
    }

    const applyAll = () => {
      // Edits made while viewing a later occurrence retime the series by the same amount.
      const span = editing.recurrence && occurrenceStart ? retargetSeries(editing, occurrenceStart, draft) : { start: draft.start, end: draft.end };
      const moved = span.start !== editing.start || span.end !== editing.end || draft.allDay !== editing.allDay;
      ctx.store.update(editing.id, { ...draft, ...span, recurrence: draft.recurrence, ...(moved ? { exdates: undefined } : {}) });
      finish(draft, editing.recurrence ? 'All events updated' : 'Event updated');
    };
    const applyThis = () => {
      if (!occurrenceRef) return;
      const { recurrence: _r, ...fields } = draft;
      detachOccurrence(ctx.store, editing.id, occurrenceRef, fields, 'Event updated');
      finish(draft, 'Event updated');
    };

    const ruleChanged = JSON.stringify(draft.recurrence ?? null) !== JSON.stringify(editing.recurrence ?? null);
    if (!editing.recurrence || ruleChanged) {
      applyAll();
      return;
    }
    scopeDialog({
      title: 'Edit repeating event',
      message: `This event repeats. Apply your changes to just the occurrence on ${occurrenceStart ? fmtDayShort(occurrenceStart) : 'this day'}, or to every occurrence?`,
      thisLabel: 'This event only',
      allLabel: 'All events',
      onChoose: (scope) => (scope === 'this' ? applyThis() : applyAll()),
    });
  };

  const remove = () => {
    if (!editing) return;
    const done = (message: string) => {
      modal.close();
      toast(message, { action: { label: 'Undo', run: () => ctx.store.undo() } });
    };
    if (!editing.recurrence || !occurrenceRef) {
      ctx.store.remove(editing.id);
      done(`Deleted “${editing.title}”`);
      return;
    }
    scopeDialog({
      title: 'Delete repeating event',
      message: `Delete just the occurrence on ${occurrenceStart ? fmtDayShort(occurrenceStart) : 'this day'}, or every occurrence?`,
      thisLabel: 'This event only',
      allLabel: 'All events',
      danger: true,
      onChoose: (scope) => {
        if (scope === 'this') {
          excludeOccurrence(ctx.store, editing.id, occurrenceRef);
          done('Deleted this occurrence');
        } else {
          ctx.store.remove(editing.id);
          done(`Deleted “${editing.title}”`);
        }
      },
    });
  };

  const fieldRow = (label: string, forId: string, ...controls: Parameters<typeof h>[2][]) =>
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: forId, text: label }), ...controls);

  const tzField = fieldRow('Time zone', 'ev-tz', tz);
  const repeatOptions = h(
    'div',
    { class: 'repeat-opts' },
    h('div', { class: 'inline' }, h('span', { class: 'muted', text: 'Every' }), interval, intervalUnit),
    weekdayRow,
    h('div', { class: 'inline' }, ends, until, count, countUnit),
  );

  const form = h(
    'form',
    { class: 'event-form', novalidate: true, on: { submit: (e) => { e.preventDefault(); save(); }, input: touch, keydown: (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
      else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') { e.preventDefault(); save(); }
    } } },
    modalHeader(editing ? 'Edit event' : 'New event', titleId, () => modal.close()),
    h(
      'div',
      { class: 'modal-body' },
      h('div', { class: 'field' }, h('label', { class: 'sr-only', for: 'ev-title', text: 'Title' }), title),
      h('label', { class: 'switch', for: 'ev-allday' }, allDay, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', { text: 'All day' })),
      h('div', { class: 'when-grid' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ev-start-date', text: 'Starts' }), h('div', { class: 'inline' }, startDate, startTime)),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ev-end-date', text: 'Ends' }), h('div', { class: 'inline' }, endDate, endTime)),
      ),
      tzField,
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'ev-freq', text: 'Repeat' }), freq, repeatOptions),
      h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'ev-cat-label', text: 'Category' }), categoryGroup),
      h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Reminders' }), reminderChips, quickRow,
        h('div', { class: 'inline' }, customValue, customUnit, h('button', { type: 'button', class: 'btn btn-sm', text: 'Add', on: { click: addCustom } }))),
      fieldRow('Location', 'ev-location', location),
      fieldRow('Notes', 'ev-notes', description),
      editing?.recurrence && occurrenceStart
        ? h('p', { class: 'banner' }, icon('repeat', 14), `Repeating event. You are editing the occurrence on ${fmtDayShort(occurrenceStart)}.`)
        : null,
      err,
    ),
    h(
      'footer',
      { class: 'modal-foot' },
      editing
        ? h('div', { class: 'foot-left' },
            h('button', { type: 'button', class: 'btn btn-danger-ghost', on: { click: remove } }, icon('trash', 16), 'Delete'),
            h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => {
              ctx.store.add({ ...editing, id: undefined, uid: newUid(), title: `${editing.title} (copy)` } as EventDraft);
              modal.close();
              toast('Event duplicated', { action: { label: 'Undo', run: () => ctx.store.undo() } });
            } } }, icon('copy', 16), 'Duplicate'),
          )
        : h('span'),
      h('div', { class: 'foot-right' },
        h('button', { type: 'button', class: 'btn', text: 'Cancel', on: { click: () => modal.close() } }),
        h('button', { type: 'submit', class: 'btn btn-primary', text: editing ? 'Save' : 'Create' }),
      ),
    ),
  );

  const modal = openModal(form, {
    labelledBy: titleId,
    className: 'modal-event',
    canDismissOnBackdrop: () => !dirty,
  });

  renderReminders();
  renderWeekdays();
  syncVisibility();
  if (!editing) title.focus();
}
