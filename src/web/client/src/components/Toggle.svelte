<script>
  export let label = '';
  export let description = '';
  export let checked = false;
  export let disabled = false;
  export let onChange = null;

  function toggle() {
    if (disabled) return;
    checked = !checked;
    if (onChange) onChange(checked);
  }
</script>

<div
  class="toggle-row"
  class:disabled
  on:click={toggle}
  role="button"
  tabindex="0"
  on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
>
  <div class="toggle-info">
    <span class="toggle-label">{label}</span>
    {#if description}
      <span class="toggle-desc">{description}</span>
    {/if}
  </div>
  <div class="switch" class:checked>
    <div class="switch-handle"></div>
  </div>
</div>

<style>
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    background-color: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    user-select: none;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  .toggle-row:hover:not(.disabled) {
    background-color: var(--surface-active);
    border-color: var(--border-strong);
  }
  .toggle-row.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding-right: 1rem;
  }
  .toggle-label {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  .toggle-desc {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }
  .switch {
    width: 44px;
    height: 24px;
    background-color: var(--border);
    border-radius: 12px;
    position: relative;
    transition: background-color 0.2s ease;
    flex-shrink: 0;
  }
  .switch.checked {
    background-color: var(--primary);
  }
  .switch-handle {
    width: 18px;
    height: 18px;
    background-color: var(--text-primary);
    border-radius: 50%;
    position: absolute;
    top: 3px;
    left: 3px;
    transition: transform 0.2s ease;
  }
  .switch.checked .switch-handle {
    transform: translateX(20px);
  }
</style>

