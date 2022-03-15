<script lang="ts">
  import type { AppState, AccountModel } from '../app-state'
  // import type { AccountDataForDisplay } from '../operations'
  // import { amountToString } from '../format-amounts'
  // import { onMount } from "svelte"
  import { Row } from '@smui/top-app-bar'
  import Fab, { Icon } from '@smui/fab';
  // import LayoutGrid, { Cell } from '@smui/layout-grid'
  // import Card, { PrimaryAction } from '@smui/card'
  // import Textfield from '@smui/textfield'
  import IconButton from '@smui/icon-button'
  import Page from './Page.svelte'
  // import ScanCoinDialog from './ScanCoinDialog.svelte'

  export let app: AppState
  export let model: AccountModel
  export const snackbarBottom: string = '84px'

  let currentModel: AccountModel

  // TODO: add implementation.
  app
  
  $: if (currentModel !== model) {
    currentModel = model
  }
</script>

<style>
  .buttons-box {
    width: 100%;
    height: 100%;
    color: black;
    background-color: #f4f4f4;
    border-bottom: 1px solid #ccc;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .icon-container {
    width: 100%;
    flex-grow: 1;
    text-align: center;
  }
  .empty-space {
    height: 92px;
  }
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="Accounts">
  <svelte:fragment slot="app-bar">
    <Row style="height: 64px">
      <div class="buttons-box">
        <div class="icon-container">
          <IconButton class="material-icons" on:click={() => undefined}>account_balance</IconButton>
        </div>
        <div class="icon-container">
          <IconButton class="material-icons" on:click={() => undefined}>qr_code_2</IconButton>
        </div>
        <div class="icon-container">
          <IconButton class="material-icons" on:click={() => undefined}>history</IconButton>
        </div>
        <div class="icon-container">
          <IconButton class="material-icons" on:click={() => undefined}>sort</IconButton>
        </div>
      </div>
    </Row>
  </svelte:fragment>

  <svelte:fragment slot="content">
    <div class="empty-space"></div>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab color="primary" on:click={() => undefined} >
        <Icon class="material-icons">add</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
