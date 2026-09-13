<script>
  import { Ticket, Send, Shield, FolderPlus, Save } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import { dashboardData, saveConfig, deployTicketMessage } from '../stores/data';

  let savingConfig = false;
  let deploying = false;
  let deployChannelId = '';

  async function handleSave() {
    savingConfig = true;
    await saveConfig('tickets', {
      ticket_category_id: $dashboardData.config.ticket_category_id || '',
      ticket_staff_role_id: $dashboardData.config.ticket_staff_role_id || '',
    });
    savingConfig = false;
  }

  async function handleDeploy() {
    if (!deployChannelId) return;
    deploying = true;
    const success = await deployTicketMessage(deployChannelId);
    if (success) {
      deployChannelId = '';
    }
    deploying = false;
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Ticket size={24} class="title-icon" /> Système de Tickets & Support</h2>
      <p class="section-desc">
        Gérez l'assistance aux membres en créant des salons privés temporaires avec le rôle support.
      </p>
    </div>
  </div>

  <div class="grid-2">
    <!-- Config Card -->
    <Card id="tickets-config" icon={Ticket} title="Configuration des Salons de Tickets" subtitle="Emplacement et accès aux salons créés">
      <form on:submit|preventDefault={handleSave}>
        <div class="form-group">
          <label for="ticket_category">Catégorie des Tickets</label>
          <select id="ticket_category" bind:value={$dashboardData.config.ticket_category_id}>
            <option value="">-- Désactivé (Aucune catégorie) --</option>
            {#each $dashboardData.channels.categories as cat}
              <option value={cat.id}>📁 {cat.name}</option>
            {/each}
          </select>
          <small style="color:var(--text-muted); font-size:0.75rem;">Les nouveaux salons de tickets seront automatiquement regroupés sous cette catégorie.</small>
        </div>

        <div class="form-group">
          <label for="ticket_staff">Rôle Staff (Accès aux tickets)</label>
          <select id="ticket_staff" bind:value={$dashboardData.config.ticket_staff_role_id}>
            <option value="">-- Aucun rôle spécifique --</option>
            {#each $dashboardData.roles as r}
              <option value={r.id}>@{r.name}</option>
            {/each}
          </select>
          <small style="color:var(--text-muted); font-size:0.75rem;">Ce rôle bénéficiera des permissions de lecture et d'écriture dans chaque ticket ouvert.</small>
        </div>

        <button type="submit" class="btn btn-primary" disabled={savingConfig} style="margin-top: 1rem; width: 220px;">
          <Save size={16} style="vertical-align: middle; margin-right: 6px;" />
          {savingConfig ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
    </Card>

    <!-- Deploy Message Card -->
    <Card id="tickets-deploy" icon={Send} title="Déployer le Panneau d'Ouverture" subtitle="Message interactif avec bouton Discord">
      <form on:submit|preventDefault={handleDeploy}>
        <p style="color:var(--text-muted); font-size:0.85rem; line-height: 1.5; margin-bottom: 1rem;">
          Envoie un Embed officiel avec le bouton interactif <strong>« 🎫 Créer un Ticket »</strong> dans le salon de votre choix (ex: <code>#support</code>).
        </p>

        <div class="form-group">
          <label for="deploy_chan">Salon textuel de destination</label>
          <select id="deploy_chan" bind:value={deployChannelId} required>
            <option value="">-- Choisir un salon --</option>
            {#each $dashboardData.channels.text.filter((c) => !c.forum) as c}
              <option value={c.id}># {c.name}</option>
            {/each}
          </select>
        </div>

        <button type="submit" class="btn btn-primary" disabled={deploying || !deployChannelId} style="width: 100%; margin-top: 0.5rem;">
          <Send size={16} style="vertical-align: middle; margin-right: 6px;" />
          {deploying ? 'Déploiement en cours...' : 'Envoyer le message d\'ouverture'}
        </button>
      </form>
    </Card>
  </div>
</div>

