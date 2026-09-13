<script>
  import { toasts } from '../stores/toast';
</script>

<div class="toast-container" role="status" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast-{toast.type}">
      {#if toast.type === 'success'}
        <span>✓</span>
      {:else}
        <span>⚠️</span>
      {/if}
      <span>{toast.message}</span>
    </div>
  {/each}
</div>

