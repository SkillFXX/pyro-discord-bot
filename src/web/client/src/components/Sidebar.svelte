<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Settings, Palette, Shield, Bot, Award, Ticket, Scroll, BarChart2 } from '@lucide/svelte';

  export let currentTab = 'general';
  let activeSection = '';

  const tabs = [
    {
      id: 'general',
      label: 'Général',
      icon: Settings,
      sections: [
        { id: 'general-counter', label: 'Compteur de Membres' },
        { id: 'general-voice', label: 'Salons Vocaux' },
        { id: 'general-messages', label: 'Bienvenue & Départ' },
      ],
    },
    {
      id: 'customization',
      label: 'Personnalisation',
      icon: Palette,
      sections: [
        { id: 'custom-presence', label: 'Présence & Statut' },
        { id: 'custom-embeds', label: 'Embeds & Couleurs' },
      ],
    },
    {
      id: 'moderation',
      label: 'Modération',
      icon: Shield,
      sections: [
        { id: 'mod-add', label: 'Ajouter un Seuil' },
        { id: 'mod-guide', label: 'Guide & Fonctionnement' },
        { id: 'mod-table', label: 'Seuils Actuels' },
      ],
    },
    {
      id: 'automod',
      label: 'Automod',
      icon: Bot,
      sections: [
        { id: 'automod-rules', label: 'Règles Actives' },
      ],
    },
    {
      id: 'levels',
      label: 'Niveaux & XP',
      icon: Award,
      sections: [
        { id: 'levels-xp', label: 'Système XP & Niveaux' },
        { id: 'levels-multipliers', label: "Multiplicateurs d'XP" },
        { id: 'levels-rewards', label: 'Rôles Récompenses' },
        { id: 'levels-autoroles', label: 'Auto-Rôles Arrivée' },
      ],
    },
    {
      id: 'tickets',
      label: 'Tickets',
      icon: Ticket,
      sections: [
        { id: 'tickets-config', label: 'Configuration Salons' },
        { id: 'tickets-deploy', label: "Panneau d'Ouverture" },
      ],
    },
    {
      id: 'logs',
      label: 'Discord Logs',
      icon: Scroll,
      sections: [
        { id: 'logs-channel', label: 'Salon des Logs' },
        { id: 'logs-bot', label: 'Actions du Bot Pyro' },
        { id: 'logs-discord', label: 'Activité Discord' },
      ],
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart2,
      sections: [
        { id: 'analytics-filters', label: 'Période & Filtres' },
        { id: 'analytics-kpis', label: 'Métriques Clés (KPI)' },
        { id: 'analytics-timeline', label: 'Évolution Temporelle' },
        { id: 'analytics-breakdown', label: 'Heures de Pointe & Flux' },
        { id: 'analytics-tables', label: 'Détails & Classements' },
      ],
    },
  ];

  let rafId = null;
  let isManualScroll = false;
  let manualScrollTimeout = null;

  function updateActiveSectionDefault() {
    const currentTabObj = tabs.find((t) => t.id === currentTab);
    if (currentTabObj?.sections?.length) {
      if (!currentTabObj.sections.some((s) => s.id === activeSection)) {
        activeSection = currentTabObj.sections[0].id;
      }
    } else {
      activeSection = '';
    }
  }

  function handleScroll() {
    if (isManualScroll) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(checkActiveSection);
  }

  function checkActiveSection() {
    if (isManualScroll) return;
    const currentTabObj = tabs.find((t) => t.id === currentTab);
    if (!currentTabObj || !currentTabObj.sections?.length) return;

    const sections = currentTabObj.sections;
    const header = document.querySelector('.header-bar');
    const headerHeight = header ? header.offsetHeight : 72;
    const triggerY = headerHeight + 50;

    // Detect if scrolled near bottom of page
    const isAtBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 30;

    if (isAtBottom) {
      activeSection = sections[sections.length - 1].id;
      return;
    }

    // Monotonic scroll check: last section whose top is above trigger line
    let currentActive = sections[0].id;
    for (let i = 0; i < sections.length; i++) {
      const el = document.getElementById(sections[i].id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= triggerY) {
        currentActive = sections[i].id;
      } else {
        break;
      }
    }

    activeSection = currentActive;
  }

  $: if (currentTab) {
    updateActiveSectionDefault();
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        checkActiveSection();
      }, 100);
    }
  }

  function scrollToTarget(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const header = document.querySelector('.header-bar');
    const headerHeight = header ? header.offsetHeight : 72;
    const padding = 24; // 1.5rem
    const targetY = Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerHeight - padding);
    window.scrollTo({
      top: targetY,
      behavior: 'smooth',
    });
  }

  async function handleTabClick(tabId) {
    if (currentTab === tabId) {
      const tabObj = tabs.find((t) => t.id === tabId);
      if (tabObj?.sections?.length) {
        handleSectionClick(tabId, tabObj.sections[0].id);
      }
      return;
    }

    currentTab = tabId;
    const tabObj = tabs.find((t) => t.id === tabId);
    if (tabObj?.sections?.length) {
      activeSection = tabObj.sections[0].id;
    }

    await tick();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function handleSectionClick(tabId, sectionId) {
    const tabChanged = currentTab !== tabId;
    if (tabChanged) {
      currentTab = tabId;
    }
    activeSection = sectionId;
    isManualScroll = true;
    if (manualScrollTimeout) clearTimeout(manualScrollTimeout);

    if (tabChanged) {
      await tick();
    }

    setTimeout(() => {
      scrollToTarget(sectionId);
      manualScrollTimeout = setTimeout(() => {
        isManualScroll = false;
        checkActiveSection();
      }, 700);
    }, 50);
  }

  onMount(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    setTimeout(checkActiveSection, 150);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    }
    if (rafId) cancelAnimationFrame(rafId);
    if (manualScrollTimeout) clearTimeout(manualScrollTimeout);
  });
