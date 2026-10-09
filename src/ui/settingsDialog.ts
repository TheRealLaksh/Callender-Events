import type { ThemeMode, WeekStart } from '../core/types';
import { exportAll, importFiles } from '../services/calendarIO';
import { notificationState, requestNotifications } from '../services/notifications';
import type { AppContext } from './context';
import { confirmDialog, shortcutsDialog } from './dialogs';
import { h, icon } from './dom';
import { modalHeader, openModal } from './modal';
import { toast } from './toast';

const THEMES: [ThemeMode, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
const WEEK_STARTS: [WeekStart, string][] = [[0, 'Sunday'], [1, 'Monday'], [6, 'Saturday']];

export function openSettings(ctx: AppContext): void {
  const id = 'settings-title';

  const themeGroup = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Theme' },
    THEMES.map(([value, label]) =>
      h(
        'label',
        null,
        h('input', { type: 'radio', name: 'theme', value, checked: ctx.prefs.get().theme === value, on: { change: () => ctx.prefs.set({ theme: value }) } }),
        h('span', { text: label }),
      ),
    ),
  );

  const weekSelect = h(
    'select',
    { class: 'input', id: 'week-start', on: { change: (e) => ctx.prefs.set({ weekStart: Number((e.target as HTMLSelectElement).value) as WeekStart }) } },
    WEEK_STARTS.map(([v, label]) => h('option', { value: String(v), text: label, selected: ctx.prefs.get().weekStart === v })),
  );

  const notifStatus = h('p', { class: 'muted small' });
  const notifButton = h('button', { type: 'button', class: 'btn', text: 'Enable notifications', on: { click: async () => {
    const state = await requestNotifications();
    renderNotif();
    toast(state === 'granted' ? 'Notifications enabled.' : 'Notifications are blocked. Allow them in your browser’s site settings.', { kind: state === 'granted' ? 'success' : 'error' });
  } } });
  const renderNotif = () => {
    const state = notificationState();
    notifStatus.textContent =
      state === 'granted' ? 'Reminders will appear as notifications while Calibridge is open.'
      : state === 'denied' ? 'Notifications are blocked for this site. Change this in your browser’s site settings.'
      : state === 'unsupported' ? 'This browser does not support notifications. Reminders still appear inside the app.'
      : 'Get a pop-up when a reminder is due. Reminders only fire while Calibridge is open in a tab or installed.';
    notifButton.hidden = state !== 'default';
  };

  const count = ctx.store.list().length;
  const modal = openModal(
    h(
      'div',
      null,
      modalHeader('Settings', id, () => modal.close()),
      h(
        'div',
        { class: 'modal-body settings' },
        section('Appearance', h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Theme' }), themeGroup), h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'week-start', text: 'Week starts on' }), weekSelect)),
        section('Reminders', notifStatus, notifButton),
        section(
          'Your data',
          h('p', { class: 'muted small', text: `${count} event${count === 1 ? '' : 's'} stored on this device.` }),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn', on: { click: () => void importFiles(ctx.store) } }, icon('upload', 16), 'Import .ics'),
            h('button', { type: 'button', class: 'btn', on: { click: () => exportAll(ctx.store) } }, icon('download', 16), 'Export .ics'),
            h('button', { type: 'button', class: 'btn btn-danger-ghost', on: { click: () => {
              if (ctx.store.list().length === 0) { toast('There is nothing to delete.', { kind: 'error' }); return; }
              modal.close();
              confirmDialog({
                title: 'Delete all events?',
                message: `This removes ${ctx.store.list().length} event${ctx.store.list().length === 1 ? '' : 's'} from this device. You can undo it right afterwards.`,
                confirmLabel: 'Delete all',
                danger: true,
                onConfirm: () => {
                  const n = ctx.store.clear();
                  toast(`Deleted ${n} event${n === 1 ? '' : 's'}.`, { action: { label: 'Undo', run: () => ctx.store.undo() } });
                },
              });
            } } }, icon('trash', 16), 'Delete all'),
          ),
        ),
        section(
          'Privacy',
          h('p', { class: 'muted small', text: 'Calibridge has no account and no server. Your events live only in this browser’s storage, and nothing is sent anywhere. Use Export to back them up or move them to another device.' }),
        ),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-ghost', on: { click: () => { modal.close(); shortcutsDialog(); } } }, icon('keyboard', 16), 'Keyboard shortcuts')),
      ),
    ),
    { labelledBy: id },
  );
  renderNotif();
}

function section(title: string, ...children: Parameters<typeof h>[2][]): HTMLElement {
  return h('section', { class: 'settings-section' }, h('h3', { class: 'settings-heading', text: title }), ...children);
}
