import { writable, get } from 'svelte/store';
import { showToast } from './toast';
import { auth } from './auth';

export const dashboardData = writable({
  loading: true,
  guildId: '',
  serverName: '',
  bot: { username: 'Pyro', avatarUrl: '/icon.svg', id: '' },
  channels: { text: [], forums: [], voice: [], categories: [] },
  roles: [],
  members: [],
  config: {},
  autoRoles: [],
  warnActions: [],
  roleRewards: [],
  automodRules: [],
  xpMultipliers: [],
  logConfigKeys: [],
});

function getHeaders() {
  const token = get(auth).csrfToken;
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': token,
  };
}

export async function loadDashboardData() {
  dashboardData.update((d) => ({ ...d, loading: true }));
  try {
    const res = await fetch('/api/dashboard/init', { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      dashboardData.set({
        loading: false,
        guildId: data.guildId || '',
        serverName: data.serverName || '',
        bot: data.bot || { username: 'Pyro', avatarUrl: '/icon.svg', id: '' },
        channels: data.channels || { text: [], forums: [], voice: [], categories: [] },
        roles: data.roles || [],
        members: data.members || [],
        config: data.config || {},
        autoRoles: data.autoRoles || [],
        warnActions: data.warnActions || [],
        roleRewards: data.roleRewards || [],
        automodRules: data.automodRules || [],
        xpMultipliers: data.xpMultipliers || [],
        logConfigKeys: data.logConfigKeys || [],
      });
    } else if (res.status === 401) {
      auth.set({ authenticated: false, loading: false, csrfToken: '', user: null, permissions: null, discordConfigured: false });
      dashboardData.update((d) => ({ ...d, loading: false }));
    } else {
      showToast('Erreur serveur lors de la synchronisation', 'error');
      dashboardData.update((d) => ({ ...d, loading: false }));
    }
  } catch (e) {
    console.error('Error loading dashboard data:', e);
    showToast('Erreur de chargement des données', 'error');
    dashboardData.update((d) => ({ ...d, loading: false }));
  }
}

export async function saveConfig(section, payload) {
  try {
    const res = await fetch(`/api/config/${section}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json().catch(() => ({}));
      dashboardData.update((d) => ({
        ...d,
        config: { ...d.config, ...payload, ...(updated.config || {}) },
      }));
      showToast('Paramètres enregistrés avec succès !', 'success');
      return true;
    } else {
      showToast('Erreur lors de la sauvegarde', 'error');
      return false;
    }
  } catch (e) {
    showToast('Erreur réseau lors de la sauvegarde', 'error');
    return false;
  }
}

// Auto-Roles
export async function addAutoRole(roleId) {
  try {
    const res = await fetch('/api/autorole', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ roleId }),
    });
    if (res.ok) {
      const { autoRoles } = await res.json();
      dashboardData.update((d) => ({ ...d, autoRoles }));
      showToast('Rôle automatique ajouté !');
    }
  } catch (e) {
    showToast('Erreur lors de l\'ajout', 'error');
  }
}

export async function deleteAutoRole(roleId) {
  try {
    const res = await fetch(`/api/autorole/${roleId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      const { autoRoles } = await res.json();
      dashboardData.update((d) => ({ ...d, autoRoles }));
      showToast('Rôle automatique retiré !');
    }
  } catch (e) {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// Warn Actions
export async function addWarnAction({ warnsCount, action, duration }) {
  try {
    const res = await fetch('/api/warnaction', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ warnsCount, action, duration }),
    });
    if (res.ok) {
      const { warnActions } = await res.json();
      dashboardData.update((d) => ({ ...d, warnActions }));
      showToast('Seuil d\'avertissement enregistré !');
    }
  } catch (e) {
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

export async function deleteWarnAction(count) {
  try {
    const res = await fetch(`/api/warnaction/${count}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      const { warnActions } = await res.json();
      dashboardData.update((d) => ({ ...d, warnActions }));
      showToast('Seuil supprimé !');
    }
  } catch (e) {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// Role Rewards
export async function addRoleReward({ level, roleId, replacePreviousRole }) {
  try {
    const res = await fetch('/api/rolereward', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ level, roleId, replacePreviousRole }),
    });
    if (res.ok) {
      const { roleRewards } = await res.json();
      dashboardData.update((d) => ({ ...d, roleRewards }));
      showToast('Récompense de niveau enregistrée !');
    }
  } catch (e) {
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

export async function deleteRoleReward(level) {
  try {
    const res = await fetch(`/api/rolereward/${level}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      const { roleRewards } = await res.json();
      dashboardData.update((d) => ({ ...d, roleRewards }));
      showToast('Récompense supprimée !');
    }
  } catch (e) {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// Automod Rules
export async function addAutomodRule(ruleData) {
  try {
    const res = await fetch('/api/automod', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(ruleData),
    });
    if (res.ok) {
      const { automodRules } = await res.json();
      dashboardData.update((d) => ({ ...d, automodRules }));
      showToast('Règle d\'automodération créée !');
      return true;
    }
  } catch (e) {
    showToast('Erreur lors de la création de la règle', 'error');
    return false;
  }
}

export async function deleteAutomodRule(id) {
  try {
    const res = await fetch(`/api/automod/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      const { automodRules } = await res.json();
      dashboardData.update((d) => ({ ...d, automodRules }));
      showToast('Règle supprimée !');
    }
  } catch (e) {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// XP Multipliers
export async function addXpMultiplier({ channelId, multiplier }) {
  try {
    const res = await fetch('/api/xpmultiplier', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ channelId, multiplier }),
    });
    if (res.ok) {
      const { xpMultipliers } = await res.json();
      dashboardData.update((d) => ({ ...d, xpMultipliers }));
      showToast('Multiplicateur enregistré !');
    }
  } catch (e) {
    showToast('Erreur lors de l\'enregistrement', 'error');
  }
}

export async function deleteXpMultiplier(channelId) {
  try {
    const res = await fetch(`/api/xpmultiplier/${channelId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (res.ok) {
      const { xpMultipliers } = await res.json();
      dashboardData.update((d) => ({ ...d, xpMultipliers }));
      showToast('Multiplicateur retiré !');
    }
  } catch (e) {
    showToast('Erreur lors de la suppression', 'error');
  }
}

// Deploy Ticket Message
export async function deployTicketMessage(channelId) {
  try {
    const res = await fetch('/api/tickets/deploy', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ channel_id: channelId }),
    });
    if (res.ok) {
      showToast('Message de ticket déployé avec succès !', 'success');
      return true;
    } else {
      const err = await res.text();
      showToast(err || 'Erreur lors du déploiement', 'error');
      return false;
    }
  } catch (e) {
    showToast('Erreur réseau lors du déploiement', 'error');
    return false;
  }
}

