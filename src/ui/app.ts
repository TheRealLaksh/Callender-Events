import { CATEGORIES } from '../core/categories';
import { addMonths, startOfDay, startOfWeek } from '../core/dates';
import { eventSpan, expandEvents } from '../core/occurrences';
import { parseQuickAdd } from '../core/quickparse';
import { reminderLabel } from '../core/duration';
import type { DueReminder } from '../core/reminders';
import type { CategoryId, Occurrence, ViewMode } from '../core/types';
import { exportAll, importFiles } from '../services/calendarIO';
import { ReminderService } from '../services/reminderService';
import { showSystemNotification } from '../services/notifications';
import { detachOccurrence, shiftedSpan } from '../state/actions';
import { EventStore, STORAGE_KEY } from '../state/store';
import { PrefsStore } from '../state/prefs';
import type { AppContext, NewEventInit } from './context';
import { dayPanel } from './dayPanel';
import { dayDialog, shortcutsDialog } from './dialogs';
import { clear, h, icon, iconButton } from './dom';
import { openEventDialog } from './eventDialog';
import { fmtMonthYear, fmtTime, fmtWeekRange } from './format';
import { miniMonth, takePendingMiniFocus } from './miniMonth';
import { mountMovedBanner } from './moved';
import { Nav } from './nav';
import { createSearch } from './search';
import { openSettings } from './settingsDialog';
import { toast } from './toast';
import { renderAgenda } from './views/agenda';
import { renderMonth } from './views/month';
import { renderWeek } from './views/week';

const VIEWS: [ViewMode, string, string][] = [
  ['month', 'Month', 'M'],
  ['week', 'Week', 'W'],
  ['agenda', 'Agenda', 'A'],
];

