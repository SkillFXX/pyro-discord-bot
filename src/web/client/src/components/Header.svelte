<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { dashboardData } from '../stores/data';
  import { auth, logout } from '../stores/auth';
  import { LogOut, ShieldCheck, Eye, ChevronDown } from '@lucide/svelte';

  const dispatch = createEventDispatcher();
  let dropdownOpen = false;
  let profileContainer;

  function toggleDropdown(e) {
    e.stopPropagation();
    dropdownOpen = !dropdownOpen;
  }

  function handleLogout() {
    dropdownOpen = false;
    dispatch('logout');
    logout();
  }

  function handleClickOutside(e) {
    if (dropdownOpen && profileContainer && !profileContainer.contains(e.target)) {
      dropdownOpen = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && dropdownOpen) {
      dropdownOpen = false;
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

<header class="header-bar">
  <div class="container header-container">
    <div class="logo-container">
      <img src="/icon.svg" alt="Pyro Logo" class="logo-icon" />
      <div class="header-title">
        <h1>Pyro Dashboard</h1>
        {#if $dashboardData.serverName}
          <p>Serveur connecté : <strong>{$dashboardData.serverName}</strong> ({$dashboardData.guildId})</p>
        {:else}
          <p>Panneau d'administration</p>
        {/if}
      </div>
    </div>

    <div class="user-actions">
      {#if $auth.user}
        <div class="profile-dropdown-wrapper" bind:this={profileContainer}>
          <button
            type="button"
            class="user-profile-btn"
            class:active={dropdownOpen}
            on:click={toggleDropdown}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            title="Menu utilisateur"
          >
            {#if $auth.user.avatar}
              <img src={$auth.user.avatar} alt={$auth.user.username} class="user-avatar" />
            {:else}
              <div class="user-avatar user-avatar-placeholder">
                {$auth.user.username ? $auth.user.username.charAt(0).toUpperCase() : 'U'}
              </div>
            {/if}
            <div class="user-info">
              <span class="user-name">{$auth.user.username}</span>
              {#if $auth.permissions?.isAdmin}
                <span class="role-badge badge-admin">
                  <ShieldCheck size={12} style="vertical-align: middle; margin-right: 2px;" />
                  Admin
                </span>
              {:else if $auth.permissions?.canViewAuditLog}
                <span class="role-badge badge-auditor">
                  <Eye size={12} style="vertical-align: middle; margin-right: 2px;" />
                  Auditeur
                </span>
              {/if}
            </div>
            <ChevronDown size={14} class="chevron-icon {dropdownOpen ? 'rotated' : ''}" />
          </button>

          {#if dropdownOpen}
            <div class="dropdown-menu">
              <div class="dropdown-user-summary">
                <span class="summary-name">{$auth.user.tag || $auth.user.username}</span>
                <span class="summary-status">
                  {#if $auth.permissions?.isAdmin}
                    Administrateur
                  {:else if $auth.permissions?.canViewAuditLog}
                    Auditeur (Logs & KPI)
                  {:else}
                    Membre
                  {/if}
                </span>
              </div>
              <div class="dropdown-divider"></div>
              <button type="button" class="dropdown-item btn-dropdown-logout" on:click={handleLogout}>
                <LogOut size={15} />
                <span>Déconnexion</span>
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .header-bar {
    background-color: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0.85rem 1.75rem;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: var(--container-max-width, 1320px);
    margin: 0 auto;
    width: 100%;
  }

  .logo-container {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .logo-icon {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-sm);
    object-fit: contain;
    flex-shrink: 0;
  }

  .header-title h1 {
    font-family: var(--font-title);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .header-title p {
    font-family: var(--font-body);
    font-size: 0.78rem;
    font-weight: 400;
    color: var(--text-secondary);
    margin: 0.15rem 0 0 0;
  }

  .header-title p strong {
    color: var(--text-primary);
  }

  .user-actions {
    display: flex;
    align-items: center;
  }

  .profile-dropdown-wrapper {
    position: relative;
  }

  .user-profile-btn {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.35rem 0.65rem 0.35rem 0.45rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    cursor: pointer;
    color: var(--text-primary);
    font-family: inherit;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    outline: none;
    user-select: none;
  }

  .user-profile-btn:hover,
  .user-profile-btn.active {
    background-color: var(--surface-hover);
    border-color: rgba(255, 255, 255, 0.16);
  }

  .user-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    object-fit: cover;
  }

  .user-avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--primary);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.85rem;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-right: 0.15rem;
  }

  .user-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .role-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
  }

  .badge-admin {
    background: rgba(239, 73, 11, 0.15);
    color: var(--primary);
    border: 1px solid rgba(239, 73, 11, 0.3);
  }

  .badge-auditor {
    background: rgba(88, 101, 242, 0.15);
    color: #5865F2;
    border: 1px solid rgba(88, 101, 242, 0.3);
  }

  :global(.chevron-icon) {
    color: var(--text-secondary);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    margin-right: 0.15rem;
    flex-shrink: 0;
  }

  :global(.chevron-icon.rotated) {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background-color: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.4rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: dropdownFade 0.12s ease-out;
  }

  @keyframes dropdownFade {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-user-summary {
    padding: 0.45rem 0.65rem 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .summary-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary-status {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .dropdown-divider {
    height: 1px;
    background-color: var(--border);
    margin: 0.35rem 0;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.5rem 0.65rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.12s ease, color 0.12s ease;
    text-align: left;
    user-select: none;
  }

  .btn-dropdown-logout {
    color: var(--danger);
  }

  .btn-dropdown-logout:hover {
    background-color: var(--danger-subtle);
    color: var(--danger);
  }

  @media (max-width: 640px) {
    .user-info {
      display: none;
    }
  }
</style>
