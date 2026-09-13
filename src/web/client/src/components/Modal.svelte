<script>
  import { createEventDispatcher } from 'svelte';
  export let title = '';
  export let isOpen = false;
  export let open = false;

  $: active = isOpen || open;

  const dispatch = createEventDispatcher();

  function close() {
    isOpen = false;
    open = false;
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && active) {
      close();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if active}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" on:click={close} role="presentation">
    <div class="modal-content" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-header">
        <h3>{title}</h3>
        <button class="close-btn" on:click={close} aria-label="Fermer">✕</button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-primary);
  }
  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  .close-btn:hover {
    color: var(--text-primary);
    background-color: var(--surface-hover);
  }
  .modal-body {
    padding: 1.5rem;
  }
</style>
