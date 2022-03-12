<script lang="ts">
  import type { AppState, AccountsModel } from '../app-state'
  import Fab, { Icon } from '@smui/fab';
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Card, { PrimaryAction } from '@smui/card'
  import Textfield from '@smui/textfield'
  import IconButton from '@smui/icon-button'
  import Page from './Page.svelte'
  import ScanCoinDialog from './ScanCoinDialog.svelte'

  export let app: AppState
  export let model: AccountsModel
  export const snackbarBottom: string = '84px'

  let searchText = ''
  let scanCoinDialog = false
  let accounts = [
    {title: 'Evgeni Pandurski', confirmed: true},
    {title: 'United States Dollar', confirmed: true},
    {title: 'United States Dollar', confirmed: true},
    {title: 'United States Dollar', confirmed: true},
    {title: 'United States Dollar', confirmed: true},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: true},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
    {title: 'United States Dollar', confirmed: false},
  ]

  // TODO: add real implementation
  app
  model
</script>

<style>
  .search-box {
    position: fixed;
    width: 100%;
    height: 55px;
    padding: 14px 0 14px 0;
    background-color: #f4f4f4;
    border-bottom: 1px solid #ccc;
    z-index: 1;
    display: flex;
    justify-content: left;
    align-items: center;
  }
  .empty-space {
    height: 92px;
  }
  .name {
    font-size: 1.2em;
    font-weight: bold;
    color: #aaa;
  }
  .confirmed {
    color: black !important;
  }
  .amount {
    font-size: 1.2em;
    margin-top: 0.33em;
    color: #555;
    text-align: right;
    font-family: ui-monospace;
  }
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
    {#if accounts.length > 0 }
      <div class="search-box">
        <div style="flex-grow: 10" >
          <Textfield
            variant="outlined"
            type="text"
            style="margin-left: 16px; width: 100%"
            label="Filter by name"
            bind:value={searchText}
            >
          </Textfield>
        </div>
        <div style="margin: 0 4px 0 20px; flex-grow: 0" >
          <IconButton class="material-icons" on:click={() => searchText = ''}>backspace</IconButton>
        </div>
      </div>
      <div class="empty-space"></div>
      <LayoutGrid style="word-break: break-word">
        {#each accounts as account }
          <Cell>
            <Card>
              <PrimaryAction padded on:click={() => console.log('activated')}>
                <p class="name" class:confirmed={account.confirmed}>{account.title}</p>
                <p class="amount">137.00 USD</p>
              </PrimaryAction>
            </Card>
          </Cell>
        {/each}
      </LayoutGrid>
    {:else}
      <p class="no-accounts">
        Press
        <Icon class="material-icons" style="vertical-align: middle">add</Icon>
        to create a new account.
      </p>
    {/if}

    <ScanCoinDialog bind:open={scanCoinDialog}/>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab color="primary" on:click={() => scanCoinDialog = true} >
        <Icon class="material-icons">add</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
