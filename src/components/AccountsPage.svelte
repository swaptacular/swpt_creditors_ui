<script lang="ts">
  import type { AppState, AccountsModel } from '../app-state'
  import { onMount } from "svelte"
  import { Row } from '@smui/top-app-bar'
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
  export const scrollElement = document.documentElement

  type AccountData = {
    uri: string,
    title: string,
    confirmed: boolean,
  }

  let currentModel: AccountsModel
  let scanCoinDialog: boolean
  let pendingFilterChange: boolean
  let allAccounts: AccountData[]
  let searchText: string
  let filter: string

  function showAccount(accountUri: string): void {
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.showAccount(accountUri, () => {
      app.pageModel.set({ ...model, searchText, scrollTop, scrollLeft })
    })
  }

  function resetScroll(scrollTop: number = 0, scrollLeft: number = 0) {
    if (scrollElement) {
      scrollElement.scrollTop = scrollTop
      scrollElement.scrollLeft = scrollLeft
    }
  }

  function applyFilter(accounts: AccountData[], filter: string): AccountData[] {
    const words = filter.split(/\s+/u).filter(word => word.length > 0)
    const regExps = words.map(word => new RegExp(`${word}`, 'ui'))
    return accounts.filter(account => regExps.every(re => re.test(account.title)))
  }

  function clearFilter() {
    resetScroll()
    filter = searchText = ''
  }

  function triggerFilterChange() {
    if (!(filter === searchText || pendingFilterChange)) {
      pendingFilterChange = true
      setTimeout(() => {
        resetScroll()
        filter = searchText
        pendingFilterChange = false
      }, 1000)
    }
  }

  onMount(() => {
    resetScroll(model.scrollTop, model.scrollLeft)
  })

  $: if (currentModel !== model) {
    currentModel = model
    scanCoinDialog = false
    pendingFilterChange = false
    allAccounts = [
      {uri: '1', title: 'Evgeni Pandurski', confirmed: true},
      {uri: '2', title: 'United States Dollar', confirmed: true},
      {uri: '3', title: 'United States Dollar', confirmed: true},
      {uri: '', title: 'United States Dollar', confirmed: true},
      {uri: '', title: 'United States Dollar', confirmed: true},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: true},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
      {uri: '', title: 'United States Dollar', confirmed: false},
    ]
    filter = searchText = model.searchText ?? ''
    resetScroll(model.scrollTop, model.scrollLeft)
  }
  $: hasAccounts = allAccounts.length > 0
  $: shownAccounts = applyFilter(allAccounts, filter)
</script>

<style>
  .search-box {
    width: 100%;
    height: 100%;
    color: black;
    background-color: #f4f4f4;
    border-bottom: 1px solid #ccc;
    display: flex;
    justify-content: left;
    align-items: center;
  }
  .empty-space {
    height: 92px;
  }
  .name {
    font-size: 1.25em;
    font-weight: bold;
    color: #aaa;
  }
  .confirmed {
    color: black !important;
  }
  .amount {
    font-size: 1.25em;
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
  <svelte:fragment slot="app-bar">
    {#if hasAccounts }
      <Row style="height: 83px">
        <div class="search-box">
          <div style="padding-left: 16px; flex-grow: 1" >
            <Textfield
              variant="outlined"
              type="text"
              style="width: 100%"
              label="Filter by name"
              input$spellcheck="false"
              bind:value={searchText}
              on:input={triggerFilterChange}
              on:change={triggerFilterChange}
              >
            </Textfield>
          </div>
          <div style="padding: 4px; flex-grow: 0" >
            <IconButton class="material-icons" on:click={clearFilter}>backspace</IconButton>
          </div>
        </div>
      </Row>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    {#if hasAccounts}
      <div class="empty-space"></div>
      {#if shownAccounts.length > 0 }
        <LayoutGrid style="word-break: break-word">
          {#each shownAccounts as account }
            <Cell>
              <Card>
                <PrimaryAction padded on:click={() => showAccount(account.uri)}>
                  <p class="name" class:confirmed={account.confirmed}>{account.title}</p>
                  <p class="amount">137.00 USD</p>
                </PrimaryAction>
              </Card>
            </Cell>
          {/each}
        </LayoutGrid>
      {:else}
        <p class="no-accounts">
          There are no accounts matching the specified filter.
        </p>
      {/if}

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
