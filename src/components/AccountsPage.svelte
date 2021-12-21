<script lang="ts">
  import type { AppState, AccountsModel } from '../app-state'
  import Fab, { Icon } from '@smui/fab';
  // import LayoutGrid, { Cell } from '@smui/layout-grid'
  // import ActionCard from './ActionCard.svelte'
  // import Checkbox from '@smui/checkbox'
  // import FormField from '@smui/form-field'
  // import Paper, { Title, Content } from '@smui/paper'
  import Page from './Page.svelte'
  // import Card, { Actions, Content as CardContent } from '@smui/card'
  // import Button, { Label } from '@smui/button'
  import ScanCoinDialog from './ScanCoinDialog.svelte'

  export let app: AppState
  export let model: AccountsModel
  export const snackbarBottom: string = '84px'

  let scanCoinDialog = false

  // TODO: add real implementation
  app
  model
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
  .no-accounts {
    --no-actions-color: #c4c4c4;
    margin: 36px 18px 26px 18px;
    text-align: center;
    color: var(--no-actions-color);
  }
</style>

<Page title="Accounts">
  <svelte:fragment slot="content">
    <p class="no-accounts">
      Press
      <Icon class="material-icons" style="vertical-align: middle">add</Icon>
      to create a new account.
    </p>

    <ScanCoinDialog bind:open={scanCoinDialog}/>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab on:click={() => alert('not implemented') }>
        <Icon class="material-icons">search</Icon>
      </Fab>
    </div>
    <div class="fab-container">
      <Fab color="primary" on:click={() => scanCoinDialog = true} >
        <Icon class="material-icons">add</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
