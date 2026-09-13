<script>
  import { onMount, onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';
  import {
    BarChart2,
    Calendar,
    Hash,
    Shield,
    User,
    Filter,
    Download,
    MessageSquare,
    Mic,
    FileText,
    Users,
    UserPlus,
    Clock,
    TrendingUp,
    Sun,
    UserCheck,
    Award,
    MessagesSquare,
    Volume2,
    LogIn,
  } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import DataTable from '../components/DataTable.svelte';
  import { dashboardData } from '../stores/data';

  // Filters
  let range = '7d';
  let startDate = '';
  let endDate = '';
  let channelId = 'all';
  let roleId = 'all';
  let userId = 'all';

  // Subtab
  let activeSubtab = 'members';

  // KPI Data
  let kpi = {
    totalMessages: 0,
    totalWords: 0,
    avgWordsPerMessage: 0,
    formattedVoiceTime: '0s',
    totalVoiceHours: 0,
    avgMessageLength: 0,
    totalActiveMembers: 0,
    joinsCount: 0,
    leavesCount: 0,
    netGrowth: 0,
    peakHourIndex: '-',
    peakHourText: 'Chargement...',
  };

  // Table Data
  let topMembers = [];
  let topRoles = [];
  let topForums = [];
  let topTextChannels = [];
  let topVoiceChannels = [];
  let memberEvents = [];

  // Chart instances
  let timelineChartCanvas;
  let peakHoursChartCanvas;
  let memberFlowChartCanvas;

  let timelineChartInst = null;
  let peakHoursChartInst = null;
  let memberFlowChartInst = null;

  let loading = false;

  const chartDarkDefaults = {
    color: '#94a3b8',
    font: { family: 'Figtree, -apple-system, sans-serif' },
    grid: { color: '#262933' },
  };

  function buildParams() {
    const p = new URLSearchParams();
    p.set('range', range);
    if (channelId && channelId !== 'all') p.set('channelId', channelId);
    if (roleId && roleId !== 'all') p.set('roleId', roleId);
    if (userId && userId !== 'all') p.set('userId', userId);
    if (range === 'custom') {
      if (startDate) p.set('startDate', startDate);
      if (endDate) p.set('endDate', endDate);
    }
    return p;
  }

  function handleExportCsv() {
    const p = buildParams();
    window.location.href = `/api/analytics/export?${p.toString()}`;
  }

  async function fetchAnalytics() {
    loading = true;
    try {
      const p = buildParams();
      const res = await fetch(`/api/analytics?${p.toString()}`);
      if (!res.ok) throw new Error('Erreur API Analytics');
      const data = await res.json();

      kpi = data.kpi || kpi;
      topMembers = data.topMembers || [];
      topRoles = data.topRoles || [];
      topForums = data.topForums || [];
      topTextChannels = data.topTextChannels || [];
      topVoiceChannels = data.topVoiceChannels || [];
      memberEvents = data.memberEvents || [];

      // Update charts
      renderTimeline(data.timeline || []);
      renderPeakHours(data.peakHours || []);
      renderMemberFlow(data.timeline || []);
    } catch (e) {
      console.error('Analytics error:', e);
    } finally {
      loading = false;
    }
  }

  function renderTimeline(timeline) {
    if (!timelineChartCanvas) return;
    if (timelineChartInst) timelineChartInst.destroy();

    const labels = timeline.map((t) => t.label);
    const messagesData = timeline.map((t) => t.messages);
    const voiceData = timeline.map((t) => t.voiceMinutes);

    timelineChartInst = new Chart(timelineChartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Messages',
            data: messagesData,
            backgroundColor: 'rgba(239, 73, 11, 0.65)',
            borderColor: '#ef490b',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'yMessages',
          },
          {
            label: 'Minutes Vocales',
            data: voiceData,
            type: 'line',
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.15)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            yAxisID: 'yVoice',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: chartDarkDefaults.color } },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                ctx.datasetIndex === 0
                  ? `💬 Messages : ${ctx.raw.toLocaleString()}`
                  : `🎙️ Vocal : ${ctx.raw.toLocaleString()} min (${(ctx.raw / 60).toFixed(1)}h)`,
            },
          },
        },
        scales: {
          x: { grid: chartDarkDefaults.grid, ticks: { color: chartDarkDefaults.color } },
          yMessages: {
            type: 'linear',
            position: 'left',
            grid: chartDarkDefaults.grid,
            ticks: { color: chartDarkDefaults.color, precision: 0 },
            title: { display: true, text: 'Messages', color: '#ef490b' },
          },
          yVoice: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: chartDarkDefaults.color, precision: 0 },
            title: { display: true, text: 'Minutes Vocales', color: '#3498db' },
          },
        },
      },
    });
  }

  function renderPeakHours(peakHours) {
    if (!peakHoursChartCanvas) return;
    if (peakHoursChartInst) peakHoursChartInst.destroy();

    const labels = peakHours.map((h) => `${h.hour}h`);
    const messagesData = peakHours.map((h) => h.messages);
    const voiceData = peakHours.map((h) => h.voiceMinutes);

    peakHoursChartInst = new Chart(peakHoursChartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Messages',
            data: messagesData,
            backgroundColor: 'rgba(239, 73, 11, 0.75)',
            borderRadius: 3,
          },
          {
            label: 'Minutes Vocales',
            data: voiceData,
            backgroundColor: 'rgba(241, 196, 15, 0.75)',
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: chartDarkDefaults.color } } },
        scales: {
          x: { grid: chartDarkDefaults.grid, ticks: { color: chartDarkDefaults.color } },
          y: { grid: chartDarkDefaults.grid, ticks: { color: chartDarkDefaults.color, precision: 0 } },
        },
      },
    });
  }

  function renderMemberFlow(timeline) {
    if (!memberFlowChartCanvas) return;
    if (memberFlowChartInst) memberFlowChartInst.destroy();

    const labels = timeline.map((t) => t.label);
    const joinsData = timeline.map((t) => t.joins);
    const leavesData = timeline.map((t) => t.leaves);

    memberFlowChartInst = new Chart(memberFlowChartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Arrivées (+)',
            data: joinsData,
            backgroundColor: 'rgba(46, 204, 113, 0.8)',
            borderRadius: 3,
          },
          {
            label: 'Départs (-)',
            data: leavesData,
            backgroundColor: 'rgba(231, 76, 60, 0.8)',
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: chartDarkDefaults.color } } },
        scales: {
          x: { grid: chartDarkDefaults.grid, ticks: { color: chartDarkDefaults.color } },
          y: { grid: chartDarkDefaults.grid, ticks: { color: chartDarkDefaults.color, precision: 0 } },
        },
      },
    });
  }

  onMount(() => {
    fetchAnalytics();
  });

  onDestroy(() => {
    if (timelineChartInst) timelineChartInst.destroy();
    if (peakHoursChartInst) peakHoursChartInst.destroy();
    if (memberFlowChartInst) memberFlowChartInst.destroy();
  });
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><BarChart2 size={24} class="title-icon" /> Analytics & Statistiques Avancées</h2>
      <p class="section-desc">
        Suivi en temps réel des messages, salons vocaux, membres actifs, trafic forum et tendances du serveur.
      </p>
    </div>
  </div>

  <!-- Filters Toolbar -->
  <div id="analytics-filters" class="filter-toolbar">
    <div class="filter-row">
      <!-- Range Preset -->
      <div class="filter-group">
        <label for="ana_range"><Calendar size={14} style="vertical-align:middle;" /> Période</label>
        <select id="ana_range" bind:value={range} on:change={() => range !== 'custom' && fetchAnalytics()}>
          <option value="today">Dernières 24 heures</option>
          <option value="7d">7 derniers jours</option>
          <option value="14d">14 derniers jours</option>
          <option value="30d">30 derniers jours</option>
          <option value="90d">90 derniers jours</option>
          <option value="all">Tout l'historique</option>
          <option value="custom">Période personnalisée...</option>
        </select>
      </div>

      {#if range === 'custom'}
        <div class="filter-group">
          <label for="ana_start">Date début</label>
          <input id="ana_start" type="date" bind:value={startDate} />
        </div>
        <div class="filter-group">
          <label for="ana_end">Date fin</label>
          <input id="ana_end" type="date" bind:value={endDate} />
        </div>
      {/if}

      <!-- Channel Filter -->
      <div class="filter-group">
        <label for="ana_chan"><Hash size={14} style="vertical-align:middle;" /> Salon</label>
        <select id="ana_chan" bind:value={channelId}>
          <option value="all">Tous les salons</option>
          {#if $dashboardData.channels.forums && $dashboardData.channels.forums.length > 0}
            <optgroup label="📑 Salons Forums">
              {#each $dashboardData.channels.forums as f}
                <option value={f.id}>📑 {f.name}</option>
              {/each}
            </optgroup>
          {/if}
          <optgroup label="💬 Salons Textuels">
            {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
              <option value={c.id}># {c.name}</option>
            {/each}
          </optgroup>
          <optgroup label="🔊 Salons Vocaux">
            {#each $dashboardData.channels.voice as v}
              <option value={v.id}>🔊 {v.name}</option>
            {/each}
          </optgroup>
        </select>
      </div>

      <!-- Role Filter -->
      <div class="filter-group">
        <label for="ana_role"><Shield size={14} style="vertical-align:middle;" /> Rôle</label>
        <select id="ana_role" bind:value={roleId}>
          <option value="all">Tous les rôles</option>
          {#each $dashboardData.roles as r}
            <option value={r.id}>@{r.name}</option>
          {/each}
        </select>
      </div>

      <!-- User Filter -->
      <div class="filter-group">
        <label for="ana_user"><User size={14} style="vertical-align:middle;" /> Membre</label>
        <select id="ana_user" bind:value={userId}>
          <option value="all">Tous les membres</option>
          {#each $dashboardData.members as m}
            <option value={m.id}>{m.name} ({m.tag})</option>
          {/each}
        </select>
      </div>

      <!-- Actions -->
      <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
        <button type="button" class="btn btn-primary" on:click={fetchAnalytics} disabled={loading}>
          <Filter size={15} style="vertical-align:middle; margin-right: 4px;" />
          {loading ? 'Chargement...' : 'Filtrer'}
        </button>
        <button type="button" class="btn btn-secondary" on:click={handleExportCsv} title="Télécharger le rapport CSV">
          <Download size={15} style="vertical-align:middle; margin-right: 4px;" />
          CSV
        </button>
      </div>
    </div>
  </div>

  <!-- KPI Grid: The Number is the Hero -->
  <div id="analytics-kpis" class="analytics-kpi-grid">
    <div class="analytics-kpi-card">
      <div class="kpi-header">
        <span>Messages Émis</span>
        <MessageSquare size={16} />
      </div>
      <div class="kpi-value">{Number(kpi.totalMessages || 0).toLocaleString('fr-FR')}</div>
      <div class="kpi-sub">
        <span class="num-shape">{Number(kpi.totalWords || 0).toLocaleString('fr-FR')} mots</span>
        <span class="num-shape">{kpi.avgWordsPerMessage || 0} mots/msg</span>
      </div>
    </div>

    <div class="analytics-kpi-card">
      <div class="kpi-header">
        <span>Temps Vocal Total</span>
        <Mic size={16} />
      </div>
      <div class="kpi-value">{kpi.formattedVoiceTime || '0s'}</div>
      <div class="kpi-sub">
        <span class="num-shape">{kpi.totalVoiceHours || 0}h</span>
        <span>au total</span>
      </div>
    </div>

    <div class="analytics-kpi-card">
      <div class="kpi-header">
        <span>Longueur Moyenne</span>
        <FileText size={16} />
      </div>
      <div class="kpi-value">
        {kpi.avgMessageLength || 0}
        <span style="font-size: 1.1rem; font-weight: 600; color: var(--text-muted);">car.</span>
      </div>
      <div class="kpi-sub">Moyenne par message</div>
    </div>

    <div class="analytics-kpi-card">
      <div class="kpi-header">
        <span>Membres Actifs</span>
        <Users size={16} />
      </div>
      <div class="kpi-value">{Number(kpi.totalActiveMembers || 0).toLocaleString('fr-FR')}</div>
      <div class="kpi-sub">Actifs en texte ou vocal</div>
    </div>

    <div class="analytics-kpi-card">
      <div class="kpi-header">
        <span>Flux de Membres</span>
        <UserPlus size={16} />
      </div>
      <div class="kpi-value" style="display:flex; align-items:baseline; gap: 0.4rem;">
        <span style="color:var(--success);">+{kpi.joinsCount || 0}</span>
        <span style="font-size:1.4rem; color:var(--text-muted); font-weight:400;">/</span>
        <span style="color:var(--danger); font-size:2.2rem;">-{kpi.leavesCount || 0}</span>
      </div>
      <div class="kpi-sub">
        <span class="num-shape num-shape-accent">Net : {kpi.netGrowth > 0 ? `+${kpi.netGrowth}` : kpi.netGrowth}</span>
      </div>
    </div>

    <div class="analytics-kpi-card">
      <div class="kpi-header">
        <span>Heure de Pointe</span>
        <Clock size={16} />
      </div>
      <div class="kpi-value">
        {kpi.peakHourIndex !== undefined && kpi.peakHourIndex !== '-' ? `${kpi.peakHourIndex}h00` : '-'}
      </div>
      <div class="kpi-sub">{kpi.peakHourText || 'Pas assez de données'}</div>
    </div>
  </div>

  <!-- Timeline Chart -->
  <div id="analytics-timeline" class="chart-card">
    <div class="chart-card-header">
      <div style="display:flex; align-items:center; gap: 8px;">
        <TrendingUp size={18} style="color:var(--primary);" />
        <strong>Évolution Temporelle de l'Activité</strong>
      </div>
      <small style="color:var(--text-muted);">Messages & Minutes Vocales</small>
    </div>
    <div style="height: 300px; position: relative;">
      <canvas bind:this={timelineChartCanvas}></canvas>
    </div>
  </div>

  <!-- 2-Column Grid -->
  <div id="analytics-breakdown" class="charts-grid-2">
    <div class="chart-card" style="margin-bottom:0;">
      <div class="chart-card-header">
        <div style="display:flex; align-items:center; gap: 8px;">
          <Sun size={18} style="color:var(--warning);" />
          <strong>Heures de Pointe (0h - 23h)</strong>
        </div>
      </div>
      <div style="height: 260px; position: relative;">
        <canvas bind:this={peakHoursChartCanvas}></canvas>
      </div>
    </div>

    <div class="chart-card" style="margin-bottom:0;">
      <div class="chart-card-header">
        <div style="display:flex; align-items:center; gap: 8px;">
          <UserCheck size={18} style="color:var(--success);" />
          <strong>Flux Membres (Arrivées vs Départs)</strong>
        </div>
      </div>
      <div style="height: 260px; position: relative;">
        <canvas bind:this={memberFlowChartCanvas}></canvas>
      </div>
    </div>
  </div>

  <!-- Deep Dive Subtabs -->
  <div id="analytics-tables" style="margin-top: 2rem;">
    <div class="table-subtabs">
      <button
        type="button"
        class="subtab-btn"
        class:active={activeSubtab === 'members'}
        on:click={() => (activeSubtab = 'members')}
      >
        <Award size={16} /> Top Membres
      </button>
      <button
        type="button"
        class="subtab-btn"
        class:active={activeSubtab === 'roles'}
        on:click={() => (activeSubtab = 'roles')}
      >
        <Shield size={16} /> Activité par Rôle
      </button>
      <button
        type="button"
        class="subtab-btn"
        class:active={activeSubtab === 'channels'}
        on:click={() => (activeSubtab = 'channels')}
      >
        <MessagesSquare size={16} /> Salons & Forums
      </button>
      <button
        type="button"
        class="subtab-btn"
        class:active={activeSubtab === 'flow'}
        on:click={() => (activeSubtab = 'flow')}
      >
        <LogIn size={16} /> Journal Arrivées / Départs
      </button>
    </div>

    <!-- Panel: Top Membres -->
    {#if activeSubtab === 'members'}
      <div class="table-card">
        <DataTable
          headers={['Rang', 'Membre', 'Rôles', 'Messages', 'Temps Vocal', 'Longueur Moy.']}
          items={topMembers}
          emptyMessage="Aucune activité enregistrée sur cette période."
        >
          <tr slot="row" let:item let:index>
            <td>
              <span class="rank-badge {index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : ''}">
                {index + 1}
              </span>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap: 8px;">
                <img
                  class="table-avatar"
                  src={item.avatarUrl || '/icon.svg'}
                  alt=""
                  on:error={(e) => (e.currentTarget.src = '/icon.svg')}
                />
                <div>
                  <strong>{item.displayName}</strong>
                  <small style="opacity:0.6; display:block;">@{item.username}</small>
                </div>
              </div>
            </td>
            <td>
              {#if item.roles && item.roles.length > 0}
                <div style="display:flex; flex-wrap:wrap; gap: 4px;">
                  {#each item.roles.slice(0, 3) as r}
                    <span class="role-pill" style="border-color:{r.color}; color:{r.color};">
                      @{r.name}
                    </span>
                  {/each}
                </div>
              {:else}
                <small style="opacity:0.5;">Aucun</small>
              {/if}
            </td>
            <td><span class="num-shape num-shape-accent">{item.messagesCount.toLocaleString('fr-FR')}</span></td>
            <td><span class="num-shape">{item.voiceFormatted}</span></td>
            <td><span class="num-shape">{item.avgMessageLength} car.</span></td>
          </tr>
        </DataTable>
      </div>
    {/if}

    <!-- Panel: Top Rôles -->
    {#if activeSubtab === 'roles'}
      <div class="table-card">
        <DataTable
          headers={['Rang', 'Rôle', 'Messages Totaux', 'Temps Vocal', 'Longueur Moyenne', 'Membres Actifs']}
          items={topRoles}
          emptyMessage="Aucune donnée pour les rôles sur cette période."
        >
          <tr slot="row" let:item let:index>
            <td>
              <span class="rank-badge {index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : ''}">
                {index + 1}
              </span>
            </td>
            <td>
              <span class="role-pill" style="border-color:{item.color}; color:{item.color}; font-size:0.85rem;">
                ● @{item.roleName}
              </span>
            </td>
            <td><span class="num-shape num-shape-accent">{item.messagesCount.toLocaleString('fr-FR')}</span></td>
            <td><span class="num-shape">{item.voiceFormatted}</span></td>
            <td><span class="num-shape">{item.avgMessageLength} car.</span></td>
            <td><span class="num-shape">{item.activeMembersCount} membres</span></td>
          </tr>
        </DataTable>
      </div>
    {/if}

    <!-- Panel: Salons & Forums -->
    {#if activeSubtab === 'channels'}
      <!-- Section Salons Forums -->
      <div style="margin-bottom: 2rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 0.8rem;">
          <h3 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">
            <MessagesSquare size={18} style="color:var(--primary);" />
            Trafic des Salons Forum & Sujets Populaires
          </h3>
          <small style="color:var(--text-muted);">Trafic global agrégé par forum et répartition des posts</small>
        </div>

        <div class="table-card">
          <DataTable
            headers={['Forum', 'Messages Totaux', 'Sujets Actifs', 'Sujet le Plus Actif', 'Longueur Moy.', 'Participants']}
            items={topForums}
            emptyMessage="Aucun salon forum détecté ou aucune activité sur cette période."
          >
            <tr slot="row" let:item>
              <td>
                <span class="num-shape num-shape-accent" style="margin-right:6px; font-size:0.75rem;">
                  Forum
                </span>
                <strong>{item.channelName}</strong>
              </td>
              <td><span class="num-shape num-shape-accent">{item.messagesCount.toLocaleString('fr-FR')}</span></td>
              <td><span class="num-shape">{item.threadsCount} {item.threadsCount > 1 ? 'sujets' : 'sujet'}</span></td>
              <td>
                {#if item.topThread}
                  <div>
                    📌 <strong>{item.topThread.name}</strong>
                    <span class="num-shape" style="margin-left: 6px; font-size: 0.75rem;">{item.topThread.messagesCount.toLocaleString('fr-FR')} msgs</span>
                  </div>
                {:else}
                  <span style="opacity:0.5;">Aucun sujet</span>
                {/if}

                {#if item.topThreads && item.topThreads.length > 1}
                  <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                    {#each item.topThreads.slice(1, 4) as t}
                      <span style="padding: 2px 6px; border-radius: var(--radius-sm); background: var(--bg-surface); border: 1px solid var(--border); font-size: 0.72rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;">
                        {t.name} <span class="num-shape" style="padding: 1px 4px; font-size: 0.7rem;">{t.messagesCount}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
              </td>
              <td><span class="num-shape">{item.avgMessageLength} car.</span></td>
              <td><span class="num-shape">{item.uniqueUsersCount}</span></td>
            </tr>
          </DataTable>
        </div>
      </div>

      <!-- Salons Textuels Classiques & Vocaux -->
      <div class="grid-2">
        <div>
          <h4 style="margin-bottom:0.8rem; display:flex; align-items:center; gap:6px;">
            <MessageSquare size={16} /> Salons Textuels Classiques
          </h4>
          <div class="table-card">
            <DataTable
              headers={['Salon', 'Messages', 'Longueur Moy.', 'Membres']}
              items={topTextChannels}
              emptyMessage="Aucun message dans les salons textuels classiques."
            >
              <tr slot="row" let:item>
                <td><strong># {item.channelName}</strong></td>
                <td><span class="num-shape num-shape-accent">{item.messagesCount.toLocaleString('fr-FR')}</span></td>
                <td><span class="num-shape">{item.avgMessageLength} car.</span></td>
                <td><span class="num-shape">{item.uniqueUsersCount}</span></td>
              </tr>
            </DataTable>
          </div>
        </div>

        <div>
          <h4 style="margin-bottom:0.8rem; display:flex; align-items:center; gap:6px;">
            <Volume2 size={16} /> Salons Vocaux
          </h4>
          <div class="table-card">
            <DataTable
              headers={['Salon', 'Temps Vocal', 'Sessions', 'Membres']}
              items={topVoiceChannels}
              emptyMessage="Aucun salon vocal utilisé sur cette période."
            >
              <tr slot="row" let:item>
                <td><strong>🔊 {item.channelName}</strong></td>
                <td><span class="num-shape num-shape-accent">{item.voiceFormatted}</span></td>
                <td><span class="num-shape">{item.sessionsCount} sessions</span></td>
                <td><span class="num-shape">{item.uniqueUsersCount}</span></td>
              </tr>
            </DataTable>
          </div>
        </div>
      </div>
    {/if}

    <!-- Panel: Member Flow -->
    {#if activeSubtab === 'flow'}
      <div class="table-card">
        <DataTable
          headers={['Événement', 'Utilisateur', 'Date & Heure']}
          items={memberEvents}
          emptyMessage="Aucun mouvement récent enregistré."
        >
          <tr slot="row" let:item>
            <td>
              <span class="flow-badge {item.eventType === 'join' ? 'join' : 'leave'}">
                {#if item.eventType === 'join'}
                  <UserPlus size={14} style="vertical-align:middle; margin-right:4px;" />
                  Arrivée sur le serveur
                {:else}
                  <UserCheck size={14} style="vertical-align:middle; margin-right:4px;" />
                  Départ du serveur
                {/if}
              </span>
            </td>
            <td>
              <div style="display:flex; align-items:center; gap: 8px;">
                <img
                  class="table-avatar"
                  src={item.avatarUrl || '/icon.svg'}
                  alt=""
                  on:error={(e) => (e.currentTarget.src = '/icon.svg')}
                />
                <div>
                  <strong>{item.displayName}</strong>
                  <small style="opacity:0.6; display:block;">(@{item.username})</small>
                </div>
              </div>
            </td>
            <td style="color:var(--text-muted);">{item.formattedDate}</td>
          </tr>
        </DataTable>
      </div>
    {/if}
  </div>
</div>

<style>
  .table-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  :global(#analytics-filters),
  :global(#analytics-kpis),
  :global(#analytics-timeline),
  :global(#analytics-breakdown),
  :global(#analytics-tables) {
    scroll-margin-top: calc(72px + 1.5rem);
  }
</style>

