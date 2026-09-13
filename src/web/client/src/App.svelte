<script>
  import { onMount } from 'svelte';
  import { auth, logout } from './stores/auth';
  import { dashboardData } from './stores/data';
  import { preloader, bootstrapApplication } from './stores/preloader';

  import Toast from './components/Toast.svelte';
  import Header from './components/Header.svelte';
  import Sidebar from './components/Sidebar.svelte';

  import Login from './views/Login.svelte';

  import GeneralTab from './tabs/GeneralTab.svelte';
  import CustomizationTab from './tabs/CustomizationTab.svelte';
  import ModerationTab from './tabs/ModerationTab.svelte';
  import AutomodTab from './tabs/AutomodTab.svelte';
  import LevelsTab from './tabs/LevelsTab.svelte';
  import TicketsTab from './tabs/TicketsTab.svelte';
  import LogsTab from './tabs/LogsTab.svelte';
  import AnalyticsTab from './tabs/AnalyticsTab.svelte';

  let currentTab = 'general';

  onMount(() => {
    bootstrapApplication();
  });
</script>

<Toast />

{#if $preloader.loading}
  <div class="app-loader">
    <video class="loader-media" src="/loader.webm" autoplay loop muted playsinline aria-label="Chargement"></video>
    <p class="loader-text">Chargement...</p>
  </div>
{:else if !$auth.authenticated}
  <Login />
{:else}
  <div class="app-layout">
    <Header serverName={$dashboardData.serverName || 'Serveur Discord'} on:logout={logout} />

    <div class="main-body">
      <Sidebar bind:currentTab />

      <main class="content-area">
        {#if currentTab === 'general'}
          <GeneralTab />
        {:else if currentTab === 'customization'}
          <CustomizationTab />
        {:else if currentTab === 'moderation'}
          <ModerationTab />
        {:else if currentTab === 'automod'}
          <AutomodTab />
        {:else if currentTab === 'levels'}
          <LevelsTab />
        {:else if currentTab === 'tickets'}
          <TicketsTab />
        {:else if currentTab === 'logs'}
          <LogsTab />
        {:else if currentTab === 'analytics'}
          <AnalyticsTab />
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
  .app-loader {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: var(--canvas);
    gap: 1.25rem;
  }

  .loader-media {
    width: 68px;
    height: 68px;
    object-fit: contain;
    border-radius: var(--radius-md);
  }

  .loader-text {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.02em;
    margin: 0;
  }

  .app-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--canvas);
  }

  .main-body {
    display: flex;
    flex: 1;
    width: 100%;
    max-width: var(--container-max-width, 1320px);
    margin: 0 auto;
  }

  .content-area {
    flex: 1;
    padding: 2rem 2.5rem;
    overflow-y: auto;
    min-width: 0;
  }

  @media (max-width: 900px) {
    .main-body {
      flex-direction: column;
    }
    .content-area {
      padding: 1.25rem 1rem;
    }
  }
</style>

