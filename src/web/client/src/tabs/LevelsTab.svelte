<script>
  import { Award, Zap, Shield, UserPlus, Trash2, Plus, Save } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import Toggle from '../components/Toggle.svelte';
  import DataTable from '../components/DataTable.svelte';
  import {
    dashboardData,
    saveConfig,
    addXpMultiplier,
    deleteXpMultiplier,
    addRoleReward,
    deleteRoleReward,
    addAutoRole,
    deleteAutoRole,
  } from '../stores/data';

  // Local form states
  let savingXp = false;

  // New XP Multiplier
  let multChannelId = '';
  let multValue = 2.0;

  // New Role Reward
  let rewardLevel = '';
  let rewardRoleId = '';
  let replacePrevious = 'false';

  // New Auto Role
  let autoRoleId = '';

  async function handleSaveXpConfig() {
    savingXp = true;
    await saveConfig('xp', {
      xp_enabled: $dashboardData.config.xp_enabled,
      xp_min_gain: parseInt($dashboardData.config.xp_min_gain || 15),
      xp_max_gain: parseInt($dashboardData.config.xp_max_gain || 25),
      xp_cooldown_seconds: parseInt($dashboardData.config.xp_cooldown_seconds || 60),
      xp_announcement_channel_id: $dashboardData.config.xp_announcement_channel_id || '',
    });
    savingXp = false;
  }

  async function handleAddMultiplier() {
    if (!multChannelId) return;
    await addXpMultiplier({
      channelId: multChannelId,
      multiplier: parseFloat(multValue),
    });
    multChannelId = '';
  }

  async function handleAddReward() {
    if (!rewardLevel || !rewardRoleId) return;
    await addRoleReward({
      level: parseInt(rewardLevel),
      roleId: rewardRoleId,
      replacePreviousRole: replacePrevious === 'true',
    });
    rewardLevel = '';
    rewardRoleId = '';
  }

  async function handleAddAutoRole() {
    if (!autoRoleId) return;
    await addAutoRole(autoRoleId);
    autoRoleId = '';
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Award size={24} class="title-icon" /> Niveaux, Récompenses & Auto-Rôles</h2>
      <p class="section-desc">
        Configurez le système de progression par XP, les multiplicateurs par salon, les rôles de niveaux et les rôles d'arrivée.
      </p>
    </div>
  </div>

  <!-- SECTION 1: XP Core Config -->
  <Card id="levels-xp" icon={Zap} title="Système de Niveaux & XP" subtitle="Gains d'XP par message et canal d'annonce">
    <form on:submit|preventDefault={handleSaveXpConfig}>
      <Toggle
        id="xp_enabled"
        bind:checked={$dashboardData.config.xp_enabled}
        label="Activer le système de gain d'XP et niveaux"
        description="Permet aux membres de gagner de l'XP en envoyant des messages sur le serveur."
      />

      <div class="grid-2" style="margin-top: 1.5rem;">
        <div class="form-group">
          <label for="xp_min_gain">XP Minimum par message</label>
          <input
            id="xp_min_gain"
            type="number"
            bind:value={$dashboardData.config.xp_min_gain}
            min="1"
            required
          />
        </div>

        <div class="form-group">
          <label for="xp_max_gain">XP Maximum par message</label>
          <input
            id="xp_max_gain"
            type="number"
            bind:value={$dashboardData.config.xp_max_gain}
            min="1"
            required
          />
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label for="xp_cooldown">Cooldown d'XP (en secondes)</label>
          <input
            id="xp_cooldown"
            type="number"
            bind:value={$dashboardData.config.xp_cooldown_seconds}
            min="5"
            required
          />
          <small style="color:var(--text-muted); font-size: 0.75rem;">Délai d'attente minimal entre deux attributions d'XP à un même utilisateur.</small>
        </div>

        <div class="form-group">
          <label for="xp_channel">Salon des annonces de Level Up</label>
          <select id="xp_channel" bind:value={$dashboardData.config.xp_announcement_channel_id}>
            <option value="">-- Même salon que le message (Défaut) --</option>
            {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
              <option value={c.id}># {c.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" disabled={savingXp} style="margin-top: 0.5rem; width: 220px;">
        <Save size={16} style="vertical-align: middle; margin-right: 6px;" />
        {savingXp ? 'Enregistrement...' : 'Enregistrer les paramètres'}
      </button>
    </form>
  </Card>

  <!-- SECTION 2: Multiplicateurs d'XP par Salon -->
  <div style="margin-top: 1.5rem;">
    <Card id="levels-multipliers" icon={Zap} title="Multiplicateurs d'XP par Salon" subtitle="Bonus d'XP accordés dans certains salons spécifiques">
      <form on:submit|preventDefault={handleAddMultiplier}>
        <div class="inline-form-row" style="grid-template-columns: 1fr 1fr auto;">
          <div class="form-group">
            <label for="mult_channel">Salon concerné</label>
            <select id="mult_channel" bind:value={multChannelId} required>
              <option value="">-- Choisir un salon textuel --</option>
              {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
                <option value={c.id}># {c.name}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label for="mult_val">Multiplicateur (ex: 2.0 pour ×2)</label>
            <input
              id="mult_val"
              type="number"
              bind:value={multValue}
              min="0.1"
              max="10"
              step="0.1"
              required
            />
          </div>

          <div class="form-group">
            <button type="submit" class="btn btn-primary inline-form-btn">
              <Plus size={16} />
              Ajouter
            </button>
          </div>
        </div>
      </form>

      <DataTable
        headers={['Salon', 'Multiplicateur', 'Action']}
        items={$dashboardData.xpMultipliers}
        emptyMessage="Aucun multiplicateur d'XP configuré."
      >
        <tr slot="row" let:item>
          <td><strong>#{item.channelName || item.channelId}</strong></td>
          <td><span class="num-shape num-shape-accent">× {item.multiplier}</span></td>
          <td style="text-align: right;">
            <button
              class="btn btn-danger"
              style="padding: 0.35rem 0.6rem; font-size: 0.8rem;"
              on:click={() => deleteXpMultiplier(item.channelId)}
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      </DataTable>
    </Card>
  </div>

  <!-- SECTION 3: Rôles Récompenses par Niveau -->
  <div style="margin-top: 1.5rem;">
    <Card id="levels-rewards" icon={Award} title="Rôles Récompenses (Niveaux)" subtitle="Rôles attribués automatiquement quand un membre franchit un niveau">
      <form on:submit|preventDefault={handleAddReward}>
        <div class="inline-form-row" style="grid-template-columns: 140px 1fr 1fr auto;">
          <div class="form-group">
            <label for="rew_level">Niveau requis</label>
            <input id="rew_level" type="number" bind:value={rewardLevel} min="1" required placeholder="Ex: 5" />
          </div>

          <div class="form-group">
            <label for="rew_role">Rôle accordé</label>
            <select id="rew_role" bind:value={rewardRoleId} required>
              <option value="">-- Choisir un rôle --</option>
              {#each $dashboardData.roles as r}
                <option value={r.id}>@{r.name}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <label for="rew_replace">Remplacement</label>
            <select id="rew_replace" bind:value={replacePrevious}>
              <option value="false">Cumuler le rôle</option>
              <option value="true">Retirer les rôles inférieurs</option>
            </select>
          </div>

          <div class="form-group">
            <button type="submit" class="btn btn-primary inline-form-btn">
              <Plus size={16} />
              Ajouter
            </button>
          </div>
        </div>
      </form>

      <DataTable
        headers={['Niveau', 'Rôle Attribué', 'Comportement', 'Action']}
        items={$dashboardData.roleRewards}
        emptyMessage="Aucune récompense de rôle configurée."
      >
        <tr slot="row" let:item>
          <td><span class="num-shape num-shape-accent">Niveau {item.level}</span></td>
          <td><strong>@{item.roleName}</strong></td>
          <td>
            {#if item.replacePreviousRole}
              <span class="badge badge-warning">Retire rôles inférieurs</span>
            {:else}
              <span class="badge badge-success">Cumulable</span>
            {/if}
          </td>
          <td style="text-align: right;">
            <button
              class="btn btn-danger"
              style="padding: 0.35rem 0.6rem; font-size: 0.8rem;"
              on:click={() => deleteRoleReward(item.level)}
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      </DataTable>
    </Card>
  </div>

  <!-- SECTION 4: Auto-Rôles à l'Arrivée -->
  <div style="margin-top: 1.5rem;">
    <Card id="levels-autoroles" icon={UserPlus} title="Rôles Automatiques (Auto-Roles)" subtitle="Attribués immédiatement aux nouveaux arrivants sur le serveur">
      <form on:submit|preventDefault={handleAddAutoRole}>
        <div class="inline-form-row" style="grid-template-columns: 1fr auto;">
          <div class="form-group">
            <label for="auto_role_select">Rôle à attribuer dès l'arrivée</label>
            <select id="auto_role_select" bind:value={autoRoleId} required>
              <option value="">-- Choisir un rôle --</option>
              {#each $dashboardData.roles as r}
                <option value={r.id}>@{r.name}</option>
              {/each}
            </select>
          </div>

          <div class="form-group">
            <button type="submit" class="btn btn-primary inline-form-btn">
              <Plus size={16} />
              Ajouter l'auto-rôle
            </button>
          </div>
        </div>
      </form>

      <DataTable
        headers={['Nom du Rôle', 'ID Discord', 'Action']}
        items={$dashboardData.autoRoles}
        emptyMessage="Aucun auto-rôle configuré."
      >
        <tr slot="row" let:item>
          <td><strong>@{item.roleName}</strong></td>
          <td><code>{item.roleId}</code></td>
          <td style="text-align: right;">
            <button
              class="btn btn-danger"
              style="padding: 0.35rem 0.6rem; font-size: 0.8rem;"
              on:click={() => deleteAutoRole(item.roleId)}
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </td>
        </tr>
      </DataTable>
    </Card>
  </div>
</div>

