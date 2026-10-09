import { exportAll } from '../services/calendarIO';
import type { EventStore } from '../state/store';
import { h } from './dom';

export const NEW_HOST = 'calibridge.lakshpradhwani.com';
const LEGACY_HOSTS = ['events.lakshp.live'];
const DISMISS_KEY = 'calibridge:moved-dismissed';

export const isLegacyHost = (hostname: string): boolean => LEGACY_HOSTS.includes(hostname);

const safe = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string): void => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

/**
 * Browser storage belongs to one origin, so events saved on the old address are not visible on the new
 * one. On the old address, once the new site is reachable, offer a one-click export and a link over.
 * Reachability is probed with an <img> request so the banner never points at a dead site.
 */
export function mountMovedBanner(root: HTMLElement, store: EventStore): void {
  if (!isLegacyHost(location.hostname) || safe.get(DISMISS_KEY)) return;

  const probe = new Image();
  probe.onload = () => {
    const banner = h(
      'div',
      { class: 'moved-banner', role: 'region', 'aria-label': 'Calibridge has moved' },
      h(
        'p',
        null,
        h('strong', { text: 'Calibridge has a new home: ' }),
        h('a', { href: `https://${NEW_HOST}/`, text: NEW_HOST }),
        '. Events are stored per site, so export them here and import them there.',
      ),
      h(
        'div',
        { class: 'moved-actions' },
        h('button', { type: 'button', class: 'btn btn-sm', text: 'Export my events', on: { click: () => exportAll(store) } }),
        h('a', { class: 'btn btn-sm btn-primary', href: `https://${NEW_HOST}/`, text: 'Open new site' }),
        h('button', {
          type: 'button',
          class: 'btn btn-sm btn-ghost',
          text: 'Dismiss',
          on: { click: () => { safe.set(DISMISS_KEY, '1'); banner.remove(); } },
        }),
      ),
    );
    root.prepend(banner);
  };
  probe.src = `https://${NEW_HOST}/favicon.svg`;
}