export function mountApp(root: HTMLElement): void {
  const prefs = new PrefsStore();
  const store = new EventStore();
  const nav = new Nav(prefs);

  const hidden = () => new Set<CategoryId>(prefs.get().hiddenCategories);

  const ctx: AppContext = {
    store,
    prefs,
    nav,
    occurrences(from, to): Occurrence[] {
      const off = hidden();
      return expandEvents(off.size ? store.list().filter((e) => !off.has(e.category)) : store.list(), from, to);
    },
    openEvent(id, occurrence) {
      const event = store.get(id);
      if (event) openEventDialog(ctx, { event, occurrence });
    },
    newEvent(init) {
      openEventDialog(ctx, { init: init ?? {} });
    },
    openDay(day) {
      dayDialog(ctx, day);
    },
    resizeEvent(id, deltaMinutes, occurrence) {
      const ev = store.get(id);
      if (!ev || ev.allDay || deltaMinutes === 0) return;
      const span = eventSpan(ev);
      if (!span) return;
      const startMs = occurrence ? occurrence.start.getTime() : span.startMs;
      const endMs = (occurrence ? occurrence.end.getTime() : span.endMs) + deltaMinutes * 60_000;
      if (endMs <= startMs) return; // an event always keeps a positive length
      const end = new Date(endMs).toISOString();
      if (ev.recurrence && occurrence) {
        detachOccurrence(store, id, occurrence, { start: new Date(startMs).toISOString(), end }, 'Event resized');
      } else {
        store.update(id, { end }, 'Event resized');
      }
      toast('Event resized', { action: { label: 'Undo', run: () => store.undo() } });
    },
    moveEvent(id, deltaDays, deltaMinutes = 0, occurrence) {
      const ev = store.get(id);
      if (!ev) return;
      if (ev.recurrence && occurrence) {
        // Dragging one occurrence of a series moves just that one.
        detachOccurrence(store, id, occurrence, shiftedSpan(occurrence, deltaDays, deltaMinutes), 'Event moved');
      } else {
        const span = eventSpan(ev);
        if (!span) return;
        const own = { start: new Date(span.startMs), end: new Date(span.endMs), allDay: ev.allDay };
        store.update(id, shiftedSpan(own, deltaDays, deltaMinutes), 'Event moved');
      }
      toast('Event moved', { action: { label: 'Undo', run: () => store.undo() } });
    },
  };

  // -- theme ----------------------------------------------------------------
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const effectiveDark = () => (prefs.get().theme === 'system' ? media.matches : prefs.get().theme === 'dark');
  const applyTheme = () => {
    const { theme } = prefs.get();
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  };

  // -- shell ------------------------------------------------------------------
  const search = createSearch(ctx);
  const title = h('h1', { class: 'period', 'aria-live': 'polite' });
  const themeBtn = h('button', { type: 'button', class: 'icon-btn', on: { click: () => prefs.set({ theme: effectiveDark() ? 'light' : 'dark' }) } });
  const viewTabs = h(
    'div',
    { class: 'segmented view-tabs', role: 'group', 'aria-label': 'Calendar view' },
    VIEWS.map(([v, label, key]) =>
      h('button', { type: 'button', class: 'seg', dataset: { view: v }, 'aria-keyshortcuts': key.toLowerCase(), text: label, on: { click: () => nav.setView(v) } }),
    ),
  );

  const sidebarMini = h('div', { class: 'sidebar-mini' });
  const sidebarDay = h('div', { class: 'sidebar-day' });
  const filterList = h(
    'ul',
    { class: 'filters' },
    CATEGORIES.map((c) =>
      h(
        'li',
        null,
        h(
          'label',
          { class: `filter cat-${c.id}` },
          h('input', {
            type: 'checkbox',
            dataset: { cat: c.id },
            checked: !hidden().has(c.id),
            on: {
              change: (e) => {
                const on = (e.target as HTMLInputElement).checked;
                const next = new Set(hidden());
                if (on) next.delete(c.id);
                else next.add(c.id);
                prefs.set({ hiddenCategories: [...next] });
              },
            },
          }),
          h('span', { class: 'filter-box', 'aria-hidden': 'true' }),
          h('span', { text: c.label }),
        ),
      ),
    ),
  );

  const quickInput = h('input', {
    type: 'text',
    class: 'input',
    id: 'quick-add',
    placeholder: 'Quick add: Lunch tomorrow 1pm',
    autocomplete: 'off',
    'aria-label': 'Quick add an event',
  });
  const quickForm = h(
    'form',
    {
      class: 'quick-add',
      on: {
        submit: (e) => {
          e.preventDefault();
          const text = quickInput.value.trim();
          if (!text) return;
          const q = parseQuickAdd(text, nav.selected);
          const init: NewEventInit = {
            title: q.title || text,
            date: q.date,
            minutes: q.minutes !== null ? q.minutes : q.recognised ? null : undefined,
            durationMinutes: q.durationMinutes ?? undefined,
          };
          quickInput.value = '';
          closeSidebar();
          ctx.newEvent(init);
        },
      },
    },
    quickInput,
  );

  const sidebar = h(
    'aside',
    { class: 'sidebar', id: 'sidebar', 'aria-label': 'Sidebar' },
    h('button', { type: 'button', class: 'btn btn-primary btn-create', on: { click: () => { closeSidebar(); ctx.newEvent({ date: nav.selected }); } } }, icon('plus', 18), 'Create event'),
    quickForm,
    sidebarMini,
    sidebarDay,
    h('section', { class: 'sidebar-section' }, h('h2', { class: 'sidebar-heading', text: 'Calendars' }), filterList),
    h(
      'div',
      { class: 'sidebar-foot' },
      h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => void importFiles(store) } }, icon('upload', 14), 'Import'),
      h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => exportAll(store) } }, icon('download', 14), 'Export'),
    ),
  );

  const scrim = h('div', { class: 'scrim', on: { click: () => closeSidebar() } });
  const openSidebar = () => document.body.classList.add('sidebar-open');
  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  const header = h(
    'header',
    { class: 'topbar' },
    iconButton('menu', 'Open menu', openSidebar, 'menu-btn'),
    h('a', { class: 'brand', href: '/', 'aria-label': 'Calibridge' }, h('img', { src: '/favicon.svg', alt: '', width: '28', height: '28' }), h('span', { class: 'brand-name' }, 'Cali', h('b', { text: 'bridge' }))),
    h(
      'div',
      { class: 'nav-group' },
      h('button', { type: 'button', class: 'btn btn-sm', text: 'Today', on: { click: () => nav.today() } }),
      iconButton('chevronLeft', 'Previous', () => nav.step(-1)),
      iconButton('chevronRight', 'Next', () => nav.step(1)),
    ),
    title,
    h('span', { class: 'spacer' }),
    search.element,
    viewTabs,
    themeBtn,
    iconButton('settings', 'Settings', () => openSettings(ctx)),
  );

  const view = h('main', { class: 'view', id: 'view', tabindex: '-1' });
  const fab = h('button', { type: 'button', class: 'fab', 'aria-label': 'Create event', on: { click: () => ctx.newEvent({ date: nav.selected }) } }, icon('plus', 24));

  const shell = h('div', { class: 'app' }, header, h('div', { class: 'layout' }, sidebar, view));
  root.append(shell, scrim, fab);
  mountMovedBanner(shell, store);

  // -- rendering ----------------------------------------------------------------
  const periodTitle = (): string => {
    if (nav.view === 'week') return fmtWeekRange(startOfWeek(nav.anchor, prefs.get().weekStart));
    return fmtMonthYear(nav.anchor);
  };

  let miniAnchor = nav.anchor;
  let miniSyncedMonth = nav.anchor.getFullYear() * 12 + nav.anchor.getMonth();
  const renderMini = () => {
    // Rebuilding destroys the focused button; remember which one it was and focus its replacement.
    const active = document.activeElement as HTMLElement | null;
    const pending = takePendingMiniFocus();
    const focusKey = pending
      ? `[data-date="${pending}"]`
      : active && sidebarMini.contains(active)
        ? active.dataset.date ? `[data-date="${active.dataset.date}"]` : `[aria-label="${active.getAttribute('aria-label')}"]`
        : null;
    clear(sidebarMini);
    sidebarMini.append(miniMonth(ctx, miniAnchor, (dir) => { miniAnchor = addMonths(miniAnchor, dir); renderMini(); }));
    if (focusKey) sidebarMini.querySelector<HTMLElement>(focusKey)?.focus({ preventScroll: true });
  };

  const render = () => {
    const hadFocus = view.contains(document.activeElement);
    const t = periodTitle();
    title.textContent = t;
    document.title = `${t} · Calibridge`;
    viewTabs.querySelectorAll<HTMLElement>('.seg').forEach((b) => {
      const on = b.dataset.view === nav.view;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    view.dataset.view = nav.view;
    if (nav.view === 'month') renderMonth(view, ctx);
    else if (nav.view === 'week') renderWeek(view, ctx);
    else renderAgenda(view, ctx);

    // The mini calendar follows the main view's month, but can then be browsed independently.
    const anchorMonth = nav.anchor.getFullYear() * 12 + nav.anchor.getMonth();
    if (anchorMonth !== miniSyncedMonth) {
      miniSyncedMonth = anchorMonth;
      miniAnchor = nav.anchor;
    }
    renderMini();
    clear(sidebarDay);
    sidebarDay.append(dayPanel(ctx, nav.selected));

    filterList.querySelectorAll<HTMLInputElement>('input[data-cat]').forEach((i) => {
      i.checked = !hidden().has(i.dataset.cat as CategoryId);
    });
    themeBtn.replaceChildren(icon(effectiveDark() ? 'sun' : 'moon'));
    themeBtn.setAttribute('aria-label', effectiveDark() ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.title = themeBtn.getAttribute('aria-label') ?? '';

    // Rebuilding the view destroys the focused element; put focus back on the selected day.
    if (hadFocus) {
      view.querySelector<HTMLElement>('.cell.selected .cell-num, .week-dayhead.selected, .agenda-date button')?.focus({ preventScroll: true });
    }
  };

  let warnedStorage = false;
  store.subscribe(() => {
    if (store.persistError && !warnedStorage) {
      warnedStorage = true;
      toast('Calibridge could not save to this browser (storage may be full or disabled). Export your events to avoid losing them.', { kind: 'error', duration: 15_000 });
    }
    render();
  });
  nav.subscribe(render);
  prefs.subscribe(() => { applyTheme(); render(); });
  media.addEventListener('change', () => { applyTheme(); render(); });

  // Minute tick keeps "today" and the now-line honest without disturbing an active drag.
  window.setInterval(() => {
    if (!document.hidden && !view.querySelector('.dragging')) render();
  }, 60_000);

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) store.reload();
  });

  // -- reminders --------------------------------------------------------------------
  const onDue = (r: DueReminder) => {
    const when = r.allDay ? 'today' : fmtTime(r.start);
    const lead = r.minutesBefore === 0 ? 'starting now' : reminderLabel(r.minutesBefore).replace(' before', ' from now').replace(/^(\d)/, 'in $1');
    const body = r.location ? `${when} · ${r.location}` : when;
    toast(`${r.title} - ${lead}`, { action: { label: 'Open', run: () => { nav.goTo(r.start); ctx.openEvent(r.eventId); } }, duration: 12_000 });
    void showSystemNotification(r.title, `${lead[0].toUpperCase()}${lead.slice(1)} · ${body}`, r.key);
  };
  new ReminderService(store, onDue).start();

  // -- keyboard ---------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const nonTextInputs = ['checkbox', 'radio', 'button', 'submit', 'range'];
    const typing =
      !!t &&
      ((t.tagName === 'INPUT' && !nonTextInputs.includes((t as HTMLInputElement).type)) ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT' ||
        t.isContentEditable);
    const modalOpen = !!document.querySelector('dialog[open]');
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      const label = e.shiftKey ? store.redo() : store.undo();
      toast(label ? `${e.shiftKey ? 'Redid' : 'Undid'}: ${label.toLowerCase()}` : e.shiftKey ? 'Nothing to redo.' : 'Nothing to undo.');
      return;
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      const label = store.redo();
      toast(label ? `Redid: ${label.toLowerCase()}` : 'Nothing to redo.');
      return;
    }
    if (typing || modalOpen || mod || e.altKey) return;

    const key = e.key;
    const arrow: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (key in arrow) {
      e.preventDefault();
      nav.moveSelection(arrow[key]);
      return;
    }
    switch (key.toLowerCase()) {
      case 'c': e.preventDefault(); ctx.newEvent({ date: nav.selected }); break;
      case 't': nav.today(); break;
      case 'm': nav.setView('month'); break;
      case 'w': nav.setView('week'); break;
      case 'a': nav.setView('agenda'); break;
      case 'j': case 'n': case 'pagedown': nav.step(1); break;
      case 'k': case 'p': case 'pageup': nav.step(-1); break;
      case '/': e.preventDefault(); search.focus(); break;
      case '?': shortcutsDialog(); break;
      case 'enter':
        if (t === document.body) ctx.newEvent({ date: nav.selected });
        break;
    }
  });

  applyTheme();
  render();

  const params = new URLSearchParams(location.search);
  if (params.has('new')) {
    history.replaceState(null, '', location.pathname);
    ctx.newEvent({ date: startOfDay(new Date()) });
  }
}
