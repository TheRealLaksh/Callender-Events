import { startOfDay } from '../core/dates';
import type { AppContext } from './context';
import { dayPanel } from './dayPanel';
import { h } from './dom';
import { fmtDayLong } from './format';
import { modalHeader, openModal } from './modal';

export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}): void {
  const id = 'confirm-title';
  const modal = openModal(
    h(
      'div',
      { class: 'confirm' },
      h('h2', { id, class: 'modal-title', text: opts.title }),
      h('p', { class: 'muted', text: opts.message }),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { type: 'button', class: 'btn', text: 'Cancel', on: { click: () => modal.close() } }),
        h('button', {
          type: 'button',
          class: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`,
          text: opts.confirmLabel,
          on: { click: () => { modal.close(); opts.onConfirm(); } },
        }),
      ),
    ),
    { labelledBy: id, className: 'modal-sm' },
  );
}

/** Asks which part of a repeating series a change applies to. */
export function scopeDialog(opts: { title: string; message: string; thisLabel: string; allLabel: string; danger?: boolean; onChoose: (scope: 'this' | 'all') => void }): void {
  const id = 'scope-title';
  const choose = (scope: 'this' | 'all') => () => {
    modal.close();
    opts.onChoose(scope);
  };
  const modal = openModal(
    h(
      'div',
      { class: 'confirm' },
      h('h2', { id, class: 'modal-title', text: opts.title }),
      h('p', { class: 'muted', text: opts.message }),
      h(
        'div',
        { class: 'scope-actions' },
        h('button', { type: 'button', class: 'btn', text: opts.thisLabel, on: { click: choose('this') } }),
        h('button', { type: 'button', class: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`, text: opts.allLabel, on: { click: choose('all') } }),
        h('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', on: { click: () => modal.close() } }),
      ),
    ),
    { labelledBy: id, className: 'modal-sm' },
  );
}

/** All events for one day - opened from "+N more" in the month grid. */
export function dayDialog(ctx: AppContext, day: Date): void {
  const id = 'day-title';
  const modal = openModal(
    h(
      'div',
      null,
      modalHeader(fmtDayLong(day), id, () => modal.close()),
      h('div', { class: 'modal-body' }, dayPanel({ ...ctx, openEvent: (eid) => { modal.close(); ctx.openEvent(eid); }, newEvent: (init) => { modal.close(); ctx.newEvent(init); } }, startOfDay(day))),
    ),
    { labelledBy: id, className: 'modal-sm' },
  );
}

/** Each entry is a list of alternative keys, then what they do. */
const SHORTCUTS: [string[], string][] = [
  [['C'], 'Create an event'],
  [['T'], 'Jump to today'],
  [['M', 'W', 'A'], 'Month / week / agenda view'],
  [['J', 'PageDown'], 'Next period'],
  [['K', 'PageUp'], 'Previous period'],
  [['←', '→', '↑', '↓'], 'Move the selected day'],
  [['/'], 'Search'],
  [['Ctrl/⌘ Z'], 'Undo'],
  [['Ctrl/⌘ Shift Z'], 'Redo'],
  [['Ctrl/⌘ Enter'], 'Save the open event'],
  [['?'], 'Show this help'],
];

export function shortcutsDialog(): void {
  const id = 'help-title';
  const modal = openModal(
    h(
      'div',
      null,
      modalHeader('Keyboard shortcuts', id, () => modal.close()),
      h(
        'dl',
        { class: 'shortcuts modal-body' },
        SHORTCUTS.flatMap(([keys, what]) => [
          h('dt', null, keys.flatMap((k, i) => [i > 0 ? ' ' : null, h('kbd', { text: k })])),
          h('dd', { text: what }),
        ]),
      ),
    ),
    { labelledBy: id, className: 'modal-sm' },
  );
}
