<script>
  export let headers = [];
  export let items = [];
  export let emptyMessage = 'Aucune donnée enregistrée.';
</script>

<div class="table-container">
  <table>
    <thead>
      <tr>
        {#each headers as header}
          <th>{header}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if items.length === 0}
        <tr>
          <td colspan={headers.length} class="empty-state">
            {emptyMessage}
          </td>
        </tr>
      {:else}
        {#each items as item, index}
          <slot name="row" {item} {index}>
            <tr>
              <slot {item} {index} />
            </tr>
          </slot>
        {/each}
      {/if}
    </tbody>
  </table>
</div>

<style>
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
    font-size: 0.88rem;
  }
</style>

