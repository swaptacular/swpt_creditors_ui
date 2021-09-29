<script lang="ts">
  import type { AppState } from '../app-state'
  import Dialog from '@smui/dialog'
  import { onDestroy, getContext } from 'svelte'

  export let open: boolean = false

  const app: AppState = getContext('app')

  function hijackBackButton() {
    app.goBack = close
  }
  function releaseBackButton() {
    app.goBack = undefined
  }
  function close() {
    open = false
  }

  onDestroy(releaseBackButton)

  $: if (open) {
    hijackBackButton()
  } else {
    releaseBackButton()
  }
</script>

<Dialog
  on:MDCDialog:opening
  on:MDCDialog:opened
  on:MDCDialog:closed
  on:click
  on:keydown
  {...$$props}
  {open}
  >
  <slot></slot>
</Dialog>
