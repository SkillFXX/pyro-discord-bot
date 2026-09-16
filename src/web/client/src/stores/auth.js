import { writable, get } from 'svelte/store';

export const auth = writable({
  authenticated: false,
  loading: true,
  csrfToken: '',
  user: null,
  permissions: null,
  discordConfigured: false,
});

export async function checkAuth() {
  try {
    const res = await fetch('/api/auth/status', { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      auth.set({
        authenticated: Boolean(data.authenticated),
        loading: false,
        csrfToken: data.csrfToken || '',
        user: data.user || null,
        permissions: data.permissions || null,
        discordConfigured: Boolean(data.discordConfigured),
      });
      return data.authenticated;
    } else {
      auth.set({ authenticated: false, loading: false, csrfToken: '', user: null, permissions: null, discordConfigured: false });
      return false;
    }
  } catch (e) {
    auth.set({ authenticated: false, loading: false, csrfToken: '', user: null, permissions: null, discordConfigured: false });
    return false;
  }
}

export async function logout() {
  const currentToken = get(auth).csrfToken;
  const headers = {};
  if (currentToken) {
    headers['x-csrf-token'] = currentToken;
  }
  await fetch('/api/logout', { method: 'POST', headers }).catch(() => {});
  auth.set({ authenticated: false, loading: false, csrfToken: '', user: null, permissions: null, discordConfigured: false });
  window.location.href = '/login';
}
