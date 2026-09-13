<script>
  import { dashboardData, saveConfig } from '../stores/data';
  import Card from '../components/Card.svelte';
  import { Settings, Save, MessageSquare, Volume2, Users } from '@lucide/svelte';

  let config = {};
  $: config = { ...$dashboardData.config };

  let channels = { text: [], forums: [], voice: [], categories: [] };
  $: channels = $dashboardData.channels;

  let saving = false;

  async function handleSave() {
    saving = true;
    await saveConfig('general', {
      member_counter_channel_id: config.member_counter_channel_id,
      member_counter_template: config.member_counter_template,
      voice_creator_channel_id: config.voice_creator_channel_id,
      voice_creator_category_id: config.voice_creator_category_id,
      welcome_channel_id: config.welcome_channel_id,
      leave_channel_id: config.leave_channel_id,
      welcome_message_template: config.welcome_message_template,
      leave_message_template: config.leave_message_template,
    });
    saving = false;
  }
</script>

<div class="tab-content-wrapper">
  <div class="page-title-row">
    <div>
      <h2><Settings size={24} class="title-icon" /> Configuration Générale</h2>
      <p class="section-desc">
        Configurez les fonctionnalités principales de votre serveur Discord : compteur de membres, salons vocaux temporaires et messages d'accueil.
      </p>
    </div>
  </div>

  <form on:submit|preventDefault={handleSave}>
    <!-- Member Counter Card -->
    <Card id="general-counter" title="Compteur de Membres dans un Salon" subtitle="Renomme automatiquement un salon avec le compte exact de membres" icon={Users}>
      <div class="grid-2">
        <div class="form-group">
          <label for="member_counter_channel_id">Salon du Compteur</label>
          <select id="member_counter_channel_id" bind:value={config.member_counter_channel_id}>
            <option value="">-- Aucun (Désactivé) --</option>
            <optgroup label="Salons Vocaux (Recommandé)">
              {#each channels.voice as v}
                <option value={v.id}>🔊 {v.name}</option>
              {/each}
            </optgroup>
            <optgroup label="Salons Textuels">
              {#each channels.text.filter(c => !c.forum) as c}
                <option value={c.id}># {c.name}</option>
              {/each}
            </optgroup>
            <optgroup label="Catégories">
              {#each channels.categories as cat}
                <option value={cat.id}>📁 {cat.name}</option>
              {/each}
            </optgroup>
          </select>
        </div>

        <div class="form-group">
          <label for="member_counter_template">Format du Nom du Salon</label>
          <input
            type="text"
            id="member_counter_template"
            bind:value={config.member_counter_template}
            placeholder={"👥・Membres : {count}"}
          />
          <p class="help-text">Variables disponibles : <code>X</code>, <code>{'{count}'}</code>, <code>{'{members}'}</code></p>
        </div>
      </div>
    </Card>

    <!-- Join-to-Create Voice Card -->
    <Card id="general-voice" title="Salons Vocaux Temporaires (Join-to-Create)" subtitle="Crée automatiquement un salon vocal temporaire lorsqu'un membre rejoint le salon déclencheur" icon={Volume2}>
      <div class="grid-2">
        <div class="form-group">
          <label for="voice_creator_channel_id">Salon Déclencheur (Vocal)</label>
          <select id="voice_creator_channel_id" bind:value={config.voice_creator_channel_id}>
            <option value="">-- Désactivé --</option>
            {#each channels.voice as v}
              <option value={v.id}>🔊 {v.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="voice_creator_category_id">Catégorie des Salons Créés</label>
          <select id="voice_creator_category_id" bind:value={config.voice_creator_category_id}>
            <option value="">-- Même catégorie que le salon déclencheur --</option>
            {#each channels.categories as cat}
              <option value={cat.id}>📁 {cat.name}</option>
            {/each}
          </select>
        </div>
      </div>
    </Card>

    <!-- Welcome & Leave Messages -->
    <Card id="general-messages" title="Messages de Bienvenue & Départ" subtitle="Annonces automatiques lors des arrivées et départs" icon={MessageSquare}>
      <div class="grid-2">
        <div class="form-group">
          <label for="welcome_channel_id">Salon de Bienvenue</label>
          <select id="welcome_channel_id" bind:value={config.welcome_channel_id}>
            <option value="">-- Désactivé --</option>
            {#each channels.text.filter(c => !c.forum) as c}
              <option value={c.id}># {c.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="leave_channel_id">Salon de Départ</label>
          <select id="leave_channel_id" bind:value={config.leave_channel_id}>
            <option value="">-- Désactivé --</option>
            {#each channels.text.filter(c => !c.forum) as c}
              <option value={c.id}># {c.name}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="welcome_message_template">Template Message de Bienvenue</label>
        <input
          type="text"
          id="welcome_message_template"
          bind:value={config.welcome_message_template}
          placeholder={"Bienvenue {user} sur {server} !"}
        />
        <p class="help-text">Variables : <code>{'{user}'}</code>, <code>{'{username}'}</code>, <code>{'{server}'}</code>, <code>{'{memberCount}'}</code></p>
      </div>

      <div class="form-group">
        <label for="leave_message_template">Template Message de Départ</label>
        <input
          type="text"
          id="leave_message_template"
          bind:value={config.leave_message_template}
          placeholder={"{username} a quitté le serveur."}
        />
      </div>
    </Card>

    <button type="submit" class="btn btn-primary" style="width:260px;" disabled={saving}>
      <Save size={16} />
      <span>{saving ? 'Enregistrement...' : 'Sauvegarder les Réglages'}</span>
    </button>
  </form>
</div>
