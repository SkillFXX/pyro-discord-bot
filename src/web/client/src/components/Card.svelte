<script>
  export let title = '';
  export let subtitle = '';
  export let icon = null;
  export let id = '';
</script>

<div class="card" {id}>
  {#if title}
    <div class="card-header">
      <div>
        <h3 class="card-title">
          {#if icon}
            <svelte:component this={icon} size={18} color="var(--primary)" />
          {/if}
          <span>{title}</span>
        </h3>
        {#if subtitle}
          <p class="card-subtitle">{subtitle}</p>
        {/if}
      </div>
      <slot name="actions" />
    </div>
  {/if}
  <slot />
</div>

<style>
  .card {
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: none;
    scroll-margin-top: calc(72px + 1.5rem);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.25rem;
    gap: 1rem;
  }

  .card-title {
    font-family: var(--font-body);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
  }

  .card-subtitle {
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--text-secondary);
    margin-top: 0.25rem;
    margin-bottom: 0;
  }
</style>

