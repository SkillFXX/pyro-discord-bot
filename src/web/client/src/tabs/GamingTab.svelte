<script>
  import { 
    Gamepad2, 
    Key, 
    Trophy, 
    Crown, 
    RefreshCw, 
    Trash2, 
    Pencil, 
    Plus, 
    Save, 
    CheckCircle2, 
    AlertCircle, 
    ExternalLink
  } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import DataTable from '../components/DataTable.svelte';
  import Modal from '../components/Modal.svelte';
  import {
    dashboardData,
    saveConfig,
    addBrawlStarsReward,
    updateBrawlStarsReward,
    deleteBrawlStarsReward,
    syncBrawlStarsRoles,
    testBrawlStarsKey,
  } from '../stores/data';
  import { showToast } from '../stores/toast';

  const rankedTiers = [
    { id: 1, name: 'Bronze I' },
    { id: 2, name: 'Bronze II' },
    { id: 3, name: 'Bronze III' },
    { id: 4, name: 'Argent I' },
    { id: 5, name: 'Argent II' },
    { id: 6, name: 'Argent III' },
    { id: 7, name: 'Or I' },
    { id: 8, name: 'Or II' },
    { id: 9, name: 'Or III' },
    { id: 10, name: 'Diamant I' },
    { id: 11, name: 'Diamant II' },
    { id: 12, name: 'Diamant III' },
    { id: 13, name: 'Mythique I' },
    { id: 14, name: 'Mythique II' },
    { id: 15, name: 'Mythique III' },
    { id: 16, name: 'Légendaire I' },
    { id: 17, name: 'Légendaire II' },
    { id: 18, name: 'Légendaire III' },
    { id: 19, name: 'Maître I (Master I)' },
    { id: 20, name: 'Maître II (Master II)' },
    { id: 21, name: 'Maître III (Master III)' },
    { id: 22, name: 'Pro' },
  ];

  // API Key Form State
  let apiKeyInput = $dashboardData.config?.brawlstars_api_key || '';
  let savingKey = false;
  let testingKey = false;
  let keyTestStatus = null; // { valid: boolean, message: string }
  let apiKeyInitialized = false;

  $: if ($dashboardData.config?.brawlstars_api_key !== undefined && !apiKeyInitialized) {
    apiKeyInput = $dashboardData.config.brawlstars_api_key || '';
    apiKeyInitialized = true;
  }

  // Sync state
  let syncing = false;

  // New Trophy Reward
  let trophyThreshold = '';
  let trophyRoleId = '';
  let trophyReplace = 'false';

  // Edit Trophy Reward Modal
  let showEditTrophyModal = false;
  let editTrophyId = null;
  let editTrophyThreshold = '';
  let editTrophyRoleId = '';
  let editTrophyReplace = 'false';

  // New Ranked Reward
  let rankedThreshold = 1;
  let rankedRoleId = '';
  let rankedReplace = 'false';

  // Edit Ranked Reward Modal
  let showEditRankedModal = false;
  let editRankedId = null;
  let editRankedThreshold = 1;
  let editRankedRoleId = '';
  let editRankedReplace = 'false';

  $: allRewards = $dashboardData.brawlStarsRewards || [];
  $: trophyRewards = allRewards.filter((r) => r.type === 'trophies').sort((a, b) => a.threshold - b.threshold);
  $: rankedRewards = allRewards.filter((r) => r.type === 'ranked').sort((a, b) => a.threshold - b.threshold);

  async function handleSaveKey() {
    savingKey = true;
    const success = await saveConfig('gaming', {
      brawlstars_api_key: apiKeyInput.trim(),
    });
    savingKey = false;
    if (success) {
      showToast('Clé d\'API Brawl Stars enregistrée !', 'success');
      $dashboardData.config.brawlstars_api_key = apiKeyInput.trim();
    }
  }

  async function handleTestKey() {
    if (!apiKeyInput.trim()) {
      showToast('Veuillez renseigner une clé API avant de tester.', 'warning');
      return;
    }
    testingKey = true;
    keyTestStatus = null;
    const res = await testBrawlStarsKey(apiKeyInput.trim());
    testingKey = false;
    keyTestStatus = res;
    if (res.valid) {
      showToast('Connexion à l\'API Brawl Stars réussie !', 'success');
    } else {
      showToast(res.error || 'Clé API invalide', 'error');
    }
  }

  async function handleSyncRoles() {
    syncing = true;
    await syncBrawlStarsRoles();
    syncing = false;
  }

  // --- Trophy Rewards Handlers ---
  async function handleAddTrophyReward() {
    const parsed = parseInt(trophyThreshold, 10);
    if (isNaN(parsed) || parsed < 0) {
      showToast('Le nombre de trophées doit être un nombre positif.', 'warning');
      return;
    }
    if (!trophyRoleId) {
      showToast('Veuillez sélectionner un rôle Discord.', 'warning');
      return;
    }

    const success = await addBrawlStarsReward({
      type: 'trophies',
      threshold: parsed,
      roleId: trophyRoleId,
      replacePreviousRole: trophyReplace === 'true',
    });

    if (success) {
      trophyThreshold = '';
      trophyRoleId = '';
      trophyReplace = 'false';
    }
  }

  function openEditTrophy(item) {
    editTrophyId = item.id;
    editTrophyThreshold = item.threshold;
    editTrophyRoleId = item.roleId;
    editTrophyReplace = item.replacePreviousRole ? 'true' : 'false';
    showEditTrophyModal = true;
  }

  async function handleSaveEditTrophy() {
    const parsed = parseInt(editTrophyThreshold, 10);
    if (isNaN(parsed) || parsed < 0) {
      showToast('Nombre de trophées invalide.', 'warning');
      return;
    }
    const success = await updateBrawlStarsReward(editTrophyId, {
      type: 'trophies',
      threshold: parsed,
      roleId: editTrophyRoleId,
      replacePreviousRole: editTrophyReplace === 'true',
    });
    if (success) {
      showEditTrophyModal = false;
    }
  }

  // --- Ranked Rewards Handlers ---
  async function handleAddRankedReward() {
    if (!rankedRoleId) {
      showToast('Veuillez sélectionner un rôle Discord.', 'warning');
      return;
    }

    const success = await addBrawlStarsReward({
      type: 'ranked',
      threshold: parseInt(rankedThreshold, 10),
      roleId: rankedRoleId,
      replacePreviousRole: rankedReplace === 'true',
    });

    if (success) {
      rankedThreshold = 1;
      rankedRoleId = '';
      rankedReplace = 'false';
    }
  }

  function openEditRanked(item) {
    editRankedId = item.id;
    editRankedThreshold = item.threshold;
    editRankedRoleId = item.roleId;
    editRankedReplace = item.replacePreviousRole ? 'true' : 'false';
    showEditRankedModal = true;
  }

  async function handleSaveEditRanked() {
    const success = await updateBrawlStarsReward(editRankedId, {
      type: 'ranked',
      threshold: parseInt(editRankedThreshold, 10),
      roleId: editRankedRoleId,
      replacePreviousRole: editRankedReplace === 'true',
    });
    if (success) {
      showEditRankedModal = false;
    }
  }
