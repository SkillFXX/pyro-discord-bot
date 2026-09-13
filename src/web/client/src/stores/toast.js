import { writable } from 'svelte/store';

export const toasts = writable([]);

let toastId = 0;

export function showToast(message, type = 'success', duration = 3000) {
  const id = ++toastId;
  toasts.update((all) => [...all, { id, message, type }]);
  setTimeout(() => {
    toasts.update((all) => all.filter((t) => t.id !== id));
  }, duration);
}