</script>

<aside class="sidebar">
  <ul class="sidebar-menu">
    {#each tabs as tab}
      <li class="sidebar-item">
        <button
          type="button"
          class="sidebar-btn"
          class:active={currentTab === tab.id}
          on:click={() => handleTabClick(tab.id)}
        >
          <svelte:component this={tab.icon} size={18} class="btn-icon" />
          <span>{tab.label}</span>
        </button>

        {#if tab.sections && tab.sections.length > 0}
          <div class="subsections-wrapper" class:open={currentTab === tab.id}>
            <div class="subsections-inner">
              <ul class="subsections-list">
                {#each tab.sections as section}
                  <li class="subsection-item">
                    <button
                      type="button"
                      class="subsection-btn"
                      class:active={currentTab === tab.id && activeSection === section.id}
                      on:click={() => handleSectionClick(tab.id, section.id)}
                    >
                      {section.label}
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</aside>

<style>
  .sidebar {
    width: 250px;
    flex-shrink: 0;
    padding: 1.5rem 0.5rem 1.5rem 1.5rem;
  }

  .sidebar-menu {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    position: sticky;
    top: 5rem;
  }

  .sidebar-item {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .sidebar-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    box-shadow: none;
    user-select: none;
  }

  .sidebar-btn :global(.btn-icon) {
    color: inherit;
    flex-shrink: 0;
  }

  .sidebar-btn:hover {
    background-color: var(--surface-hover);
    color: var(--text-primary);
  }

  /* Discrete active state (Discord-like, no primary accent background) */
  .sidebar-btn.active {
    background-color: var(--surface-2);
    border-color: var(--border);
    color: var(--text-primary);
    font-weight: 600;
  }

  /* Subsections deployed container with pure CSS accordion animation */
  .subsections-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .subsections-wrapper.open {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .subsections-inner {
    overflow: hidden;
  }

  .subsections-list {
    list-style: none;
    margin: 0.35rem 0 0.45rem 1.4rem;
    padding: 0.15rem 0 0.15rem 0.85rem;
    border-left: 2px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .subsection-item {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .subsection-btn {
    position: relative;
    width: 100%;
    display: block;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 0.84rem;
    font-weight: 400;
    line-height: 1.4;
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: color 0.15s ease, background-color 0.15s ease;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
  }

  .subsection-btn:hover {
    color: var(--text-primary);
    background-color: rgba(255, 255, 255, 0.04);
  }

  /* Active subsection: bright white indicator pill and text */
  .subsection-btn.active {
    color: var(--text-primary);
    font-weight: 600;
  }

  .subsection-btn.active::before {
    content: '';
    position: absolute;
    left: calc(-0.85rem - 2px);
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 16px;
    background-color: var(--text-primary);
    border-radius: 2px;
  }

  @media (max-width: 900px) {
    .sidebar {
      width: 100%;
      padding: 1rem;
    }
    .sidebar-menu {
      flex-direction: column;
      position: static;
    }
    .sidebar-btn {
      width: 100%;
    }
    .subsections-list {
      margin-left: 1.4rem;
    }
  }
</style>


