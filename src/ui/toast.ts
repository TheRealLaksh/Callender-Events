import { h } from './dom';

export interface ToastOptions {
  kind?: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
  /** Milliseconds before auto-dismiss. */
  duration?: number;
}

let region: HTMLElement | null = null;

function ensureRegion(): HTMLElement {
  if (!region) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(region);
  }
  return region;
}

export function toast(message: string, opts: ToastOptions = {}): void {
  const { kind = 'info', action, duration = action ? 7000 : 4000 } = opts;
  const root = ensureRegion();
  let timer = 0;

  const dismiss = () => {
    window.clearTimeout(timer);
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), 200);
  };
  const arm = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(dismiss, duration);
  };

  const el = h(
    'div',
    { class: `toast toast-${kind}`, on: { mouseenter: () => window.clearTimeout(timer), mouseleave: arm } },
    h('span', { class: 'toast-msg', text: message }),
    action &&
      h('button', {
        type: 'button',
        class: 'toast-action',
        text: action.label,
        on: {
          click: () => {
            action.run();
            dismiss();
          },
        },
      }),
  );
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild?.remove();
  arm();
}