</script>

<div class="tab-container">
  <!-- Tab Header -->
  <div class="tab-header">
    <div class="title-with-icon">
      <Gamepad2 size={28} class="header-icon" />
      <div>
        <h2>Module Gaming & Brawl Stars</h2>
        <p class="subtitle">Liez les profils de jeu de vos membres, affichez leurs stats et attribuez automatiquement des rôles selon leurs trophées et leur rang.</p>
      </div>
    </div>

    <button
      type="button"
      class="btn btn-secondary sync-all-btn"
      disabled={syncing}
      on:click={handleSyncRoles}
    >
      <RefreshCw size={16} class={syncing ? 'spin' : ''} />
      <span>{syncing ? 'Synchronisation en cours...' : 'Synchroniser Tous les Rôles'}</span>
    </button>
  </div>

  <!-- 1. API Key Section -->
  <div id="brawlstars-api" class="section-anchor"></div>
  <Card title="Clé d'API Brawl Stars" icon={Key}>
    <p class="card-description">
      Pour récupérer les statistiques officielles et générer les profils des joueurs, une clé d'API Supercell est requise.
      Obtenez votre clé gratuitement sur le
      <a href="https://developer.brawlstars.com/" target="_blank" rel="noopener noreferrer" class="link-external">
        Portail Développeur Brawl Stars <ExternalLink size={13} style="vertical-align: middle;" />
      </a>.
    </p>

    <div class="api-key-form">
      <div class="form-group flex-1">
        <label for="bs-api-key">Clé d'API Supercell (Token JWT)</label>
        <input
          id="bs-api-key"
          type="password"
          class="form-control"
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          bind:value={apiKeyInput}
        />
        <small class="form-help">
          Important : Dans les paramètres de votre clé sur le portail Supercell, ajoutez l'adresse IP publique de votre serveur d'hébergement.
        </small>
      </div>

      <div class="api-actions">
        <button
          type="button"
          class="btn btn-secondary"
          disabled={testingKey || !apiKeyInput.trim()}
          on:click={handleTestKey}
        >
          <RefreshCw size={15} class={testingKey ? 'spin' : ''} />
          <span>{testingKey ? 'Test en cours...' : 'Tester la Clé'}</span>
        </button>

        <button
          type="button"
          class="btn btn-primary"
          disabled={savingKey}
          on:click={handleSaveKey}
        >
          <Save size={15} />
          <span>{savingKey ? 'Sauvegarde...' : 'Sauvegarder'}</span>
        </button>
      </div>
    </div>

    {#if keyTestStatus}
      <div class="key-status-banner {keyTestStatus.valid ? 'success' : 'error'}">
        {#if keyTestStatus.valid}
          <CheckCircle2 size={18} />
          <span>{keyTestStatus.message}</span>
        {:else}
          <AlertCircle size={18} />
          <span>{keyTestStatus.error}</span>
        {/if}
      </div>
    {/if}
  </Card>

  <!-- 2. Trophy Roles Section -->
  <div id="brawlstars-trophies" class="section-anchor"></div>
  <Card title="Rôles par Palier de Trophées" icon={Trophy}>
    <p class="card-description">
      Attribuez automatiquement un rôle Discord dès qu'un membre lié atteint un certain total de trophées Brawl Stars.
    </p>

    <!-- Add Form -->
    <form class="reward-form-container" on:submit|preventDefault={handleAddTrophyReward}>
      <div class="inline-form-row trophy-form-row">
        <div class="form-group">
          <label for="trophy-threshold">Palier de Trophées</label>
          <input
            id="trophy-threshold"
            type="number"
            min="0"
            step="500"
            placeholder="ex: 25000"
            bind:value={trophyThreshold}
            required
          />
        </div>

        <div class="form-group role-form-group">
          <label for="trophy-role">Rôle à Attribuer</label>
          <select id="trophy-role" bind:value={trophyRoleId} required>
            <option value="" disabled selected>Sélectionner un rôle...</option>
            {#each $dashboardData.roles || [] as role}
              <option value={role.id}>{role.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="trophy-replace">Mode de Rôles</label>
          <select id="trophy-replace" bind:value={trophyReplace}>
            <option value="false">Cumulatif (Garder précédents)</option>
            <option value="true">Remplacement (Supprimer précédents)</option>
          </select>
        </div>

        <div class="form-group form-group-btn">
          <span class="btn-spacer-label" aria-hidden="true">&nbsp;</span>
          <button type="submit" class="btn btn-primary inline-form-btn">
            <Plus size={16} />
            <span>Ajouter</span>
          </button>
        </div>
      </div>
    </form>

    <!-- Trophy Rewards Table -->
    <div class="table-margin">
      <DataTable
        headers={['Trophées Requis', 'Rôle Associé', 'Gestion des Rôles', 'Actions']}
        items={trophyRewards}
        emptyMessage="Aucun palier de trophées configuré pour le moment."
      >
        <tr slot="row" let:item>
          <td>
            <div class="trophy-cell">
              <Trophy size={16} class="trophy-icon" />
              <strong>{Number(item.threshold).toLocaleString('fr-FR')}</strong> trophées
            </div>
          </td>
          <td>
            <span class="role-badge">@{item.roleName}</span>
          </td>
          <td>
            {#if item.replacePreviousRole}
              <span class="badge badge-replace">Supprime les précédents</span>
            {:else}
              <span class="badge badge-keep">Cumulatif (Garde précédents)</span>
            {/if}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <div class="actions-cell">
              <button
                type="button"
                class="btn-icon"
                title="Modifier ce palier"
                on:click={() => openEditTrophy(item)}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                class="btn-icon btn-icon-danger"
                title="Supprimer ce palier"
                on:click={() => deleteBrawlStarsReward(item.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </td>
        </tr>
      </DataTable>
    </div>
  </Card>

  <!-- 3. Ranked Roles Section -->
  <div id="brawlstars-ranked" class="section-anchor"></div>
  <Card title="Rôles par Rang en Ranked" icon={Crown}>
    <p class="card-description">
      Attribuez un rôle selon le meilleur rang atteint en mode Classé (Ranked).
    </p>

    <!-- Add Form -->
    <form class="reward-form-container" on:submit|preventDefault={handleAddRankedReward}>
      <div class="inline-form-row ranked-form-row">
        <div class="form-group">
          <label for="ranked-threshold">Rang Ranked</label>
          <select id="ranked-threshold" bind:value={rankedThreshold} required>
            {#each rankedTiers as tier}
              <option value={tier.id}>{tier.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group role-form-group">
          <label for="ranked-role">Rôle à Attribuer</label>
          <select id="ranked-role" bind:value={rankedRoleId} required>
            <option value="" disabled selected>Sélectionner un rôle...</option>
            {#each $dashboardData.roles || [] as role}
              <option value={role.id}>{role.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="ranked-replace">Mode de Rôles</label>
          <select id="ranked-replace" bind:value={rankedReplace}>
            <option value="false">Cumulatif (Garder précédents)</option>
            <option value="true">Remplacement (Supprimer précédents)</option>
          </select>
        </div>

        <div class="form-group form-group-btn">
          <span class="btn-spacer-label" aria-hidden="true">&nbsp;</span>
          <button type="submit" class="btn btn-primary inline-form-btn">
            <Plus size={16} />
            <span>Ajouter</span>
          </button>
        </div>
      </div>
    </form>

    <!-- Ranked Rewards Table -->
    <div class="table-margin">
      <DataTable
        headers={['Rang Requis', 'Rôle Associé', 'Gestion des Rôles', 'Actions']}
        items={rankedRewards}
        emptyMessage="Aucun palier de ranked configuré pour le moment."
      >
        <tr slot="row" let:item>
          <td>
            <div class="ranked-cell">
              <Crown size={16} class="ranked-icon" />
              <strong>{item.thresholdLabel}</strong>
            </div>
          </td>
          <td>
            <span class="role-badge">@{item.roleName}</span>
          </td>
          <td>
            {#if item.replacePreviousRole}
              <span class="badge badge-replace">Supprime les précédents</span>
            {:else}
              <span class="badge badge-keep">Cumulatif (Garde précédents)</span>
            {/if}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <div class="actions-cell">
              <button
                type="button"
                class="btn-icon"
                title="Modifier ce palier"
                on:click={() => openEditRanked(item)}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                class="btn-icon btn-icon-danger"
                title="Supprimer ce palier"
                on:click={() => deleteBrawlStarsReward(item.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </td>
        </tr>
      </DataTable>
    </div>
  </Card>
</div>

<!-- Edit Trophy Modal -->
<Modal bind:open={showEditTrophyModal} title="Modifier le Palier de Trophées">
  <form on:submit|preventDefault={handleSaveEditTrophy}>
    <div class="form-group" style="margin-bottom: 1rem;">
      <label for="edit-trophy-threshold">Palier de Trophées</label>
      <input
        id="edit-trophy-threshold"
        type="number"
        min="0"
        step="500"
        bind:value={editTrophyThreshold}
        required
      />
    </div>

    <div class="form-group" style="margin-bottom: 1rem;">
      <label for="edit-trophy-role">Rôle à Attribuer</label>
      <select id="edit-trophy-role" bind:value={editTrophyRoleId} required>
        {#each $dashboardData.roles || [] as role}
          <option value={role.id}>{role.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-group" style="margin-bottom: 1.5rem;">
      <label for="edit-trophy-replace">Mode de Rôles</label>
      <select id="edit-trophy-replace" bind:value={editTrophyReplace}>
        <option value="false">Cumulatif (Garder les précédents)</option>
        <option value="true">Remplacement (Supprimer les précédents)</option>
      </select>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" on:click={() => (showEditTrophyModal = false)}>
        Annuler
      </button>
      <button type="submit" class="btn btn-primary">
        Enregistrer les modifications
      </button>
    </div>
  </form>
</Modal>

<!-- Edit Ranked Modal -->
<Modal bind:open={showEditRankedModal} title="Modifier le Palier Ranked">
  <form on:submit|preventDefault={handleSaveEditRanked}>
    <div class="form-group" style="margin-bottom: 1rem;">
      <label for="edit-ranked-threshold">Rang Ranked</label>
      <select id="edit-ranked-threshold" bind:value={editRankedThreshold} required>
        {#each rankedTiers as tier}
          <option value={tier.id}>{tier.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-group" style="margin-bottom: 1rem;">
      <label for="edit-ranked-role">Rôle à Attribuer</label>
      <select id="edit-ranked-role" bind:value={editRankedRoleId} required>
        {#each $dashboardData.roles || [] as role}
          <option value={role.id}>{role.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-group" style="margin-bottom: 1.5rem;">
      <label for="edit-ranked-replace">Mode de Rôles</label>
      <select id="edit-ranked-replace" bind:value={editRankedReplace}>
        <option value="false">Cumulatif (Garder les précédents)</option>
        <option value="true">Remplacement (Supprimer les précédents)</option>
      </select>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" on:click={() => (showEditRankedModal = false)}>
        Annuler
      </button>
      <button type="submit" class="btn btn-primary">
        Enregistrer les modifications
      </button>
    </div>
  </form>
</Modal>

<style>
  .tab-container {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .section-anchor {
    position: relative;
    top: -20px;
    height: 0;
  }

  .tab-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .title-with-icon {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  :global(.header-icon) {
    color: var(--primary, #FF6B35);
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.25rem 0;
  }

  .subtitle {
    font-size: 0.9rem;
    color: var(--text-secondary);
    margin: 0;
    max-width: 680px;
  }

  .card-description {
    font-size: 0.88rem;
    color: var(--text-secondary);
    margin-top: 0;
    margin-bottom: 1.25rem;
    line-height: 1.5;
  }

  .link-external {
    color: var(--primary, #FF6B35);
    text-decoration: none;
    font-weight: 500;
  }

  .link-external:hover {
    text-decoration: underline;
  }

  .api-key-form {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .api-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.75rem;
  }

  .key-status-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm, 6px);
    margin-top: 1rem;
    font-size: 0.88rem;
  }

  .key-status-banner.success {
    background-color: rgba(46, 204, 113, 0.12);
    border: 1px solid rgba(46, 204, 113, 0.3);
    color: #2ECC71;
  }

  .key-status-banner.error {
    background-color: rgba(231, 76, 60, 0.12);
    border: 1px solid rgba(231, 76, 60, 0.3);
    color: #E74C3C;
  }

  .reward-form-container {
    background-color: var(--surface-2, rgba(255, 255, 255, 0.02));
    padding: 1.25rem;
    border-radius: var(--radius-sm, 6px);
    border: 1px solid var(--border);
    margin-bottom: 1.25rem;
  }

  .reward-form-container .inline-form-row {
    margin-bottom: 0;
  }

  .trophy-form-row,
  .ranked-form-row {
    display: grid !important;
    grid-template-columns: 180px minmax(0, 1.3fr) minmax(0, 1.1fr) auto !important;
    gap: 1rem;
    align-items: flex-end;
    margin-bottom: 0 !important;
  }

  .trophy-form-row label,
  .ranked-form-row label {
    margin-bottom: 0 !important;
  }

  .btn-spacer-label {
    display: block;
    font-size: 0.8rem;
    visibility: hidden;
    user-select: none;
    min-height: 20px;
    margin-bottom: 0;
  }

  .form-group-btn {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .reward-form-container input,
  .reward-form-container select,
  .reward-form-container .inline-form-btn {
    height: 42px !important;
    box-sizing: border-box;
  }

  .reward-form-container .inline-form-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0 1.25rem;
    white-space: nowrap;
    font-weight: 600;
  }

  @media (max-width: 900px) {
    .trophy-form-row,
    .ranked-form-row {
      grid-template-columns: 1fr !important;
    }

    .btn-spacer-label {
      display: none;
    }

    .reward-form-container .inline-form-btn {
      width: 100%;
    }
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .form-help {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .table-margin {
    margin-top: 0.5rem;
  }

  .trophy-cell, .ranked-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  :global(.trophy-icon) {
    color: #FBBF24;
  }

  :global(.ranked-icon) {
    color: #A855F7;
  }

  .role-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background-color: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.82rem;
    color: var(--text-primary);
  }

  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    font-size: 0.78rem;
    font-weight: 500;
  }

  .badge-replace {
    background-color: rgba(239, 68, 68, 0.15);
    color: #EF4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .badge-keep {
    background-color: rgba(59, 130, 246, 0.15);
    color: #60A5FA;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .actions-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .btn-icon {
    background: var(--surface-2, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-icon:hover {
    background-color: var(--surface-hover);
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }

  .btn-icon-danger:hover {
    background-color: rgba(231, 76, 60, 0.15);
    color: #E74C3C;
    border-color: #E74C3C;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  @media (max-width: 768px) {
    .api-key-form {
      flex-direction: column;
    }
    .api-actions {
      margin-top: 0;
    }
  }
</style>
