import { h, iconButton } from './dom';

export interface Modal {
  dialog: HTMLDialogElement;
  close(): void;
}

export interface ModalOptions {
  /** Accessible name when the dialog has no visible heading element with this id. */
  labelledBy: string;
  className?: string;
  /** Return false to ignore a click on the backdrop (e.g. when a form has unsaved changes). */
  canDismissOnBackdrop?: () => boolean;
  onClose?: () => void;
}

/** Opens `content` in a native modal <dialog> and removes it from the DOM when closed. */
export function openModal(content: HTMLElement, opts: ModalOptions): Modal {
  const dialog = h('dialog', { class: `modal ${opts.className ?? ''}`.trim(), 'aria-labelledby': opts.labelledBy }, content);
  document.body.appendChild(dialog);

  const close = () => {
    if (dialog.open) dialog.close();
  };
  dialog.addEventListener('close', () => {
    dialog.remove();
    opts.onClose?.();
  });
  dialog.addEventListener('mousedown', (e) => {
    if (e.target === dialog && (opts.canDismissOnBackdrop?.() ?? true)) close();
  });

  dialog.showModal();
  return { dialog, close };
}

export function modalHeader(title: string, id: string, close: () => void): HTMLElement {
  return h(
    'header',
    { class: 'modal-head' },
    h('h2', { id, class: 'modal-title', text: title }),
    iconButton('x', 'Close', close),
  );
}
