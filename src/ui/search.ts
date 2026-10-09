import { startOfDay } from '../core/dates';
import { matchEvents } from '../core/search';
import { nextOccurrence } from '../core/occurrences';
import type { CalEvent } from '../core/types';
import type { AppContext } from './context';
import { clear, h, icon } from './dom';
import { fmtDayShort, fmtWhen } from './format';

interface Hit {
  event: CalEvent;
  date: Date;
  when: string;
  past: boolean;
}

const MAX_RESULTS = 8;

export function createSearch(ctx: AppContext): { element: HTMLElement; focus(): void } {
  let hits: Hit[] = [];
  let active = -1;

  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search events',
    autocomplete: 'off',
    spellcheck: 'false',
    role: 'combobox',
    'aria-label': 'Search events',
    'aria-expanded': 'false',
    'aria-controls': 'search-results',
    'aria-autocomplete': 'list',
  });
  const list = h('ul', { class: 'search-results', id: 'search-results', role: 'listbox', hidden: true });

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const choose = (hit: Hit) => {
    close();
    input.value = '';
    input.blur();
    ctx.nav.goTo(hit.date);
    ctx.openEvent(hit.event.id);
  };

  const paint = () => {
    clear(list);
    if (input.value.trim() === '') return close();
    if (hits.length === 0) {
      list.append(h('li', { class: 'search-empty', role: 'presentation', text: 'No matching events' }));
    }
    hits.forEach((hit, i) =>
      list.append(
        h(
          'li',
          {
            id: `search-hit-${i}`,
            role: 'option',
            class: `search-hit cat-${hit.event.category}${i === active ? ' active' : ''}${hit.past ? ' past' : ''}`,
            'aria-selected': String(i === active),
            on: { mousedown: (e) => { e.preventDefault(); choose(hit); }, mousemove: () => { if (active !== i) { active = i; paint(); } } },
          },
          h('span', { class: 'search-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'search-main' }, h('span', { class: 'search-title', text: hit.event.title }), h('span', { class: 'search-sub', text: `${fmtDayShort(hit.date)} · ${hit.when}` })),
        ),
      ),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `search-hit-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };

  const run = () => {
    const today = startOfDay(new Date());
    hits = matchEvents(ctx.store.list(), input.value)
      .map((event): Hit | null => {
        const occ = nextOccurrence(event, today);
        if (occ) return { event, date: occ.start, when: fmtWhen(occ), past: false };
        const first = ctx.store.get(event.id);
        if (!first) return null;
        const d = first.allDay ? new Date(`${first.start}T00:00`) : new Date(first.start);
        return { event, date: d, when: first.allDay ? 'All day' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), past: true };
      })
      .filter((x): x is Hit => x !== null)
      // Upcoming first (soonest first), then past (most recent first).
      .sort((a, b) => (a.past === b.past ? (a.past ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime()) : a.past ? 1 : -1))
      .slice(0, MAX_RESULTS);
    active = hits.length ? 0 : -1;
    paint();
  };

  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (input.value.trim()) run(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (hits.length === 0) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      paint();
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === 'Escape') {
      if (input.value) { input.value = ''; close(); } else input.blur();
      e.stopPropagation();
    }
  });

  const element = h('div', { class: 'search' }, icon('search', 16), input, list);
  return { element, focus: () => { input.focus(); input.select(); } };
}
