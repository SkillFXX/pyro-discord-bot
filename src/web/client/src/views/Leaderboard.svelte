<script>
  import { onMount, onDestroy } from 'svelte';
  import { Trophy, Search, X, Flame, ShieldAlert, Award } from '@lucide/svelte';

  let loading = true;
  let loadingMore = false;
  let error = null;

  let data = {
    enabled: true,
    searchEnabled: true,
    serverName: 'Serveur Discord',
    serverIcon: null,
    botName: 'Pyro Bot',
    botAvatar: '/icon.svg',
    themeColor: '#ef490b',
    totalCount: 0,
    hasMore: false,
    leaderboard: [],
  };

  let topThree = [];
  let searchQuery = '';
  let searchDebounceTimer = null;

  // Color utilities for dynamic theme adaptation
  function hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(239, 73, 11, ${alpha})`;
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      clean = clean.split('').map((c) => c + c).join('');
    }
    if (clean.length !== 6) return `rgba(239, 73, 11, ${alpha})`;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function lightenHex(hex, percent = 25) {
    if (!hex || typeof hex !== 'string') return '#ff7a45';
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      clean = clean.split('').map((c) => c + c).join('');
    }
    if (clean.length !== 6) return '#ff7a45';
    let r = parseInt(clean.substring(0, 2), 16);
    let g = parseInt(clean.substring(2, 4), 16);
    let b = parseInt(clean.substring(4, 6), 16);
    r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
    g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
    b = Math.min(255, Math.floor(b + (255 - g) * (percent / 100)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Reactive theme styles
  $: themeColor = data.themeColor || '#ef490b';
  $: themeLight = lightenHex(themeColor, 35);
  $: themeSubtle = hexToRgba(themeColor, 0.12);
  $: themeBorder = hexToRgba(themeColor, 0.35);
  $: themeGlow = hexToRgba(themeColor, 0.22);
  $: themeHover = lightenHex(themeColor, 12);

  onMount(() => {
    fetchLeaderboard({ reset: true });

    const handleWindowScroll = () => {
      if (loading || loadingMore || !data.hasMore) return;
      const scrollPos = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 350;
      if (scrollPos >= threshold) {
        fetchNextBatch();
      }
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      clearTimeout(searchDebounceTimer);
    };
  });

  async function fetchLeaderboard({ reset = false, query = searchQuery } = {}) {
    if (reset) {
      loading = true;
      error = null;
    }

    try {
      const limit = 10;
      const offset = reset ? 0 : data.leaderboard.length;
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });

      if (query && query.trim()) {
        params.set('search', query.trim());
      }

      const res = await fetch(`/api/public/leaderboard?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Erreur HTTP ${res.status}`);
      }
      const json = await res.json();

      if (reset) {
        data = json;
        // Keep top 3 for podium when not searching
        if (!query.trim() && (json.leaderboard || []).length >= 3) {
          topThree = json.leaderboard.slice(0, 3);
        }
      } else {
        data = {
          ...json,
          leaderboard: [...data.leaderboard, ...(json.leaderboard || [])],
        };
      }
    } catch (err) {
      console.error('Erreur chargement classement :', err);
      if (reset) {
        error = 'Impossible de charger le classement pour le moment. Veuillez réessayer plus tard.';
      }
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function fetchNextBatch() {
    if (loading || loadingMore || !data.hasMore) return;
    loadingMore = true;
    fetchLeaderboard({ reset: false, query: searchQuery });
  }

  function handleSearchInput(e) {
    searchQuery = e.target.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      fetchLeaderboard({ reset: true, query: searchQuery });
    }, 300);
  }

  function handleClearSearch() {
    searchQuery = '';
    clearTimeout(searchDebounceTimer);
    fetchLeaderboard({ reset: true, query: '' });
  }

  // Svelte action for the infinite scroll sentinel element
  function sentinelAction(node) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && data.hasMore) {
          fetchNextBatch();
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      },
    };
  }
</script>

<svelte:head>
  <title>Classement des Niveaux • {data.serverName || 'Pyro Bot'}</title>
</svelte:head>

<div
  class="leaderboard-page"
  style="--primary: {themeColor}; --primary-light: {themeLight}; --primary-subtle: {themeSubtle}; --primary-border: {themeBorder}; --primary-glow: {themeGlow}; --primary-hover: {themeHover};"
>
  <!-- Top Navigation Header -->
  <header class="top-nav">
    <div class="nav-inner">
      <div class="brand">
        {#if data.serverIcon}
          <img src={data.serverIcon} alt={data.serverName} class="server-avatar" />
        {:else}
          <div class="server-avatar-placeholder">
            <Trophy size={20} />
          </div>
        {/if}
        <div class="brand-text">
          <span class="server-title">{data.serverName || 'Serveur Discord'}</span>
          <span class="brand-sub">Classement Officiel</span>
        </div>
      </div>
    </div>
  </header>

  <!-- Hero Header -->
  <section class="hero-section">
    <h1 class="hero-title">
      Classement des <span class="highlight">Niveaux</span>
    </h1>
    <p class="hero-subtitle">
      Découvrez les membres les plus actifs de la communauté, leur niveau et leur progression d'XP en temps réel.
    </p>
  </section>

  <main class="main-content">
    {#if loading}
      <!-- Loading Skeleton -->
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Chargement du classement...</p>
      </div>
    {:else if error}
      <!-- Error Message -->
      <div class="empty-card error-card">
        <ShieldAlert size={48} class="empty-icon text-error" />
        <h3>Erreur de connexion</h3>
        <p>{error}</p>
        <button class="btn btn-primary" on:click={() => fetchLeaderboard({ reset: true })}>Réessayer</button>
      </div>
    {:else if !data.enabled}
      <!-- Disabled State -->
      <div class="empty-card disabled-card">
        <Award size={48} class="empty-icon text-muted" />
        <h3>Classement Indisponible</h3>
        <p>{data.reason || 'Le système de niveau ou le classement public est actuellement désactivé sur ce serveur.'}</p>
      </div>
    {:else}
      <!-- SEARCH BAR (If enabled) -->
      {#if data.searchEnabled}
        <div class="search-container">
          <div class="search-wrapper">
            <Search size={18} class="search-icon" />
            <input
              type="text"
              value={searchQuery}
              on:input={handleSearchInput}
              placeholder="Rechercher un membre par pseudo ou niveau..."
              class="search-input"
            />
            {#if searchQuery}
              <button class="clear-search-btn" on:click={handleClearSearch} aria-label="Effacer la recherche">
                <X size={16} />
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- PODIUM TOP 3 (Shown when no search query and top 3 available) -->
      {#if !searchQuery.trim() && topThree.length >= 3}
        <section class="podium-section" aria-label="Podium des 3 premiers membres">
          <!-- 2nd Place -->
          <div class="podium-col rank-2">
            <div class="podium-avatar-wrapper silver-glow">
              <img src={topThree[1].avatarUrl} alt={topThree[1].displayName} class="podium-avatar" />
              <div class="podium-badge badge-silver">2</div>
            </div>
            <div class="podium-info">
              <span class="podium-name" title={topThree[1].displayName}>{topThree[1].displayName}</span>
              <span class="podium-tag">@{topThree[1].username}</span>
              <div class="podium-level">Niveau {topThree[1].level}</div>
              <div class="podium-xp" title="Total d'XP">{topThree[1].xp.toLocaleString('fr-FR')} XP</div>
            </div>
            <div class="podium-pillar pillar-2">
              <span class="pillar-rank">#2</span>
            </div>
          </div>

          <!-- 1st Place -->
          <div class="podium-col rank-1">
            <div class="crown-icon">👑</div>
            <div class="podium-avatar-wrapper gold-glow">
              <img src={topThree[0].avatarUrl} alt={topThree[0].displayName} class="podium-avatar" />
              <div class="podium-badge badge-gold">1</div>
            </div>
            <div class="podium-info">
              <span class="podium-name" title={topThree[0].displayName}>{topThree[0].displayName}</span>
              <span class="podium-tag">@{topThree[0].username}</span>
              <div class="podium-level gold-text">Niveau {topThree[0].level}</div>
              <div class="podium-xp" title="Total d'XP">{topThree[0].xp.toLocaleString('fr-FR')} XP</div>
            </div>
            <div class="podium-pillar pillar-1">
              <Flame size={20} class="flame-icon" />
              <span class="pillar-rank">#1</span>
            </div>
          </div>

          <!-- 3rd Place -->
          <div class="podium-col rank-3">
            <div class="podium-avatar-wrapper bronze-glow">
              <img src={topThree[2].avatarUrl} alt={topThree[2].displayName} class="podium-avatar" />
              <div class="podium-badge badge-bronze">3</div>
            </div>
            <div class="podium-info">
              <span class="podium-name" title={topThree[2].displayName}>{topThree[2].displayName}</span>
              <span class="podium-tag">@{topThree[2].username}</span>
              <div class="podium-level">Niveau {topThree[2].level}</div>
              <div class="podium-xp" title="Total d'XP">{topThree[2].xp.toLocaleString('fr-FR')} XP</div>
            </div>
            <div class="podium-pillar pillar-3">
              <span class="pillar-rank">#3</span>
            </div>
          </div>
        </section>
      {/if}

      <!-- LEADERBOARD LIST -->
      <section class="list-section">
        <div class="list-header">
          <span class="col-rank">Rang</span>
          <span class="col-member">Membre</span>
          <span class="col-level">Niveau</span>
          <span class="col-progress">Progression</span>
          <span class="col-xp">Expérience (XP)</span>
        </div>

        {#if data.leaderboard.length === 0}
          <div class="empty-search">
            <Search size={36} class="text-muted" />
            <p>
              {#if searchQuery.trim()}
                Aucun membre ne correspond à votre recherche "<strong>{searchQuery}</strong>".
              {:else}
                Aucun membre n'a encore gagné d'XP sur ce serveur.
              {/if}
            </p>
          </div>
        {:else}
          <div class="list-body">
            {#each data.leaderboard as user (user.userId)}
              <div class="user-row" class:top-one={user.rank === 1} class:top-two={user.rank === 2} class:top-three={user.rank === 3}>
                <!-- Rank -->
                <div class="col-rank">
                  {#if user.rank === 1}
                    <span class="rank-badge rank-1-badge">🥇</span>
                  {:else if user.rank === 2}
                    <span class="rank-badge rank-2-badge">🥈</span>
                  {:else if user.rank === 3}
                    <span class="rank-badge rank-3-badge">🥉</span>
                  {:else}
                    <span class="rank-badge rank-default">#{user.rank}</span>
                  {/if}
                </div>

                <!-- Member Avatar & Names -->
                <div class="col-member">
                  <div class="avatar-box">
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      class="member-avatar"
                      loading="lazy"
                      on:error={(e) => (e.currentTarget.src = 'https://cdn.discordapp.com/embed/avatars/0.png')}
                    />
                  </div>
                  <div class="member-names">
                    <span class="member-display-name">{user.displayName}</span>
                    <span class="member-username">@{user.username}</span>
                  </div>
                </div>

                <!-- Level -->
                <div class="col-level">
                  <span class="level-pill">
                    <span class="level-lbl">Niv.</span>
                    <span class="level-num">{user.level}</span>
                  </span>
                </div>

                <!-- XP Progress Bar (with tooltip on hover) -->
                <div class="col-progress">
                  <div class="progress-wrapper has-tooltip">
                    <div class="progress-bar-bg">
                      <div class="progress-bar-fill" style="width: {user.progressPercent}%"></div>
                    </div>
                    <span class="progress-text">{user.progressPercent}%</span>

                    <!-- Tooltip on hover -->
                    <div class="xp-tooltip">
                      <div class="tooltip-header">
                        <Flame size={14} class="tooltip-flame" />
                        <span>Progression Niveau {user.level} &rarr; {user.level + 1}</span>
                      </div>
                      <div class="tooltip-row">
                        <span>XP dans le niveau :</span>
                        <strong>{user.xpInLevel.toLocaleString('fr-FR')} / {user.xpRequiredForNext.toLocaleString('fr-FR')}</strong>
                      </div>
                      <div class="tooltip-row">
                        <span>Total accumulé :</span>
                        <strong class="text-highlight">{user.xp.toLocaleString('fr-FR')} XP</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Total XP Badge -->
                <div class="col-xp">
                  <div class="xp-badge has-tooltip">
                    <Flame size={14} class="tooltip-flame" />
                    <span class="xp-value">{user.xp.toLocaleString('fr-FR')}</span>
                    <span class="xp-unit">XP</span>

                    <!-- Tooltip on hover -->
                    <div class="xp-tooltip">
                      <div class="tooltip-header">
                        <span>Détails de l'Expérience</span>
                      </div>
                      <div class="tooltip-row">
                        <span>Niveau actuel :</span>
                        <strong>{user.level}</strong>
                      </div>
                      <div class="tooltip-row">
                        <span>XP total :</span>
                        <strong class="text-highlight">{user.xp.toLocaleString('fr-FR')}</strong>
                      </div>
                      <div class="tooltip-row">
                        <span>Prochain palier :</span>
                        <span>{user.levelEndXP.toLocaleString('fr-FR')} XP</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <!-- INFINITE SCROLL SENTINEL & STATUS -->
          {#if data.hasMore}
            <div use:sentinelAction class="infinite-scroll-sentinel">
              {#if loadingMore}
                <div class="scroll-spinner"></div>
                <span>Chargement des membres suivants...</span>
              {:else}
                <span class="scroll-hint">Faites défiler pour voir la suite</span>
              {/if}
            </div>
          {:else if data.leaderboard.length > 0}
            <div class="end-of-list">
              <span>Tous les membres ont été affichés ({data.leaderboard.length} / {data.totalCount})</span>
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  </main>

  <!-- Public Footer -->
  <footer class="public-footer">
    <div class="footer-inner">
      <span>{data.serverName || 'Serveur Discord'} • Classement des Niveaux</span>
      <span>Propulsé par <a href="/" class="footer-link">{data.botName || 'Pyro Bot'}</a></span>
    </div>
  </footer>
</div>

<style>
  .leaderboard-page {
    min-height: 100vh;
    background-color: var(--canvas, #090B0F);
    color: var(--text-primary, #F8FAFC);
    display: flex;
    flex-direction: column;
    font-family: inherit;
    position: relative;
    overflow-x: hidden;
  }

  /* TOP NAVIGATION */
  .top-nav {
    background: rgba(15, 18, 25, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border, #1E2536);
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0.85rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .server-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--primary, #FF6B35);
  }

  .server-avatar-placeholder {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--primary-subtle, rgba(255, 107, 53, 0.15));
    color: var(--primary, #FF6B35);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .server-title {
    font-weight: 700;
    font-size: 1rem;
    color: #FFFFFF;
    line-height: 1.2;
  }

  .brand-sub {
    font-size: 0.75rem;
    color: var(--text-secondary, #94A3B8);
  }

  /* HERO SECTION */
  .hero-section {
    text-align: center;
    padding: 3.5rem 1.5rem 2.25rem;
    max-width: 800px;
    margin: 0 auto;
    position: relative;
  }

  .hero-section::before {
    content: '';
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 480px;
    height: 240px;
    background: radial-gradient(circle, var(--primary-glow, rgba(239, 73, 11, 0.2)) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .hero-title {
    font-size: 2.6rem;
    font-weight: 800;
    margin: 0 0 0.85rem;
    letter-spacing: -0.02em;
    color: #FFFFFF;
    position: relative;
    z-index: 1;
  }

  .highlight {
    background: linear-gradient(135deg, var(--primary, #FF6B35) 0%, var(--primary-light, #FFA07A) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .hero-subtitle {
    font-size: 1.05rem;
    color: var(--text-secondary, #94A3B8);
    margin: 0 auto;
    max-width: 600px;
    line-height: 1.55;
    position: relative;
    z-index: 1;
  }

  /* MAIN CONTENT */
  .main-content {
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 0 1.5rem 4rem;
    flex: 1;
    position: relative;
    z-index: 1;
  }

  /* SEARCH BAR */
  .search-container {
    margin-bottom: 2.5rem;
    display: flex;
    justify-content: center;
  }

  .search-wrapper {
    position: relative;
    width: 100%;
    max-width: 580px;
  }

  :global(.search-icon) {
    position: absolute;
    left: 1.15rem;
    top: 50%;
    transform: translateY(-50%);
    color: #64748B;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    background: #111520;
    border: 1px solid #202738;
    border-radius: 9999px;
    padding: 0.85rem 2.85rem;
    font-size: 0.95rem;
    color: #FFFFFF;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--primary, #FF6B35);
    background: #151A27;
    box-shadow: 0 0 0 3px var(--primary-subtle, rgba(239, 73, 11, 0.2));
  }

  .clear-search-btn {
    position: absolute;
    right: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    background: #1E2536;
    border: none;
    color: #94A3B8;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-search-btn:hover {
    color: #FFFFFF;
    background: #2D374E;
  }

  /* PODIUM TOP 3 */
  .podium-section {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 1.5rem;
    margin: 1rem 0 3.5rem;
    padding: 0 1rem;
  }

  .podium-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 200px;
  }

  .podium-avatar-wrapper {
    position: relative;
    border-radius: 50%;
    padding: 4px;
    margin-bottom: 0.85rem;
    transition: transform 0.3s ease;
  }

  .podium-col:hover .podium-avatar-wrapper {
    transform: translateY(-6px);
  }

  .podium-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
    background: #1A202E;
  }

  .rank-1 .podium-avatar {
    width: 90px;
    height: 90px;
  }

  .gold-glow {
    background: linear-gradient(135deg, #F59E0B, #FFD700);
    box-shadow: 0 0 25px rgba(245, 158, 11, 0.45);
  }

  .silver-glow {
    background: linear-gradient(135deg, #94A3B8, #E2E8F0);
    box-shadow: 0 0 20px rgba(148, 163, 184, 0.3);
  }

  .bronze-glow {
    background: linear-gradient(135deg, #B45309, #D97706);
    box-shadow: 0 0 20px rgba(180, 83, 9, 0.3);
  }

  .crown-icon {
    font-size: 1.8rem;
    margin-bottom: -0.5rem;
    z-index: 2;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }

  .podium-badge {
    position: absolute;
    bottom: -4px;
    right: 4px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
    color: #FFFFFF;
    border: 2px solid #0F1219;
  }

  .badge-gold { background: #D97706; }
  .badge-silver { background: #64748B; }
  .badge-bronze { background: #92400E; }

  .podium-info {
    text-align: center;
    margin-bottom: 0.75rem;
  }

  .podium-name {
    display: block;
    font-weight: 700;
    font-size: 0.95rem;
    color: #FFFFFF;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .podium-tag {
    display: block;
    font-size: 0.75rem;
    color: #64748B;
    margin-bottom: 0.25rem;
  }

  .podium-level {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--primary, #FF6B35);
  }

  .gold-text {
    color: #FBBF24;
  }

  .podium-xp {
    font-size: 0.75rem;
    color: #94A3B8;
  }

  .podium-pillar {
    width: 100%;
    border-radius: 12px 12px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    position: relative;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
  }

  .pillar-1 {
    height: 110px;
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.05) 100%);
    border-color: rgba(245, 158, 11, 0.4);
  }

  .pillar-2 {
    height: 80px;
    background: linear-gradient(180deg, rgba(148, 163, 184, 0.18) 0%, rgba(148, 163, 184, 0.05) 100%);
    border-color: rgba(148, 163, 184, 0.35);
  }

  .pillar-3 {
    height: 60px;
    background: linear-gradient(180deg, rgba(180, 83, 9, 0.18) 0%, rgba(180, 83, 9, 0.05) 100%);
    border-color: rgba(180, 83, 9, 0.35);
  }

  .pillar-rank {
    font-weight: 800;
    font-size: 1.25rem;
    opacity: 0.7;
  }

  :global(.flame-icon) {
    color: #F59E0B;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.9); }
  }

  /* LIST SECTION */
  .list-section {
    background: #10141E;
    border: 1px solid #1E2536;
    border-radius: var(--radius-lg, 14px);
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  }

  .list-header {
    display: grid;
    grid-template-columns: 80px 1fr 110px 220px 140px;
    padding: 1rem 1.5rem;
    background: #141926;
    border-bottom: 1px solid #1F2738;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748B;
  }

  .list-body {
    display: flex;
    flex-direction: column;
  }

  .user-row {
    display: grid;
    grid-template-columns: 80px 1fr 110px 220px 140px;
    align-items: center;
    padding: 0.95rem 1.5rem;
    border-bottom: 1px solid #181E2B;
    transition: all 0.2s ease;
  }

  .user-row:last-child {
    border-bottom: none;
  }

  .user-row:hover {
    background: #151A28;
    border-color: var(--primary-border, #262933);
    transform: translateX(2px);
  }

  .top-one {
    background: rgba(245, 158, 11, 0.04);
  }

  .top-one:hover {
    background: rgba(245, 158, 11, 0.08);
  }

  /* COLUMNS */
  .col-rank {
    display: flex;
    align-items: center;
  }

  .rank-badge {
    font-weight: 800;
    font-size: 1.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .rank-default {
    font-size: 0.9rem;
    font-weight: 700;
    color: #64748B;
  }

  .col-member {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }

  .avatar-box {
    position: relative;
    flex-shrink: 0;
  }

  .member-avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    background: #1E2536;
    border: 2px solid transparent;
    transition: transform 0.2s ease;
  }

  .user-row:hover .member-avatar {
    transform: scale(1.08);
  }

  .top-one .member-avatar { border-color: #F59E0B; }
  .top-two .member-avatar { border-color: #94A3B8; }
  .top-three .member-avatar { border-color: #B45309; }

  .member-names {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .member-display-name {
    font-weight: 700;
    font-size: 0.95rem;
    color: #FFFFFF;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-username {
    font-size: 0.78rem;
    color: #64748B;
  }

  .col-level {
    display: flex;
    align-items: center;
  }

  .level-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.65rem;
    background: var(--primary-subtle, rgba(255, 107, 53, 0.12));
    border: 1px solid var(--primary-border, rgba(255, 107, 53, 0.25));
    border-radius: 6px;
  }

  .level-lbl {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--primary, #FF6B35);
    text-transform: uppercase;
  }

  .level-num {
    font-weight: 800;
    font-size: 0.9rem;
    color: #FFFFFF;
  }

  /* PROGRESS BAR & HOVER TOOLTIP */
  .col-progress {
    display: flex;
    align-items: center;
  }

  .progress-wrapper {
    position: relative;
    width: 100%;
    max-width: 190px;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    cursor: help;
  }

  .progress-bar-bg {
    flex: 1;
    height: 8px;
    background: #1E2536;
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary, #FF6B35), var(--primary-light, #FFA07A));
    border-radius: 9999px;
    transition: width 0.4s ease;
  }

  .progress-text {
    font-size: 0.75rem;
    font-weight: 600;
    color: #94A3B8;
    min-width: 32px;
  }

  /* TOTAL XP BADGE */
  .col-xp {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .xp-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.75rem;
    background: #161C2A;
    border: 1px solid #232D42;
    border-radius: 8px;
    cursor: help;
    transition: all 0.2s ease;
  }

  .user-row:hover .xp-badge {
    border-color: var(--primary, #FF6B35);
    background: #1B2335;
  }

  .xp-value {
    font-weight: 700;
    font-size: 0.9rem;
    color: #FFFFFF;
  }

  .xp-unit {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--primary, #FF6B35);
  }

  /* XP ON HOVER TOOLTIP */
  .has-tooltip {
    position: relative;
  }

  .xp-tooltip {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: calc(100% + 10px);
    right: 50%;
    transform: translateX(50%) translateY(4px);
    background: #151924;
    border: 1px solid #2F3950;
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    width: 220px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    z-index: 100;
    pointer-events: none;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .col-xp .xp-tooltip {
    right: 0;
    transform: translateY(4px);
  }

  .has-tooltip:hover .xp-tooltip,
  .has-tooltip:focus .xp-tooltip {
    visibility: visible;
    opacity: 1;
    transform: translateX(50%) translateY(0);
  }

  .col-xp .has-tooltip:hover .xp-tooltip,
  .col-xp .has-tooltip:focus .xp-tooltip {
    transform: translateY(0);
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: #F8FAFC;
    border-bottom: 1px solid #232C40;
    padding-bottom: 0.35rem;
    margin-bottom: 0.45rem;
  }

  :global(.tooltip-flame) {
    color: var(--primary, #FF6B35);
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.74rem;
    color: #94A3B8;
    margin-bottom: 0.25rem;
  }

  .tooltip-row strong {
    color: #E2E8F0;
  }

  .text-highlight {
    color: #38BDF8 !important;
  }

  /* INFINITE SCROLL SENTINEL & STATUS */
  .infinite-scroll-sentinel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.75rem 1rem;
    color: #94A3B8;
    font-size: 0.85rem;
    border-top: 1px solid #181E2B;
    background: #0D111A;
  }

  .scroll-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--primary-subtle, rgba(239, 73, 11, 0.2));
    border-top-color: var(--primary, #FF6B35);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .scroll-hint {
    color: #64748B;
    font-size: 0.8rem;
  }

  .end-of-list {
    text-align: center;
    padding: 1.5rem 1rem;
    color: #64748B;
    font-size: 0.82rem;
    border-top: 1px solid #181E2B;
    background: #0D111A;
  }

  /* EMPTY & LOADING STATES */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5rem 1rem;
    gap: 1rem;
    color: #94A3B8;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--primary-subtle, rgba(239, 73, 11, 0.2));
    border-top-color: var(--primary, #FF6B35);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-card {
    text-align: center;
    padding: 4rem 2rem;
    background: #111520;
    border: 1px solid #1E2536;
    border-radius: var(--radius-lg, 14px);
    max-width: 500px;
    margin: 2rem auto;
  }

  :global(.empty-icon) {
    margin-bottom: 1rem;
  }

  :global(.text-error) { color: #EF4444; }
  :global(.text-muted) { color: #64748B; }

  .empty-card h3 {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
    color: #FFFFFF;
  }

  .empty-card p {
    font-size: 0.9rem;
    color: #94A3B8;
    margin: 0;
  }

  .empty-search {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3.5rem 1rem;
    gap: 0.75rem;
    color: #94A3B8;
    font-size: 0.95rem;
  }

  /* FOOTER */
  .public-footer {
    border-top: 1px solid #181E2B;
    background: #0B0E14;
    padding: 1.5rem;
    margin-top: auto;
  }

  .footer-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #64748B;
  }

  .footer-link {
    color: #94A3B8;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .footer-link:hover {
    color: var(--primary, #FF6B35);
  }

  /* RESPONSIVE */
  @media (max-width: 850px) {
    .list-header {
      grid-template-columns: 60px 1fr 90px 110px;
    }
    .user-row {
      grid-template-columns: 60px 1fr 90px 110px;
    }
    .col-progress {
      display: none;
    }
    .podium-section {
      gap: 0.75rem;
    }
    .podium-col {
      width: 140px;
    }
    .podium-avatar {
      width: 58px;
      height: 58px;
    }
    .rank-1 .podium-avatar {
      width: 72px;
      height: 72px;
    }
  }

  @media (max-width: 600px) {
    .list-header {
      grid-template-columns: 48px 1fr 85px;
    }
    .user-row {
      grid-template-columns: 48px 1fr 85px;
    }
    .col-level {
      display: none;
    }
    .hero-title {
      font-size: 1.85rem;
    }
    .podium-section {
      flex-direction: column;
      align-items: center;
    }
    .podium-col {
      width: 100%;
      max-width: 260px;
    }
    .podium-pillar {
      height: 35px;
      border-radius: 8px;
    }
  }
</style>
