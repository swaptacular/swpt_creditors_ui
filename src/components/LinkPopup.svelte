<script lang="ts">
  import type { AppState } from '../app-state'
  import { getContext } from 'svelte'

  export let show: boolean

  const app: AppState = getContext('app')

  function ativate(): void {
    app.startInteraction()
    show = true
  }
</script>

<a href="." target="_blank" on:click|preventDefault={ativate}>
  <slot></slot>
</a>
