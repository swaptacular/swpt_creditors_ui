<script lang="ts">
  import type { AppState, AccountsModel } from '../app-state'
  import type { AccountDataForDisplay } from '../operations'
  import { amountToString } from '../format-amounts'
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

  let currentModel: AccountsModel
  let scanCoinDialog: boolean
  let pendingFilterChange: boolean
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

  function applyFilter(accounts: AccountsModel['accounts'], filter: string): AccountsModel['accounts'] {
    const words = filter.split(/\s+/u).filter(word => word.length > 0)
    const regExps = words.map(word => new RegExp(`(?:\\s|^)${word}`, 'ui'))
    return accounts.filter(account => regExps.every(re => re.test(account.display.debtorName ?? '')))
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

  function calcDisplayAmount(accountData: AccountDataForDisplay): string {
    const pegBound = accountData.pegBounds.at(-1)
    assert(pegBound !== undefined)
    const amount = Number(accountData.amount) * pegBound.exchangeRate
    const { amountDivisor, decimalPlaces } = pegBound.display
    const unitAmount = amountToString(amount, amountDivisor, decimalPlaces)
    const unit = pegBound.display.unit
    return `${unitAmount} ${unit}`
  }

  onMount(() => {
    resetScroll(model.scrollTop, model.scrollLeft)
  })

  $: if (currentModel !== model) {
    currentModel = model
    scanCoinDialog = false
    pendingFilterChange = false
    filter = searchText = model.searchText ?? ''
    resetScroll(model.scrollTop, model.scrollLeft)
  }
  $: hasAccounts = model.accounts.length > 0
  $: shownAccounts = applyFilter(model.accounts, filter)
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
                <PrimaryAction padded on:click={() => showAccount(account.display.account.uri)}>
                  <p class="name" class:confirmed={account.display.knownDebtor}>{account.display.debtorName}</p>
                  <p class="amount">{calcDisplayAmount(account)}</p>
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
