<script lang="ts">
  import type { AppState, AccountModel } from '../app-state'
  // import type { AccountDataForDisplay } from '../operations'
  // import { amountToString } from '../format-amounts'
  // import { onMount } from "svelte"
  import Svg from '@smui/common/Svg.svelte'
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
          <IconButton class="material-icons" disabled on:click={() => undefined}>account_balance</IconButton>
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
      <Fab on:click={() => undefined} >
        <Icon class="material-icons">settings</Icon>
      </Fab>
    </div>
    <div class="fab-container">
      <Fab on:click={() => undefined} >
        <Icon component={Svg} viewBox="0 0 24 24" style="outline-style: none">
          <g><rect fill="none" height="24" width="24"/></g><g><path d="M12.89,11.1c-1.78-0.59-2.64-0.96-2.64-1.9c0-1.02,1.11-1.39,1.81-1.39c1.31,0,1.79,0.99,1.9,1.34l1.58-0.67 C15.39,8.03,14.72,6.56,13,6.24V5h-2v1.26C8.52,6.82,8.51,9.12,8.51,9.22c0,2.27,2.25,2.91,3.35,3.31 c1.58,0.56,2.28,1.07,2.28,2.03c0,1.13-1.05,1.61-1.98,1.61c-1.82,0-2.34-1.87-2.4-2.09L8.1,14.75c0.63,2.19,2.28,2.78,2.9,2.96V19 h2v-1.24c0.4-0.09,2.9-0.59,2.9-3.22C15.9,13.15,15.29,11.93,12.89,11.1z M3,21H1v-6h6v2l-2.48,0c1.61,2.41,4.36,4,7.48,4 c4.97,0,9-4.03,9-9h2c0,6.08-4.92,11-11,11c-3.72,0-7.01-1.85-9-4.67L3,21z M1,12C1,5.92,5.92,1,12,1c3.72,0,7.01,1.85,9,4.67L21,3 h2v6h-6V7l2.48,0C17.87,4.59,15.12,3,12,3c-4.97,0-9,4.03-9,9H1z"/></g>
        </Icon>
      </Fab>
    </div>
    <div class="fab-container">
      <Fab color="primary" on:click={() => undefined} >
        <Icon class="material-icons">receipt</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
