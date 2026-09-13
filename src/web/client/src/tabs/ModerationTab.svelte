<script>
  import { Shield, AlertTriangle, Trash2, Plus } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import DataTable from '../components/DataTable.svelte';
  import { dashboardData, addWarnAction, deleteWarnAction } from '../stores/data';
  import { showToast } from '../stores/toast';

  let warnsCount = '';
  let action = 'mute';
  let duration = 86400;

  // Discord API restricts timeouts to 28 days max (2,419,200 seconds / 4 weeks)
  const MAX_TIMEOUT_SECONDS = 2419200;

  function formatDuration(sec) {
    if (!sec) return 'Définitif';
    if (sec >= 604800 && sec % 604800 === 0) {
      const weeks = sec / 604800;
      return `${weeks} semaine${weeks > 1 ? 's' : ''} (${sec / 86400}j)`;
    }
    if (sec >= 86400) return `${sec / 86400} jour(s) (${sec}s)`;
    if (sec >= 3600) return `${sec / 3600} heure(s) (${sec}s)`;
    if (sec >= 60) return `${sec / 60} minute(s) (${sec}s)`;
    return `${sec} seconde(s)`;
  }

  async function handleAdd() {
    if (!warnsCount || parseInt(warnsCount) < 1) return;
    if (action === 'mute') {
      const parsedDur = parseInt(duration);
      if (isNaN(parsedDur) || parsedDur < 10) {
        showToast('La durée minimale d\'exclusion est de 10 secondes', 'error');
        return;
      }
      if (parsedDur > MAX_TIMEOUT_SECONDS) {
        showToast('La durée maximale d\'exclusion Discord est de 28 jours (2 419 200s)', 'error');
        return;
      }
    }

    await addWarnAction({
      warnsCount: parseInt(warnsCount),
      action,
      duration: action === 'mute' ? parseInt(duration) : null,
    });
    warnsCount = '';
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Shield size={24} class="title-icon" /> Sanctions Automatiques de Modération</h2>
      <p class="section-desc">
        Configurez des sanctions déclenchées automatiquement lorsqu'un membre accumule un seuil précis d'avertissements.
      </p>
    </div>
  </div>

  <div class="grid-2">
    <!-- Form Card -->
    <Card id="mod-add" icon={Plus} title="Ajouter un Seuil de Sanction" subtitle="Définir une action automatique sur avertissement">
      <form on:submit|preventDefault={handleAdd}>
        <div class="form-group">
          <label for="warns_count">Nombre d'avertissements (seuil)</label>
          <input
            id="warns_count"
            type="number"
            bind:value={warnsCount}
            min="1"
            required
            placeholder="Ex: 3"
          />
        </div>

        <div class="form-group">
          <label for="warn_action">Sanction</label>
          <select id="warn_action" bind:value={action}>
            <option value="mute">Exclusion temporaire (Mute / Timeout)</option>
            <option value="ban">Bannissement définitif</option>
          </select>
        </div>

        {#if action === 'mute'}
          <div class="form-group">
            <label for="warn_duration">
              Durée du Mute (en secondes)
              <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400; margin-left:6px;">
                (Max : 28 jours = 2 419 200s)
              </span>
            </label>
            <input
              id="warn_duration"
              type="number"
              bind:value={duration}
              min="10"
              max="2419200"
              required
              placeholder="Ex: 86400 (1 jour)"
            />
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (duration = 600)}>10 min (600s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (duration = 3600)}>1 heure (3600s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (duration = 86400)}>1 jour (86400s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (duration = 604800)}>7 jours (604800s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (duration = 1209600)}>14 jours (1209600s)</button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding: 0.25rem 0.5rem;" on:click={() => (duration = 2419200)}>28 jours Max (2419200s)</button>
            </div>
            {#if duration > 2419200}
              <p style="color: var(--danger); font-size: 0.8rem; margin-top: 0.4rem; display: flex; align-items: center; gap: 5px;">
                <AlertTriangle size={14} />
                L'API Discord limite strictement les exclusions temporaires (timeouts) à 28 jours maximum (2 419 200 secondes).
              </p>
            {/if}
          </div>
        {/if}

        <button type="submit" class="btn btn-primary" style="margin-top: 1rem; width: 100%;">
          Ajouter le seuil
        </button>
      </form>
    </Card>

    <!-- Info / Guide Card -->
    <Card id="mod-guide" icon={AlertTriangle} title="Fonctionnement" subtitle="Comment s'appliquent les sanctions">
      <div style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.6;">
        <p>
          Lorsqu'un membre reçoit un avertissement via la commande de modération ou le système d'Automod :
        </p>
        <ul style="padding-left: 1.25rem; margin: 0.5rem 0;">
          <li>Le bot calcule le nombre total d'avertissements actifs de l'utilisateur.</li>
          <li>Si le compte correspond exactement au seuil configuré, la sanction est appliquée immédiatement.</li>
          <li>Un message de notification est envoyé dans le salon de logs et en message privé au membre.</li>
        </ul>
        <p style="margin-bottom:0;">
          💡 <em>Astuce : vous pouvez créer des paliers croissants (ex: 3 warns = 1h de mute, 5 warns = 1 jour, 7 warns = ban).</em>
        </p>
      </div>
    </Card>
  </div>

  <!-- Table of Configured Warn Actions -->
  <div style="margin-top: 1.5rem;">
    <Card id="mod-table" icon={Shield} title="Seuils Actuels" subtitle="Liste des actions configurées par palier de warns">
      <DataTable
        headers={['Seuil (Warns)', 'Sanction', 'Durée', 'Actions']}
        items={$dashboardData.warnActions}
        emptyMessage="Aucun seuil d'avertissement configuré."
      >
        <tr slot="row" let:item>
          <td>
            <span class="num-shape num-shape-accent">{item.warnsCount}</span>
            <span style="color: var(--text-muted); margin-left: 6px;">avertissement{item.warnsCount > 1 ? 's' : ''}</span>
          </td>
          <td>
            {#if item.action === 'mute'}
              <span class="badge badge-info">Exclusion (Mute)</span>
            {:else}
              <span class="badge badge-danger">Bannissement</span>
            {/if}
          </td>
          <td>
            <span class="num-shape">{formatDuration(item.duration)}</span>
          </td>
          <td style="text-align: right;">
            <button
              class="btn btn-danger"
              style="padding: 0.35rem 0.6rem; font-size: 0.8rem;"
              on:click={() => deleteWarnAction(item.warnsCount)}
              title="Supprimer ce seuil"
            >
              <Trash2 size={14} style="vertical-align: middle; margin-right: 4px;" />
              Supprimer
            </button>
          </td>
        </tr>
      </DataTable>
    </Card>
  </div>
</div>

