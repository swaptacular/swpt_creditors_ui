<script lang="ts">
  import type { AppState, AccountsModel, AccountDataForDisplay } from '../app-state'
  import { amountToString } from '../format-amounts'
  import { tick, onMount } from "svelte"
  import Fab, { Icon } from '@smui/fab';
  import Paper, { Title, Content } from '@smui/paper'
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

  const MAX_UNNAMED_ACCOUNT_CONFIGS = 4

  let searchInput: HTMLInputElement
  let scanCoinDialog = false
  let visibleSearchBox = model.searchText !== undefined
  let pendingFilterChange = false
  let searchText = model.searchText ?? ''
  let filter = searchText

  function deleteUnnamedAccountUris(): void {
    app.startInteraction()
    app.deleteUnnamedAccountUris(unnamedAccountUris)
  }

  function showAccount(accountUri: string): void {
    const m = {
      ...model,
      searchText: visibleSearchBox ? searchText : undefined,
      scrollTop: scrollElement.scrollTop,
      scrollLeft: scrollElement.scrollLeft,
    }
    app.startInteraction()
    app.showAccount(accountUri, () => app.pageModel.set(m))
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
    return accounts.filter(account => regExps.every(re => re.test(account.display.debtorName)))
  }

  async function showSearchBox() {
    if (!visibleSearchBox) {
      app.startInteraction()
      visibleSearchBox = true
      await tick()
      searchInput?.focus()
    }
  }

  function hideSearchBox() {
    resetScroll()
    filter = searchText = ''
    setTimeout(() => {
      visibleSearchBox = false
    }, 350)
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
    const pegBound = accountData.pegBounds[accountData.pegBounds.length - 1]
    assert(pegBound !== undefined)
    const amount = Number(accountData.amount) * pegBound.exchangeRate
    const { amountDivisor, decimalPlaces } = pegBound.display
    const unitAmount = amountToString(amount, amountDivisor, decimalPlaces)
    const unit = pegBound.display.unit
    return `${unitAmount} ${unit}`
  }

  function scanCoin(): void {
    if (!scanCoinDialog) {
      app.startInteraction()
      scanCoinDialog = true
    }
  }

  onMount(() => {
    if (visibleSearchBox) {
      searchInput?.focus()
    }
  })

  $: hasAccounts = model.accounts.length > 0
  $: unnamedAccountUris = model.unnamedAccountUris
  $: shownAccounts = applyFilter(model.accounts, filter)
</script>

<style>
  .delete-link {
    margin: 8px 0;
    font-family: Roboto, sans-serif;
    text-decoration: underline;
    color: #888;
  }
  .search-box {
    padding: 12px 0 12px 0;
    width: 100%;
    color: black;
    background-color: #f4f4f4;
    box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: left;
    align-items: center;
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
    font-size: 1.4em;
    margin-top: 0.33em;
    color: #555;
    text-align: right;
    font-family: "Cutive Mono", monospace;
  }
  .fab-container {
    margin: 16px 16px;
  }
  .no-matches {
    margin: 36px 18px 26px 18px;
    text-align: center;
    color: #c4c4c4;
  }
  .text {
    margin-top: 1em;
  }
  .important {
    font-weight: bold;
    font-size: 1.1em;
  }
</style>

<Page title="Accounts" scrollTop={model.scrollTop} scrollLeft={model.scrollLeft}>
  <svelte:fragment slot="content">
    {#if hasAccounts}
      {#if shownAccounts.length > 0 }
        <LayoutGrid style="word-break: break-word">
          {#if unnamedAccountUris.length > MAX_UNNAMED_ACCOUNT_CONFIGS}
            <Cell>
              <Card>
                <PrimaryAction padded on:click={deleteUnnamedAccountUris}>
                  <span class="delete-link">
                    {#if unnamedAccountUris.length === 1}
                      Delete 1 unconfirmed account, which is not
                      properly configured.
                    {:else}
                      Delete {unnamedAccountUris.length}
                      unconfirmed accounts, which are not properly
                      configured.
                    {/if}
                  </span>
                </PrimaryAction>
              </Card>
            </Cell>
          {/if}
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
        <p class="no-matches">
          There are no accounts matching the specified filter.
        </p>
      {/if}

    {:else}
      <Paper elevation={8} style="margin: 24px 18px">
        <Title>
          Your wallet is empty!
        </Title>
        <Content>
          <p class="text">
            To acquire any digital currency, first you need to create an
            account with it. To create an account with the digital
            currency of your choice, you should scan the QR code that
            identifies the currency.
          </p>
          <p class="text">
            In Swaptacular, the QR code that
            identifies a given currency is called "the digital coin" for
            the currency.
          </p>
          <p class="text important">
            Press the
            <Icon class="material-icons" style="vertical-align: middle">add</Icon>
            button below to add a new account
          </p>
        </Content>
      </Paper>
    {/if}

    <ScanCoinDialog bind:open={scanCoinDialog}/>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    {#if visibleSearchBox}
      <div class="search-box">
        <div style="padding-left: 16px; flex-grow: 1" >
          <Textfield
            variant="outlined"
            type="text"
            style="width: 100%"
            label="Filter by name"
            input$spellcheck="false"
            bind:this={searchInput}
            bind:value={searchText}
            on:input={triggerFilterChange}
            on:change={triggerFilterChange}
            >
          </Textfield>
        </div>
        <div style="padding: 4px; flex-grow: 0" >
          <IconButton class="material-icons" on:click={hideSearchBox}>close</IconButton>
        </div>
      </div>
    {:else}
      {#if hasAccounts }
        <div class="fab-container">
          <Fab on:click={showSearchBox}>
            <Icon class="material-icons">search</Icon>
          </Fab>
        </div>
      {/if}
      <div class="fab-container">
        <Fab color="primary" on:click={scanCoin} >
          <Icon class="material-icons">add</Icon>
        </Fab>
      </div>
    {/if}
  </svelte:fragment>
</Page>
