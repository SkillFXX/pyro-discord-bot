import { writable, get } from 'svelte/store';

export const auth = writable({
  authenticated: false,
  loading: true,
  csrfToken: '',
});

export async function checkAuth() {
  try {
    const res = await fetch('/api/auth/status', { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      auth.set({
        authenticated: data.authenticated,
        loading: false,
        csrfToken: data.csrfToken || '',
      });
      return data.authenticated;
    } else {
      auth.set({ authenticated: false, loading: false, csrfToken: '' });
      return false;
    }
  } catch (e) {
    auth.set({ authenticated: false, loading: false, csrfToken: '' });
    return false;
  }
}

export async function login(token) {
  const currentToken = get(auth).csrfToken;
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) {
    headers['x-csrf-token'] = currentToken;
  }

  const res = await fetch('/api/login', {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
  if (res.ok) {
    const data = await res.json();
    auth.set({ authenticated: true, loading: false, csrfToken: data.csrfToken || currentToken });
    return { success: true };
  } else {
    const err = await res.json().catch(() => ({ error: 'Erreur de connexion' }));
    return { success: false, error: err.error || 'Token invalide' };
  }
}

export async function logout() {
  const currentToken = get(auth).csrfToken;
  const headers = {};
  if (currentToken) {
    headers['x-csrf-token'] = currentToken;
  }
  await fetch('/api/logout', { method: 'POST', headers }).catch(() => {});
  auth.set({ authenticated: false, loading: false, csrfToken: '' });
}
