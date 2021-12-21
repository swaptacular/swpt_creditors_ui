<script lang="ts">
  import type { AppState } from '../app-state'
  import type { CreateAccountActionWithId } from '../operations'
  import Fab, { Label } from '@smui/fab'
  // import Button, { Label as ButtonLabel } from '@smui/button'
  // import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  // import Dialog from './Dialog.svelte'
  // import PaymentInfo from './PaymentInfo.svelte'
  import Page from './Page.svelte'

  export let app: AppState
  export let action: CreateAccountActionWithId
  export const snackbarBottom: string = "84px"

  function cancel() {
    // TODO: Add real implementation
    app
    action
  }

  function confirm() {
  }
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="Create account">
  <svelte:fragment slot="content">
    Create account action
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab on:click={cancel} extended>
        <Label>Cancel</Label>
      </Fab>
    </div>
    <div class="fab-container">
      <Fab color="primary" on:click={confirm} extended>
        <Label>Confirm</Label>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
