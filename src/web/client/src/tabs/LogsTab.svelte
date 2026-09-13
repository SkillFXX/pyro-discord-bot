<script>
  import { Scroll, Bot, Activity, CheckSquare, Square, Save, Hash, AlertTriangle } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import Toggle from '../components/Toggle.svelte';
  import Modal from '../components/Modal.svelte';
  import { dashboardData, saveConfig } from '../stores/data';

  let saving = false;
  let showConfirmModal = false;
  let confirmAction = 'enable'; // 'enable' | 'disable'

  $: botLogs = ($dashboardData.logConfigKeys || []).filter((k) => k.category === 'bot');
  $: discordLogs = ($dashboardData.logConfigKeys || []).filter((k) => k.category === 'discord');

  function openConfirm(action) {
    confirmAction = action;
    showConfirmModal = true;
  }

  function handleConfirm() {
    const val = confirmAction === 'enable';
    const newConfig = { ...$dashboardData.config };
    ($dashboardData.logConfigKeys || []).forEach((k) => {
      newConfig[k.key] = val;
    });
    dashboardData.update((d) => ({ ...d, config: newConfig }));
    showConfirmModal = false;
  }

  async function handleSave() {
    saving = true;
    const payload = {
      log_channel_id: $dashboardData.config.log_channel_id || '',
    };
    ($dashboardData.logConfigKeys || []).forEach((k) => {
      payload[k.key] = $dashboardData.config[k.key] === true;
    });

    await saveConfig('logs', payload);
    saving = false;
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Scroll size={24} class="title-icon" /> Configuration des Logs & Audit</h2>
      <p class="section-desc">
        Choisissez le salon de destination et activez les événements à consigner en direct sur votre serveur Discord.
      </p>
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <button type="button" class="btn btn-secondary" on:click={() => openConfirm('enable')}>
        <CheckSquare size={16} style="vertical-align: middle; margin-right: 4px;" />
        Tout Activer
      </button>
      <button type="button" class="btn btn-secondary" on:click={() => openConfirm('disable')}>
        <Square size={16} style="vertical-align: middle; margin-right: 4px;" />
        Tout Désactiver
      </button>
    </div>
  </div>

  <form on:submit|preventDefault={handleSave}>
    <!-- Channel selector -->
    <Card id="logs-channel" icon={Hash} title="Salon des Logs" subtitle="Emplacement où seront postés les embeds de journalisation">
      <div style="max-width: 450px;">
        <label for="logs_channel">Salon textuel dédié</label>
        <select id="logs_channel" bind:value={$dashboardData.config.log_channel_id}>
          <option value="">-- Aucun salon (Logs désactivés) --</option>
          {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
            <option value={c.id}># {c.name}</option>
          {/each}
        </select>
      </div>
    </Card>

    <!-- Bot Events -->
    <div style="margin-top: 1.5rem;">
      <Card id="logs-bot" icon={Bot} title="Événements & Actions du Bot Pyro" subtitle="Sanctions, avertissements, automod, tickets et rôles gérés par Pyro">
        <div class="grid-2">
          {#each botLogs as item}
            <Toggle
              id={item.key}
              bind:checked={$dashboardData.config[item.key]}
              label={item.label}
              description={item.description}
            />
          {/each}
        </div>
      </Card>
    </div>

    <!-- Discord Events -->
    <div style="margin-top: 1.5rem;">
      <Card id="logs-discord" icon={Activity} title="Activité & Événements Discord" subtitle="Modifications de salons, rôles, expulsions, messages supprimés, bans">
        <div class="grid-2">
          {#each discordLogs as item}
            <Toggle
              id={item.key}
              bind:checked={$dashboardData.config[item.key]}
              label={item.label}
              description={item.description}
            />
          {/each}
        </div>
      </Card>
    </div>

    <div style="margin-top: 1.5rem;">
      <button type="submit" class="btn btn-primary" disabled={saving} style="width: 240px;">
        <Save size={16} style="vertical-align: middle; margin-right: 6px;" />
        {saving ? 'Enregistrement...' : 'Enregistrer les Logs'}
      </button>
    </div>
  </form>

  <!-- Modal d'avertissement pour Tout Activer / Tout Désactiver -->
  <Modal
    bind:open={showConfirmModal}
    title={confirmAction === 'enable' ? 'Activer tous les logs' : 'Désactiver tous les logs'}
  >
    <div class="confirm-modal-body">
      <div class="warning-icon-wrap" class:warning-danger={confirmAction === 'disable'}>
        <AlertTriangle size={28} />
      </div>
      <div class="warning-text">
        <h4>{confirmAction === 'enable' ? 'Confirmation d\'activation globale' : 'Confirmation de désactivation globale'}</h4>
        <p>
          {#if confirmAction === 'enable'}
            Êtes-vous certain de vouloir <strong>activer l'intégralité des événements de journalisation</strong> ? Cela inclut l'ensemble des actions du bot ainsi que toutes les modifications d'activité sur le serveur Discord.
          {:else}
            Êtes-vous certain de vouloir <strong>désactiver l'intégralité des événements de journalisation</strong> ? Plus aucun avertissement, sanction, mise à jour de rôle ou suppression de message ne sera consigné.
          {/if}
        </p>
      </div>
    </div>

    <div class="modal-actions">
      <button type="button" class="btn btn-secondary" on:click={() => (showConfirmModal = false)}>
        Annuler
      </button>
      {#if confirmAction === 'enable'}
        <button type="button" class="btn btn-primary" on:click={handleConfirm}>
          <CheckSquare size={16} />
          <span>Confirmer et Tout Activer</span>
        </button>
      {:else}
        <button
          type="button"
          class="btn btn-danger"
          style="background-color: var(--danger); color: #ffffff; border-color: var(--danger);"
          on:click={handleConfirm}
        >
          <Square size={16} />
          <span>Confirmer et Tout Désactiver</span>
        </button>
      {/if}
    </div>
  </Modal>
</div>

<style>
  .confirm-modal-body {
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
    margin-bottom: 1.5rem;
  }

  .warning-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--warning-subtle);
    border: 1px solid var(--warning-border);
    color: var(--warning);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .warning-icon-wrap.warning-danger {
    background: var(--danger-subtle);
    border: 1px solid var(--danger-border);
    color: var(--danger);
  }

  .warning-text h4 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.35rem;
  }

  .warning-text p {
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-secondary);
    margin: 0;
  }

  .warning-text strong {
    color: var(--text-primary);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid var(--border);
    padding-top: 1.25rem;
  }
</style>

