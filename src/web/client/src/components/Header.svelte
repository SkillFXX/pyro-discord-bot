<script>
  import { dashboardData } from '../stores/data';
  import { logout } from '../stores/auth';
  import { LogOut } from '@lucide/svelte';
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
    <div>
      <button class="btn btn-danger" on:click={logout}>
        <LogOut size={16} />
        <span>Déconnexion</span>
      </button>
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
</style>

