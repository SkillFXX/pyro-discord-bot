<script>
  import { onMount } from 'svelte';
  import { 
    MessageSquare, 
    LayoutTemplate, 
    FileText, 
    Send, 
    Plus, 
    Pencil, 
    Trash2, 
    RefreshCw, 
    ExternalLink, 
    CheckCircle, 
    AlertCircle, 
    Clock, 
    Eye, 
    X, 
    Hash, 
    Save, 
    ChevronDown, 
    ChevronUp, 
    HelpCircle,
    Copy,
    Inbox
  } from '@lucide/svelte';
  import Card from '../components/Card.svelte';
  import { 
    dashboardData, 
    fetchCustomMessages, 
    createCustomMessage, 
    updateCustomMessage, 
    deleteCustomMessage, 
    sendCustomMessage,
    fetchFormSubmissions,
    deleteFormSubmission
  } from '../stores/data';
  import { showToast } from '../stores/toast';

  let messages = [];
  let loading = true;
  let activeFilter = 'all'; // 'all' | 'text' | 'embed' | 'form'
  let searchQuery = '';

  // Editor State
  let showEditor = false;
  let editingId = null;
  let isSaving = false;

  // Editor Form Fields
  let formName = '';
  let formType = 'embed'; // 'text' | 'embed' | 'form'
  let formChannelId = '';
  let formContent = '';
  
  // Embed Data
  let embedColor = '#ef490b';
  let embedTitle = '';
  let embedUrl = '';
  let embedDescription = '';
  let embedAuthorName = '';
  let embedAuthorIcon = '';
  let embedAuthorUrl = '';
  let embedThumbnail = '';
  let embedImage = '';
  let embedFooterText = '';
  let embedFooterIcon = '';
  let embedTimestamp = true;
  let embedFields = [];

  // Form (Modal) Data
  let buttonLabel = 'Remplir le formulaire';
  let buttonStyle = 'Primary'; // Primary, Secondary, Success, Danger
  let buttonEmoji = '📝';
  let modalTitle = 'Formulaire de contact';
  let submissionsChannelId = '';
  let mentionRoleId = '';
  let thankYouMessage = '✅ Votre formulaire a bien été envoyé ! Merci pour votre réponse.';
  let formQuestions = [
    { label: 'Votre pseudo ou prénom', style: 'short', placeholder: 'ex: Alex', required: true },
    { label: 'Votre message ou candidature', style: 'paragraph', placeholder: 'Détaillez votre demande ici...', required: true }
  ];

  // Submissions Viewer State
  let showSubmissionsModal = false;
  let viewingForm = null;
  let submissions = [];
  let loadingSubmissions = false;

  // Confirm delete modal
  let deleteTarget = null;

  const colorPresets = [
    { name: 'Pyro Orange', color: '#ef490b' },
    { name: 'Discord Blurple', color: '#5865f2' },
    { name: 'Vert Émeraude', color: '#2ecc71' },
    { name: 'Rouge Rubis', color: '#e74c3c' },
    { name: 'Or / Ambre', color: '#f1c40f' },
    { name: 'Cyan / Ciel', color: '#00bcd4' },
    { name: 'Violet Sombre', color: '#9b59b6' },
  ];

  $: textChannels = ($dashboardData.channels && $dashboardData.channels.text) || [];
  $: serverRoles = $dashboardData.roles || [];

  onMount(async () => {
    await loadMessages();
  });

  async function loadMessages() {
    loading = true;
    messages = await fetchCustomMessages();
    loading = false;
  }

  function getChannelName(channelId) {
    const ch = textChannels.find((c) => c.id === channelId);
    return ch ? `#${ch.name}` : channelId ? `#${channelId}` : 'Aucun salon';
  }

  function getRoleName(roleId) {
    const r = serverRoles.find((role) => role.id === roleId);
    return r ? `@${r.name}` : roleId;
  }

  $: filteredMessages = messages.filter((m) => {
    if (activeFilter !== 'all' && m.type !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = m.name && m.name.toLowerCase().includes(q);
      const matchChan = getChannelName(m.channelId).toLowerCase().includes(q);
      return matchName || matchChan;
    }
    return true;
  });

  function openCreateModal(type = 'embed') {
    editingId = null;
    formName = type === 'form' ? 'Nouveau Formulaire' : type === 'text' ? 'Nouveau Message' : 'Nouvel Embed';
    formType = type;
    formChannelId = textChannels.length > 0 ? textChannels[0].id : '';
    formContent = '';
    
    // Reset Embed
    embedColor = '#ef490b';
    embedTitle = '';
    embedUrl = '';
    embedDescription = '';
    embedAuthorName = '';
    embedAuthorIcon = '';
    embedAuthorUrl = '';
    embedThumbnail = '';
    embedImage = '';
    embedFooterText = '';
    embedFooterIcon = '';
    embedTimestamp = true;
    embedFields = [];

    // Reset Form
    buttonLabel = 'Remplir le formulaire';
    buttonStyle = 'Primary';
    buttonEmoji = '📝';
    modalTitle = 'Formulaire de contact';
    submissionsChannelId = textChannels.length > 0 ? textChannels[0].id : '';
    mentionRoleId = '';
    thankYouMessage = '✅ Votre formulaire a bien été envoyé ! Merci pour votre réponse.';
    formQuestions = [
      { label: 'Votre pseudo ou prénom', style: 'short', placeholder: 'ex: Alex', required: true },
      { label: 'Votre message ou motivation', style: 'paragraph', placeholder: 'Détaillez votre demande ici...', required: true }
    ];

    showEditor = true;
  }

  function openEditModal(message) {
    editingId = message.id;
    formName = message.name || '';
    formType = message.type || 'embed';
    formChannelId = message.channelId || '';
    formContent = message.content || '';

    let emb = {};
    try {
      emb = typeof message.embedData === 'string' ? JSON.parse(message.embedData || '{}') : (message.embedData || {});
    } catch {
      emb = {};
    }

    embedColor = emb.color || '#ef490b';
    embedTitle = emb.title || '';
    embedUrl = emb.url || '';
    embedDescription = emb.description || '';
    embedAuthorName = (emb.author && emb.author.name) || '';
    embedAuthorIcon = (emb.author && emb.author.iconURL) || '';
    embedAuthorUrl = (emb.author && emb.author.url) || '';
    embedThumbnail = emb.thumbnail || '';
    embedImage = emb.image || '';
    embedFooterText = (emb.footer && emb.footer.text) || '';
    embedFooterIcon = (emb.footer && emb.footer.iconURL) || '';
    embedTimestamp = emb.timestamp !== false;
    embedFields = Array.isArray(emb.fields) ? [...emb.fields] : [];

    let frm = {};
    try {
      frm = typeof message.formData === 'string' ? JSON.parse(message.formData || '{}') : (message.formData || {});
    } catch {
      frm = {};
    }

    buttonLabel = frm.buttonLabel || 'Remplir le formulaire';
    buttonStyle = frm.buttonStyle || 'Primary';
    buttonEmoji = frm.buttonEmoji || '📝';
    modalTitle = frm.modalTitle || 'Formulaire';
    submissionsChannelId = frm.submissionsChannelId || formChannelId;
    mentionRoleId = frm.mentionRoleId || '';
    thankYouMessage = frm.thankYouMessage || '✅ Votre formulaire a bien été envoyé !';
    formQuestions = Array.isArray(frm.fields) && frm.fields.length > 0 
      ? [...frm.fields] 
      : [{ label: 'Question 1', style: 'paragraph', placeholder: 'Votre réponse...', required: true }];

    showEditor = true;
  }

  function addEmbedField() {
    if (embedFields.length >= 25) {
      showToast('Limite Discord atteinte : 25 champs maximum par embed.', 'warning');
      return;
    }
    embedFields = [...embedFields, { name: 'Titre du champ', value: 'Valeur du champ', inline: false }];
  }

  function removeEmbedField(index) {
    embedFields = embedFields.filter((_, i) => i !== index);
  }

  function addFormQuestion() {
    if (formQuestions.length >= 5) {
      showToast('Limite Discord atteinte : 5 questions maximum par modal.', 'warning');
      return;
    }
    formQuestions = [
      ...formQuestions,
      { label: `Question ${formQuestions.length + 1}`, style: 'paragraph', placeholder: 'Votre réponse...', required: true }
    ];
  }

  function removeFormQuestion(index) {
    if (formQuestions.length <= 1) {
      showToast('Un formulaire doit comporter au moins une question.', 'warning');
      return;
    }
    formQuestions = formQuestions.filter((_, i) => i !== index);
  }

  async function handleSave(sendImmediately = true) {
    if (!formName.trim()) {
      showToast('Veuillez donner un nom à votre message.', 'warning');
      return;
    }
    if (!formChannelId) {
      showToast('Veuillez sélectionner un salon de destination.', 'warning');
      return;
    }
    if (formType === 'text' && !formContent.trim()) {
      showToast('Le contenu du message classique ne peut pas être vide.', 'warning');
      return;
    }
    if (formType === 'form') {
      if (!submissionsChannelId) {
        showToast('Veuillez sélectionner un salon pour la réception des réponses.', 'warning');
        return;
      }
      if (formQuestions.length === 0) {
        showToast('Veuillez ajouter au moins une question au formulaire.', 'warning');
        return;
      }
    }

    isSaving = true;

    const embedPayload = {
      color: embedColor,
      title: embedTitle.trim() || undefined,
      url: embedUrl.trim() || undefined,
      description: embedDescription.trim() || undefined,
      author: embedAuthorName.trim() ? {
        name: embedAuthorName.trim(),
        iconURL: embedAuthorIcon.trim() || undefined,
        url: embedAuthorUrl.trim() || undefined,
      } : undefined,
      thumbnail: embedThumbnail.trim() || undefined,
      image: embedImage.trim() || undefined,
      footer: embedFooterText.trim() ? {
        text: embedFooterText.trim(),
        iconURL: embedFooterIcon.trim() || undefined,
      } : undefined,
      timestamp: embedTimestamp,
      fields: embedFields.filter(f => f.name.trim() && f.value.trim()),
    };

    const formPayload = {
      buttonLabel: buttonLabel.trim() || 'Remplir le formulaire',
      buttonStyle,
      buttonEmoji: buttonEmoji.trim() || undefined,
      modalTitle: modalTitle.trim() || 'Formulaire',
      submissionsChannelId,
      mentionRoleId: mentionRoleId || undefined,
      thankYouMessage: thankYouMessage.trim() || undefined,
      fields: formQuestions.map((q, idx) => ({
        id: `q_${idx + 1}`,
        label: q.label.trim() || `Question ${idx + 1}`,
        style: q.style || 'paragraph',
        placeholder: q.placeholder?.trim() || undefined,
        required: q.required !== false,
      })),
    };

    const payload = {
      name: formName.trim(),
      type: formType,
      channelId: formChannelId,
      content: formContent.trim(),
      embedData: embedPayload,
      formData: formPayload,
      sendImmediately,
      updateDiscord: true,
    };

    let result = null;
    if (editingId) {
      result = await updateCustomMessage(editingId, payload);
    } else {
      result = await createCustomMessage(payload);
    }

    isSaving = false;

    if (result) {
      showEditor = false;
      await loadMessages();
    }
  }

  async function handleSendNow(msg) {
    const res = await sendCustomMessage(msg.id);
    if (res) {
      await loadMessages();
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const ok = await deleteCustomMessage(deleteTarget.id);
    if (ok) {
      deleteTarget = null;
      await loadMessages();
    }
  }

  async function openSubmissions(msg) {
    viewingForm = msg;
    loadingSubmissions = true;
    showSubmissionsModal = true;
    submissions = await fetchFormSubmissions(msg.id);
    loadingSubmissions = false;
  }

  async function handleDeleteSubmission(subId) {
    if (!viewingForm) return;
    const ok = await deleteFormSubmission(viewingForm.id, subId);
    if (ok) {
      submissions = submissions.filter((s) => s.id !== subId);
      // update count locally
      const idx = messages.findIndex((m) => m.id === viewingForm.id);
      if (idx !== -1) {
        messages[idx].submissionsCount = Math.max(0, (messages[idx].submissionsCount || 1) - 1);
      }
    }
  }

  function formatDiscordMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br/>');
  }
