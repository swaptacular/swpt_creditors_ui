<script lang="ts">
  import type { AppState, ActionModel } from '../app-state'
  import CreateAccountAction from './CreateAccountAction.svelte'

  export let app: AppState
  export let model: ActionModel
  export let snackbarBottom: string = '0px'

  $: action = model.action
</script>

{#if action.actionType === 'CreateAccount'}
  <CreateAccountAction {action} {app} bind:snackbarBottom />
{/if}