</script>

<div class="tab-content-wrapper">
  <!-- Page Header -->
  <div class="page-title-row">
    <div>
      <h2><MessageSquare size={24} class="title-icon" /> Messages, Embeds & Formulaires</h2>
      <p class="section-desc">
        Créez, publiez et modifiez des annonces, des règles en embed et des formulaires interactifs (candidatures, suggestions) sur vos salons Discord.
      </p>
    </div>
    <div class="header-actions">
      <button class="btn btn-primary" on:click={() => openCreateModal('embed')}>
        <Plus size={16} />
        <span>Créer un Message / Formulaire</span>
      </button>
    </div>
  </div>

  <!-- Filters & Search Toolbar -->
  <div class="toolbar-card">
    <div class="filter-tabs">
      <button 
        class="filter-tab-btn" 
        class:active={activeFilter === 'all'} 
        on:click={() => (activeFilter = 'all')}
      >
        Tous ({messages.length})
      </button>
      <button 
        class="filter-tab-btn" 
        class:active={activeFilter === 'text'} 
        on:click={() => (activeFilter = 'text')}
      >
        <MessageSquare size={14} />
        Classiques
      </button>
      <button 
        class="filter-tab-btn" 
        class:active={activeFilter === 'embed'} 
        on:click={() => (activeFilter = 'embed')}
      >
        <LayoutTemplate size={14} />
        Embeds
      </button>
      <button 
        class="filter-tab-btn" 
        class:active={activeFilter === 'form'} 
        on:click={() => (activeFilter = 'form')}
      >
        <FileText size={14} />
        Formulaires
      </button>
    </div>

    <div class="search-box">
      <input
        type="text"
        placeholder="Rechercher par nom ou salon..."
        bind:value={searchQuery}
        class="form-control search-input"
      />
      {#if searchQuery}
        <button class="clear-search" on:click={() => (searchQuery = '')}>
          <X size={14} />
        </button>
      {/if}
    </div>
  </div>

  <!-- Messages List -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Chargement des messages...</p>
    </div>
  {:else if filteredMessages.length === 0}
    <div class="empty-state-card">
      <Inbox size={48} class="empty-icon text-muted" />
      <h3>Aucun message trouvé</h3>
      <p>
        {#if searchQuery || activeFilter !== 'all'}
          Aucun résultat pour les critères sélectionnés.
        {:else}
          Vous n'avez pas encore créé de message ou formulaire personnalisé.
        {/if}
      </p>
      {#if !searchQuery && activeFilter === 'all'}
        <div class="empty-quick-actions">
          <button class="btn btn-secondary" on:click={() => openCreateModal('text')}>
            <MessageSquare size={16} /> Message Classique
          </button>
          <button class="btn btn-primary" on:click={() => openCreateModal('embed')}>
            <LayoutTemplate size={16} /> Embed Riche
          </button>
          <button class="btn btn-secondary" on:click={() => openCreateModal('form')}>
            <FileText size={16} /> Formulaire Interactif
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="messages-grid">
      {#each filteredMessages as msg (msg.id)}
        <div class="message-item-card">
          <div class="item-header">
            <div class="item-type-badge type-{msg.type}">
              {#if msg.type === 'text'}
                <MessageSquare size={14} />
                <span>Classique</span>
              {:else if msg.type === 'embed'}
                <LayoutTemplate size={14} />
                <span>Embed</span>
              {:else}
                <FileText size={14} />
                <span>Formulaire</span>
              {/if}
            </div>

            <div class="status-indicator">
              {#if msg.status === 'sent'}
                <span class="status-badge sent" title="Message en ligne sur Discord">
                  <CheckCircle size={12} />
                  <span>Publié</span>
                </span>
              {:else if msg.status === 'error'}
                <span class="status-badge error" title={msg.lastError || "Erreur lors de l'envoi"}>
                  <AlertCircle size={12} />
                  <span>Erreur</span>
                </span>
              {:else}
                <span class="status-badge draft" title="Non publié sur Discord">
                  <Clock size={12} />
                  <span>Brouillon</span>
                </span>
              {/if}
            </div>
          </div>

          <div class="item-body">
            <h3 class="item-title" title={msg.name}>{msg.name}</h3>
            
            <div class="item-meta-row">
              <span class="channel-chip">
                <Hash size={13} />
                {getChannelName(msg.channelId)}
              </span>

              {#if msg.type === 'form'}
                <button 
                  class="submissions-chip" 
                  on:click={() => openSubmissions(msg)}
                  title="Voir les réponses reçues pour ce formulaire"
                >
                  <Inbox size={13} />
                  <span>{msg.submissionsCount || 0} réponse(s)</span>
                </button>
              {/if}
            </div>

            {#if msg.type === 'text'}
              <p class="item-preview-text">
                {msg.content || 'Pas de contenu texte'}
              </p>
            {:else}
              {@const emb = typeof msg.embedData === 'string' ? JSON.parse(msg.embedData || '{}') : msg.embedData}
              <div class="item-mini-embed" style="border-left-color: {emb?.color || '#ef490b'};">
                <span class="mini-embed-title">{emb?.title || msg.name}</span>
                {#if emb?.description}
                  <p class="mini-embed-desc">{emb.description.slice(0, 100)}{emb.description.length > 100 ? '...' : ''}</p>
                {/if}
              </div>
            {/if}
          </div>

          <div class="item-footer">
            <span class="item-date">
              Mis à jour le {new Date(msg.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>

            <div class="item-actions">
              {#if msg.type === 'form'}
                <button 
                  class="btn-icon" 
                  title="Voir les soumissions" 
                  on:click={() => openSubmissions(msg)}
                >
                  <Inbox size={15} />
                </button>
              {/if}

              <button 
                class="btn-icon" 
                title="Renvoyer / Mettre à jour sur Discord" 
                on:click={() => handleSendNow(msg)}
              >
                <RefreshCw size={15} />
              </button>

              <button 
                class="btn-icon" 
                title="Modifier" 
                on:click={() => openEditModal(msg)}
              >
                <Pencil size={15} />
              </button>

              <button 
                class="btn-icon btn-icon-danger" 
                title="Supprimer du bot et de Discord" 
                on:click={() => (deleteTarget = msg)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- ========================================================
     MODAL ÉDITEUR VISUEL DE MESSAGE / EMBED / FORMULAIRE
     ======================================================== -->
{#if showEditor}
  <div 
    class="modal-overlay" 
    role="presentation"
    on:click|self={() => (showEditor = false)}
    on:keydown={(e) => e.key === 'Escape' && (showEditor = false)}
  >
    <div class="modal-card editor-modal-card">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <span class="modal-icon-badge">
            {#if formType === 'text'}
              <MessageSquare size={18} />
            {:else if formType === 'embed'}
              <LayoutTemplate size={18} />
            {:else}
              <FileText size={18} />
            {/if}
          </span>
          <div>
            <h3>{editingId ? 'Modifier le message' : 'Nouveau message ou formulaire'}</h3>
            <p class="modal-sub">Configurez les champs puis publiez ou mettez à jour directement sur Discord.</p>
          </div>
        </div>
        <button class="btn-close" on:click={() => (showEditor = false)} aria-label="Fermer">
          <X size={18} />
        </button>
      </div>

      <div class="editor-grid">
        <!-- LEFT COLUMN: SETTINGS FORM -->
        <div class="editor-form-col">
          <!-- 1. Type Selector -->
          <div class="form-section">
            <label class="section-label">Type de publication</label>
            <div class="type-picker">
              <button
                type="button"
                class="type-btn"
                class:active={formType === 'text'}
                on:click={() => (formType = 'text')}
              >
                <MessageSquare size={16} />
                <div>
                  <span class="type-btn-title">Message classique</span>
                  <span class="type-btn-desc">Texte markdown brut</span>
                </div>
              </button>

              <button
                type="button"
                class="type-btn"
                class:active={formType === 'embed'}
                on:click={() => (formType = 'embed')}
              >
                <LayoutTemplate size={16} />
                <div>
                  <span class="type-btn-title">Embed Riche</span>
                  <span class="type-btn-desc">Couleur, titre, images & champs</span>
                </div>
              </button>

              <button
                type="button"
                class="type-btn"
                class:active={formType === 'form'}
                on:click={() => (formType = 'form')}
              >
                <FileText size={16} />
                <div>
                  <span class="type-btn-title">Formulaire Modal</span>
                  <span class="type-btn-desc">Embed + Bouton de questionnaire</span>
                </div>
              </button>
            </div>
          </div>

          <!-- 2. General Settings -->
          <div class="form-section">
            <label class="section-label">Informations générales</label>
            <div class="form-row">
              <div class="form-group flex-1">
                <label for="form_name">Nom interne</label>
                <input
                  id="form_name"
                  type="text"
                  bind:value={formName}
                  placeholder="ex: Règles du serveur, Recrutement Staff..."
                  class="form-control"
                />
              </div>

              <div class="form-group flex-1">
                <label for="form_channel">Salon d'envoi</label>
                <select id="form_channel" bind:value={formChannelId} class="form-control">
                  <option value="" disabled>Sélectionnez un salon textuel</option>
                  {#each textChannels as ch (ch.id)}
                    <option value={ch.id}>#{ch.name}</option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- Plain text content (optional above embed, required for text type) -->
            <div class="form-group">
              <label for="form_content">
                {formType === 'text' ? 'Contenu du message (Markdown)' : 'Texte au-dessus de l\'embed (Optionnel)'}
              </label>
              <textarea
                id="form_content"
                bind:value={formContent}
                rows={formType === 'text' ? 5 : 2}
                placeholder={formType === 'text' ? 'Votre texte avec **gras**, *italique*, [liens](https://...)...' : 'Mention optionnelle comme @everyone ou texte court...'}
                class="form-control"
              ></textarea>
            </div>
          </div>

          <!-- 3. Embed Builder (if embed or form) -->
          {#if formType === 'embed' || formType === 'form'}
            <div class="form-section">
              <label class="section-label">Personnalisation de l'Embed</label>

              <!-- Color Picker -->
              <div class="form-group">
                <label>Couleur de la bordure</label>
                <div class="color-picker-row">
                  <input type="color" bind:value={embedColor} class="color-input" />
                  <input type="text" bind:value={embedColor} class="form-control color-hex-input" placeholder="#ef490b" />
                  <div class="preset-colors">
                    {#each colorPresets as preset}
                      <button
                        type="button"
                        class="preset-color-dot"
                        style="background-color: {preset.color};"
                        class:selected={embedColor.toLowerCase() === preset.color.toLowerCase()}
                        on:click={() => (embedColor = preset.color)}
                        title={preset.name}
                        aria-label={preset.name}
                      ></button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Author -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="author_name">Auteur (Nom)</label>
                  <input id="author_name" type="text" bind:value={embedAuthorName} placeholder="ex: Pyro Bot ou Nom de Guilde" class="form-control" />
                </div>
                <div class="form-group flex-1">
                  <label for="author_icon">Auteur (URL Icône)</label>
                  <input id="author_icon" type="url" bind:value={embedAuthorIcon} placeholder="https://..." class="form-control" />
                </div>
              </div>

              <!-- Title & URL -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="embed_title">Titre de l'embed</label>
                  <input id="embed_title" type="text" bind:value={embedTitle} placeholder="ex: Recrutements de Modérateurs Ouverts !" class="form-control" />
                </div>
                <div class="form-group flex-1">
                  <label for="embed_url">Lien du titre (URL)</label>
                  <input id="embed_url" type="url" bind:value={embedUrl} placeholder="https://votresite.com" class="form-control" />
                </div>
              </div>

              <!-- Description -->
              <div class="form-group">
                <label for="embed_desc">Description (Markdown supporté)</label>
                <textarea
                  id="embed_desc"
                  bind:value={embedDescription}
                  rows={5}
                  placeholder="Rédigez la description avec **gras**, *italique*, `code`, puces ou retours à la ligne..."
                  class="form-control"
                ></textarea>
              </div>

              <!-- Media (Thumbnail & Large Image) -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="embed_thumb">Miniature / Thumbnail (URL)</label>
                  <input id="embed_thumb" type="url" bind:value={embedThumbnail} placeholder="https://... (petite image en haut à droite)" class="form-control" />
                </div>
                <div class="form-group flex-1">
                  <label for="embed_img">Grande image / Bannière (URL)</label>
                  <input id="embed_img" type="url" bind:value={embedImage} placeholder="https://... (grande image en bas)" class="form-control" />
                </div>
              </div>

              <!-- Footer & Timestamp -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="embed_footer">Pied de page (Texte)</label>
                  <input id="embed_footer" type="text" bind:value={embedFooterText} placeholder="ex: Équipe Pyro • 2026" class="form-control" />
                </div>
                <div class="form-group flex-1">
                  <label for="embed_footer_icon">Icône du pied de page (URL)</label>
                  <input id="embed_footer_icon" type="url" bind:value={embedFooterIcon} placeholder="https://..." class="form-control" />
                </div>
              </div>

              <div class="form-group checkbox-group">
                <label class="custom-checkbox">
                  <input type="checkbox" bind:checked={embedTimestamp} />
                  <span>Afficher l'horodatage actuel (Timestamp)</span>
                </label>
              </div>

              <!-- Embed Fields -->
              <div class="fields-builder">
                <div class="fields-header">
                  <label class="section-label">Champs supplémentaires (Fields)</label>
                  <button type="button" class="btn btn-secondary btn-sm" on:click={addEmbedField}>
                    <Plus size={14} /> Ajouter un champ
                  </button>
                </div>

                {#if embedFields.length === 0}
                  <p class="hint-text">Aucun champ personnalisé ajouté. Cliquez sur "Ajouter un champ" si nécessaire.</p>
                {:else}
                  <div class="fields-list">
                    {#each embedFields as field, index}
                      <div class="field-item">
                        <div class="field-inputs">
                          <input type="text" bind:value={field.name} placeholder="Titre du champ" class="form-control form-control-sm" />
                          <textarea bind:value={field.value} rows={2} placeholder="Valeur / Texte du champ" class="form-control form-control-sm"></textarea>
                          <label class="custom-checkbox inline-check">
                            <input type="checkbox" bind:checked={field.inline} />
                            <span>En ligne (côte-à-côte)</span>
                          </label>
                        </div>
                        <button type="button" class="btn-icon btn-icon-danger" on:click={() => removeEmbedField(index)} title="Supprimer ce champ">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- 4. Form Configuration (Only if type === 'form') -->
          {#if formType === 'form'}
            <div class="form-section highlight-section">
              <label class="section-label">Paramètres du Formulaire Discord</label>

              <!-- Button Customization -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="btn_label">Texte du bouton</label>
                  <input id="btn_label" type="text" bind:value={buttonLabel} placeholder="ex: 📝 Postuler maintenant" class="form-control" />
                </div>

                <div class="form-group flex-1">
                  <label for="btn_style">Style du bouton</label>
                  <select id="btn_style" bind:value={buttonStyle} class="form-control">
                    <option value="Primary">Bleu (Primaire)</option>
                    <option value="Success">Vert (Succès)</option>
                    <option value="Secondary">Gris (Secondaire)</option>
                    <option value="Danger">Rouge (Danger)</option>
                  </select>
                </div>

                <div class="form-group" style="width: 90px;">
                  <label for="btn_emoji">Émoji</label>
                  <input id="btn_emoji" type="text" bind:value={buttonEmoji} placeholder="📝" class="form-control" />
                </div>
              </div>

              <!-- Destination for Submissions & Ping Role -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="sub_channel">Salon de réception des réponses</label>
                  <select id="sub_channel" bind:value={submissionsChannelId} class="form-control">
                    <option value="" disabled>Sélectionnez le salon privé / staff</option>
                    {#each textChannels as ch (ch.id)}
                      <option value={ch.id}>#{ch.name}</option>
                    {/each}
                  </select>
                </div>

                <div class="form-group flex-1">
                  <label for="mention_role">Rôle à mentionner à la soumission</label>
                  <select id="mention_role" bind:value={mentionRoleId} class="form-control">
                    <option value="">Aucune mention</option>
                    {#each serverRoles as role (role.id)}
                      <option value={role.id}>@{role.name}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <!-- Modal Popup Title & Thank-You Message -->
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="modal_title">Titre de la pop-up Discord (Modal)</label>
                  <input id="modal_title" type="text" maxlength={45} bind:value={modalTitle} placeholder="ex: Candidature Modérateur (max 45 car.)" class="form-control" />
                </div>
                <div class="form-group flex-1">
                  <label for="thank_msg">Message de remerciement (Privé au membre)</label>
                  <input id="thank_msg" type="text" bind:value={thankYouMessage} placeholder="ex: Merci, votre demande a été reçue !" class="form-control" />
                </div>
              </div>

              <!-- Questions Builder (Modal Text Inputs, max 5) -->
              <div class="questions-builder">
                <div class="fields-header">
                  <div>
                    <label class="section-label">Questions du formulaire ({formQuestions.length}/5)</label>
                    <p class="hint-text">Discord autorise jusqu'à 5 questions par formulaire interactif.</p>
                  </div>
                  {#if formQuestions.length < 5}
                    <button type="button" class="btn btn-secondary btn-sm" on:click={addFormQuestion}>
                      <Plus size={14} /> Ajouter une question
                    </button>
                  {/if}
                </div>

                <div class="questions-list">
                  {#each formQuestions as q, index}
                    <div class="question-item">
                      <div class="question-num">{index + 1}</div>
                      <div class="question-fields">
                        <div class="form-row">
                          <div class="form-group flex-1">
                            <label>Intitulé de la question</label>
                            <input type="text" maxlength={45} bind:value={q.label} placeholder="ex: Quel est votre âge ?" class="form-control form-control-sm" />
                          </div>
                          <div class="form-group" style="width: 170px;">
                            <label>Type de réponse</label>
                            <select bind:value={q.style} class="form-control form-control-sm">
                              <option value="short">Ligne courte</option>
                              <option value="paragraph">Paragraphe long</option>
                            </select>
                          </div>
                        </div>

                        <div class="form-row">
                          <div class="form-group flex-1">
                            <input type="text" maxlength={100} bind:value={q.placeholder} placeholder="Texte indicatif (placeholder)..." class="form-control form-control-sm" />
                          </div>
                          <label class="custom-checkbox inline-check" style="margin-bottom: 0;">
                            <input type="checkbox" bind:checked={q.required} />
                            <span>Obligatoire</span>
                          </label>
                        </div>
                      </div>

                      <button type="button" class="btn-icon btn-icon-danger" on:click={() => removeFormQuestion(index)} title="Supprimer cette question">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- RIGHT COLUMN: LIVE DISCORD PREVIEW -->
        <div class="editor-preview-col">
          <div class="preview-sticky-wrap">
            <div class="preview-header">
              <Eye size={16} />
              <span>Aperçu Discord en direct</span>
            </div>

            <!-- Realistic Discord Chat Container -->
            <div class="discord-chat-container">
              <div class="discord-message">
                <!-- Avatar -->
                <img src={$dashboardData.bot?.avatarUrl || '/icon.svg'} alt="Bot" class="discord-avatar" />

                <div class="discord-message-body">
                  <!-- Header: Bot Name, Tag, Time -->
                  <div class="discord-message-header">
                    <span class="discord-username">{$dashboardData.bot?.username || 'Pyro'}</span>
                    <span class="discord-bot-badge">BOT</span>
                    <span class="discord-timestamp">Aujourd'hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  <!-- Text content if specified -->
                  {#if formContent.trim()}
                    <div class="discord-text-content">
                      {@html formatDiscordMarkdown(formContent)}
                    </div>
                  {/if}

                  <!-- Embed Box -->
                  {#if formType === 'embed' || formType === 'form'}
                    <div class="discord-embed" style="border-left-color: {embedColor};">
                      <!-- Embed Author -->
                      {#if embedAuthorName.trim()}
                        <div class="discord-embed-author">
                          {#if embedAuthorIcon.trim()}
                            <img src={embedAuthorIcon} alt="author" class="discord-author-icon" />
                          {/if}
                          <span>{embedAuthorName}</span>
                        </div>
                      {/if}

                      <!-- Title & Thumbnail -->
                      <div class="discord-title-thumb-row">
                        <div class="discord-title-col">
                          {#if embedTitle.trim()}
                            <div class="discord-embed-title">
                              {#if embedUrl.trim()}
                                <a href={embedUrl} target="_blank" rel="noreferrer">{embedTitle}</a>
                              {:else}
                                {embedTitle}
                              {/if}
                            </div>
                          {/if}

                          <!-- Description -->
                          {#if embedDescription.trim()}
                            <div class="discord-embed-desc">
                              {@html formatDiscordMarkdown(embedDescription)}
                            </div>
                          {/if}
                        </div>

                        {#if embedThumbnail.trim()}
                          <img src={embedThumbnail} alt="thumbnail" class="discord-embed-thumb" />
                        {/if}
                      </div>

                      <!-- Fields -->
                      {#if embedFields.length > 0}
                        <div class="discord-embed-fields">
                          {#each embedFields as field}
                            <div class="discord-field" class:inline={field.inline}>
                              <span class="field-title">{field.name || 'Champ'}</span>
                              <span class="field-value">{@html formatDiscordMarkdown(field.value || 'Valeur')}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}

                      <!-- Large Image -->
                      {#if embedImage.trim()}
                        <div class="discord-image-wrapper">
                          <img src={embedImage} alt="banniere" class="discord-embed-image" />
                        </div>
                      {/if}

                      <!-- Footer & Timestamp -->
                      {#if embedFooterText.trim() || embedTimestamp}
                        <div class="discord-embed-footer">
                          {#if embedFooterIcon.trim()}
                            <img src={embedFooterIcon} alt="footer" class="discord-footer-icon" />
                          {/if}
                          <span>{embedFooterText}</span>
                          {#if embedFooterText.trim() && embedTimestamp}
                            <span class="bullet">•</span>
                          {/if}
                          {#if embedTimestamp}
                            <span>Aujourd'hui à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <!-- Action Button for Form -->
                  {#if formType === 'form'}
                    <div class="discord-action-row">
                      <button type="button" class="discord-btn btn-style-{buttonStyle.toLowerCase()}">
                        {#if buttonEmoji.trim()}
                          <span class="btn-emoji">{buttonEmoji}</span>
                        {/if}
                        <span>{buttonLabel || 'Remplir le formulaire'}</span>
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            <div class="preview-notice">
              <HelpCircle size={14} />
              <span>Ceci est une simulation fidèle de l'affichage final dans le salon Discord sélectionné.</span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => (showEditor = false)} disabled={isSaving}>
          Annuler
        </button>

        <button class="btn btn-secondary" on:click={() => handleSave(false)} disabled={isSaving}>
          <Save size={16} />
          <span>Enregistrer sans publier</span>
        </button>

        <button class="btn btn-primary" on:click={() => handleSave(true)} disabled={isSaving}>
          <Send size={16} />
          <span>{editingId ? 'Mettre à jour sur Discord' : 'Enregistrer et publier'}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ========================================================
     MODAL VOIR LES SOUMISSIONS DU FORMULAIRE
     ======================================================== -->
{#if showSubmissionsModal && viewingForm}
  <div 
    class="modal-overlay" 
    role="presentation"
    on:click|self={() => (showSubmissionsModal = false)}
    on:keydown={(e) => e.key === 'Escape' && (showSubmissionsModal = false)}
  >
    <div class="modal-card submissions-modal-card">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <span class="modal-icon-badge">
            <Inbox size={18} />
          </span>
          <div>
            <h3>Réponses reçues : {viewingForm.name}</h3>
            <p class="modal-sub">Consultez l'historique complet des réponses soumises par les membres.</p>
          </div>
        </div>
        <button class="btn-close" on:click={() => (showSubmissionsModal = false)} aria-label="Fermer">
          <X size={18} />
        </button>
      </div>

      <div class="submissions-modal-body">
        {#if loadingSubmissions}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Chargement des réponses...</p>
          </div>
        {:else if submissions.length === 0}
          <div class="empty-state-card">
            <Inbox size={40} class="text-muted" />
            <h4>Aucune réponse reçue pour le moment</h4>
            <p>Dès qu'un membre remplira ce formulaire sur Discord, sa réponse apparaîtra ici ainsi que dans votre salon privé.</p>
          </div>
        {:else}
          <div class="submissions-list">
            {#each submissions as sub (sub.id)}
              <div class="submission-card">
                <div class="sub-header">
                  <div class="sub-user-info">
                    <img 
                      src={sub.userAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'} 
                      alt={sub.username} 
                      class="sub-avatar"
                      on:error={(e) => (e.currentTarget.src = 'https://cdn.discordapp.com/embed/avatars/0.png')} 
                    />
                    <div>
                      <span class="sub-username">{sub.username}</span>
                      <span class="sub-userid">ID: {sub.userId}</span>
                    </div>
                  </div>

                  <div class="sub-meta">
                    <span class="sub-date">
                      {new Date(sub.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button class="btn-icon btn-icon-danger" on:click={() => handleDeleteSubmission(sub.id)} title="Supprimer cette réponse">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div class="sub-answers-grid">
                  {#each sub.answers as ans}
                    <div class="sub-answer-box">
                      <span class="ans-label">{ans.label}</span>
                      <p class="ans-value">{ans.value}</p>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => (showSubmissionsModal = false)}>
          Fermer
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ========================================================
     MODAL DE CONFIRMATION DE SUPPRESSION
     ======================================================== -->
{#if deleteTarget}
  <div 
    class="modal-overlay" 
    role="presentation"
    on:click|self={() => (deleteTarget = null)}
    on:keydown={(e) => e.key === 'Escape' && (deleteTarget = null)}
  >
    <div class="modal-card confirm-modal-card">
      <div class="confirm-body">
        <div class="warning-icon-wrap">
          <Trash2 size={24} />
        </div>
        <div>
          <h4>Supprimer définitivement ce message ?</h4>
          <p>
            Cette action supprimera le message "<strong>{deleteTarget.name}</strong>" de votre dashboard 
            {#if deleteTarget.messageId}
              ainsi que le message directement sur Discord ({getChannelName(deleteTarget.channelId)}).
            {/if}
          </p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => (deleteTarget = null)}>Annuler</button>
        <button class="btn btn-danger" on:click={confirmDelete}>Confirmer la suppression</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tab-content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .page-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  /* TOOLBAR */
  .toolbar-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.85rem 1.25rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .filter-tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-tab-btn:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
  }

  .filter-tab-btn.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #ffffff;
  }

  .search-box {
    position: relative;
    width: 280px;
  }

  .search-input {
    padding-right: 2rem;
    font-size: 0.85rem;
  }

  .clear-search {
    position: absolute;
    right: 0.6rem;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  /* MESSAGES GRID */
  .messages-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.25rem;
  }

  .message-item-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    transition: transform 0.15s, border-color 0.15s;
  }

  .message-item-card:hover {
    border-color: var(--border-strong);
    transform: translateY(-2px);
  }

  .item-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    font-size: 0.76rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .type-text {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .type-embed {
    background: rgba(239, 73, 11, 0.15);
    color: var(--primary);
    border: 1px solid var(--primary-border);
  }

  .type-form {
    background: rgba(34, 197, 94, 0.15);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.3);
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    font-weight: 500;
  }

  .status-badge.sent { color: #22c55e; }
  .status-badge.error { color: #ef4444; }
  .status-badge.draft { color: var(--text-muted); }

  .item-body {
    padding: 1.25rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .item-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .channel-chip, .submissions-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.55rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: 0.78rem;
  }

  .submissions-chip {
    color: #4ade80;
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.1);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .submissions-chip:hover {
    background: rgba(34, 197, 94, 0.2);
  }

  .item-preview-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .item-mini-embed {
    border-left: 3px solid var(--primary);
    background: var(--surface-2);
    padding: 0.6rem 0.85rem;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .mini-embed-title {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-primary);
    display: block;
    margin-bottom: 0.2rem;
  }

  .mini-embed-desc {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin: 0;
  }

  .item-footer {
    padding: 0.85rem 1.25rem;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .item-date {
    font-size: 0.74rem;
    color: var(--text-muted);
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-icon:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }

  .btn-icon-danger:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
    color: #ef4444;
  }

  /* MODALS */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .modal-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .editor-modal-card {
    max-width: 1250px;
  }

  .submissions-modal-card {
    max-width: 850px;
  }

  .confirm-modal-card {
    max-width: 480px;
  }

  .modal-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-title-wrap {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .modal-icon-badge {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: var(--primary-subtle);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-header h3 {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .modal-sub {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.35rem;
    border-radius: var(--radius-sm);
  }

  .btn-close:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
  }

  .modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  /* EDITOR LAYOUT */
  .editor-grid {
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    flex: 1;
    overflow-y: auto;
  }

  @media (max-width: 1024px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }
    .editor-preview-col {
      display: none;
    }
  }

  .editor-form-col {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
  }

  .form-section {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .highlight-section {
    border-color: rgba(34, 197, 94, 0.35);
    background: rgba(34, 197, 94, 0.03);
  }

  .section-label {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-primary);
    margin: 0;
  }

  .type-picker {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .type-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    cursor: pointer;
    text-align: left;
    color: var(--text-secondary);
    transition: all 0.15s ease;
  }

  .type-btn:hover {
    border-color: var(--border-strong);
    background: var(--surface-hover);
  }

  .type-btn.active {
    border-color: var(--primary);
    background: var(--primary-subtle);
    color: var(--primary);
  }

  .type-btn-title {
    display: block;
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  .type-btn-desc {
    display: block;
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .form-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .flex-1 {
    flex: 1;
    min-width: 200px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .form-control {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.55rem 0.8rem;
    color: var(--text-primary);
    font-size: 0.88rem;
    outline: none;
    transition: border-color 0.15s;
    font-family: inherit;
  }

  .form-control:focus {
    border-color: var(--primary);
  }

  .form-control-sm {
    padding: 0.4rem 0.6rem;
    font-size: 0.82rem;
  }

  .color-picker-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .color-input {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    padding: 2px;
  }

  .color-hex-input {
    width: 100px;
  }

  .preset-colors {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-left: 0.5rem;
  }

  .preset-color-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .preset-color-dot:hover {
    transform: scale(1.15);
  }

  .preset-color-dot.selected {
    border-color: #ffffff;
    box-shadow: 0 0 0 2px var(--border-strong);
  }

  .custom-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .fields-builder, .questions-builder {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    margin-top: 0.5rem;
  }

  .fields-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .field-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .field-inputs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .question-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.85rem;
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
  }

  .question-num {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--primary-subtle);
    color: var(--primary);
    font-weight: 700;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .question-fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* PREVIEW COLUMN */
  .editor-preview-col {
    background: #202225;
    border-left: 1px solid var(--border);
    padding: 1.5rem;
    overflow-y: auto;
  }

  .preview-sticky-wrap {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #b9bbbe;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .discord-chat-container {
    background: #313338;
    border-radius: 8px;
    padding: 1.25rem 1rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  .discord-message {
    display: flex;
    gap: 1rem;
  }

  .discord-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .discord-message-body {
    flex: 1;
    min-width: 0;
  }

  .discord-message-header {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }

  .discord-username {
    font-size: 0.95rem;
    font-weight: 600;
    color: #f2f3f5;
  }

  .discord-bot-badge {
    background: #5865f2;
    color: #ffffff;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .discord-timestamp {
    font-size: 0.72rem;
    color: #949ba4;
  }

  .discord-text-content {
    font-size: 0.92rem;
    color: #dbdee1;
    margin-bottom: 0.65rem;
    line-height: 1.45;
  }

  .discord-embed {
    background: #2b2d31;
    border-radius: 4px;
    border-left: 4px solid var(--primary);
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 520px;
  }

  .discord-embed-author {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: #f2f3f5;
  }

  .discord-author-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
  }

  .discord-title-thumb-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .discord-title-col {
    flex: 1;
    min-width: 0;
  }

  .discord-embed-title {
    font-size: 0.98rem;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 0.35rem;
  }

  .discord-embed-title a {
    color: #00a8fc;
    text-decoration: none;
  }

  .discord-embed-title a:hover {
    text-decoration: underline;
  }

  .discord-embed-desc {
    font-size: 0.85rem;
    color: #dbdee1;
    line-height: 1.4;
  }

  .discord-embed-thumb {
    width: 64px;
    height: 64px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .discord-embed-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    margin-top: 0.35rem;
  }

  .discord-field {
    grid-column: span 3;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .discord-field.inline {
    grid-column: span 1;
  }

  .field-title {
    font-size: 0.8rem;
    font-weight: 700;
    color: #f2f3f5;
  }

  .field-value {
    font-size: 0.82rem;
    color: #dbdee1;
  }

  .discord-image-wrapper {
    margin-top: 0.5rem;
    border-radius: 4px;
    overflow: hidden;
  }

  .discord-embed-image {
    width: 100%;
    max-height: 240px;
    object-fit: cover;
    display: block;
  }

  .discord-embed-footer {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.72rem;
    color: #949ba4;
    margin-top: 0.35rem;
  }

  .discord-footer-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
  }

  .bullet {
    opacity: 0.6;
  }

  .discord-action-row {
    margin-top: 0.75rem;
  }

  .discord-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 1rem;
    border-radius: 3px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #ffffff;
    border: none;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }

  .btn-style-primary { background-color: #5865f2; }
  .btn-style-secondary { background-color: #4e5058; }
  .btn-style-success { background-color: #248046; }
  .btn-style-danger { background-color: #da373c; }

  .preview-notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #949ba4;
    font-size: 0.76rem;
    line-height: 1.4;
  }

  /* SUBMISSIONS MODAL */
  .submissions-modal-body {
    padding: 1.5rem;
    max-height: 65vh;
    overflow-y: auto;
  }

  .submissions-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .submission-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .sub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sub-user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sub-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
  }

  .sub-username {
    font-weight: 700;
    color: var(--text-primary);
    font-size: 0.92rem;
    display: block;
  }

  .sub-userid {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: monospace;
  }

  .sub-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .sub-date {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .sub-answers-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .sub-answer-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.75rem 1rem;
  }

  .ans-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--primary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 0.25rem;
  }

  .ans-value {
    font-size: 0.88rem;
    color: var(--text-primary);
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* CONFIRM MODAL */
  .confirm-body {
    padding: 1.5rem;
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .warning-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .confirm-body h4 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .confirm-body p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .btn-danger {
    background: #ef4444;
    color: #ffffff;
    border: none;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .empty-state-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 3.5rem 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .empty-quick-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .hint-text {
    font-size: 0.78rem;
    color: var(--text-muted);
    margin: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3.5rem;
    gap: 1rem;
    color: var(--text-muted);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(239, 73, 11, 0.2);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
