<script lang="ts">
  import type { AppState, AccountModel } from '../app-state'
  import type { CommittedTransferRecord, AccountFullData, PegBound } from '../operations'
  import { amountToString } from '../format-amounts'
  import { onMount } from "svelte"
  import Paper, { Title, Content } from '@smui/paper'
  import Tooltip, { Wrapper } from '@smui/tooltip'
  import Chip, { Text } from '@smui/chips'
  import { Row } from '@smui/top-app-bar'
  import Fab, { Icon } from '@smui/fab'
  import Slider from '@smui/slider'
  import FormField from '@smui/form-field'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Card, { PrimaryAction, Content as CardContent } from '@smui/card'
  import IconButton from '@smui/icon-button'
  import Page from './Page.svelte'
  import QrGenerator from './QrGenerator.svelte'
  import CommittedTransferCard from './CommittedTransferCard.svelte'
  import ExchangeSvgIcon from './ExchangeSvgIcon.svelte'

  export let app: AppState
  export let model: AccountModel
  export const snackbarBottom: string = '84px'

  let scrollElement = document.documentElement
  let downloadLinkElement: HTMLAnchorElement
  let currentModel: AccountModel
  let dataUrl: string
  let sortRank: number
  let saveSortRankPromise: Promise<number> | undefined
  let transfers: CommittedTransferRecord[]
  let showLoadedTranfersButton: boolean
  let data: AccountFullData

  function resetScroll(scrollTop: number = 0, scrollLeft: number = 0) {
    if (scrollElement) {
      scrollElement.scrollTop = scrollTop
      scrollElement.scrollLeft = scrollLeft
    }
  }

  async function saveSortRank(): Promise<void> {
    const save = async () => {
      const rank = sortRank
      await app.setAccountSortPriority(accountUri, rank)
      saveSortRankPromise = undefined
      var m = model
      m.goBack = () => { app.showAccounts() }  // This ensures that the account list will be reloaded when going back.
      return rank
    }
    if (saveSortRankPromise) {
      saveSortRankPromise = saveSortRankPromise.then(r => r === sortRank ? r: save())
    } else {
      saveSortRankPromise = save()
    }
  }

  async function loadTransfers(): Promise<void> {
    if (showLoadedTranfersButton) {
      showLoadedTranfersButton = false
      const newBatch = await model.fetchTransfers()
      if (newBatch === undefined) {
        showLoadedTranfersButton = true
      } else if (newBatch.length > 0) {
        transfers.push(...newBatch)
        transfers = transfers
        showLoadedTranfersButton = true
      }
    }
  }

  function showLedgerEntry(commitedTransferUri: string): void {
    const m = model
    const t = transfers
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.showLedgerEntry(commitedTransferUri, () => {
      app.pageModel.set({ ...m, transfers: t, scrollTop, scrollLeft })
    })
  }

  function showAccount(accountUri: string): void {
    const m = model
    const t = transfers
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.showAccount(accountUri, () => {
      app.pageModel.set({ ...m, transfers: t, scrollTop, scrollLeft })
    })
  }

  function calcDisplayAmount(amt: bigint, pegBound: PegBound): string {
    const x = Number(amt) * pegBound.exchangeRate
    const { amountDivisor, decimalPlaces } = pegBound.display
    const unitAmount = amountToString(x, amountDivisor, decimalPlaces)
    const unit = pegBound.display.unit
    return `${unitAmount} ${unit}`
  }

  onMount(() => {
    resetScroll(model.scrollTop, model.scrollLeft)
  })

  $: if (currentModel !== model) {
    currentModel = model
    sortRank = model.sortRank
    transfers = [...model.transfers]
    showLoadedTranfersButton = true
    resetScroll(model.scrollTop, model.scrollLeft)
  }
  $: if (sortRank !== model.sortRank) {
    saveSortRank()
  }
  $: data = model.accountData
  $: accountUri = data.account.uri
  $: display = data.display
  $: knownDebtor = display.knownDebtor
  $: info = data.info
  $: interestRate = info.interestRate
  $: configError = info.configError
  $: config = data.config
  $: scheduledForDeletion = config.scheduledForDeletion
  $: debtorData = data.debtorData
  $: summary = debtorData.summary
  $: homepageUri = debtorData.debtorHomepage?.uri
  $: pegBounds = data.pegBounds
  $: amount = data.amount
  $: debtorName = display.debtorName
  $: isSecureCoin = data.secureCoin
  $: digitalCoin = `${debtorData.latestDebtorInfo.uri}#${data.account.debtor.uri}`
</script>

<style>
  ul {
    list-style: disc outside;
    margin: 0.75em 1.25em 0 18px;
  }
  li {
    margin-top: 0.5em;
  }
  .amounts-box {
    flex: 0 0 20em;
  }
  .amount {
    font-family: Courier,monospace;
    font-size: 1.1em;
    text-align: right;
  }
  .amount a {
    color: rgb(0, 0, 238);
    text-decoration: none;
  }
  .single-amount {
    font-size: 1.1em;
  }
  .summary-box {
    color: #888;
    margin-top: 16px;
    flex: 1 1 25em;
  }
  .download-link {
    display: none;
  }
  .qrcode-container {
    width: 100%;
    text-align: center;
  }
  .qrcode-container :global(img) {
    width: 100%;
    max-width: 66vh;
  }
  .text-container {
    display: flex;
    width: 100%;
    justify-content: center;
  }
  .no-transfers {
    margin: 36px 18px 26px 18px;
    text-align: center;
    color: #c4c4c4;
  }
  .load-button {
    color: rgb(98, 0, 238);
    letter-spacing: 1.4px;
    font-family: Roboto, sans-serif;
    font-weight: 500%;
    display: flex;
    align-items: center;
    text-transform: uppercase;
  }
  .load-button span {
    flex-grow: 1;
  }
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
    height: 64px;
  }
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="{debtorName}">
  <svelte:fragment slot="app-bar">
    <Row style="height: 64px">
      <div class="buttons-box">
        <div class="icon-container">
          <IconButton class="material-icons" disabled={model.tab === 'account'} on:click={() => model.tab = 'account'}>
            account_balance
          </IconButton>
        </div>
        {#if isSecureCoin}
          <div class="icon-container">
            <IconButton class="material-icons" disabled={model.tab === 'coin'} on:click={() => model.tab = 'coin'}>
              qr_code_2
            </IconButton>
          </div>
        {/if}
        <div class="icon-container">
          <IconButton class="material-icons" disabled={model.tab === 'sort'} on:click={() => model.tab = 'sort'}>
            sort
          </IconButton>
        </div>
        <div class="icon-container">
          <IconButton class="material-icons" disabled={model.tab === 'ledger'} on:click={() => model.tab = 'ledger'}>
            history
          </IconButton>
        </div>
      </div>
    </Row>
  </svelte:fragment>

  <svelte:fragment slot="content">
    <div class="empty-space"></div>

    {#if model.tab === 'account'}
      <Paper style="margin: 24px 18px; word-break: break-word" elevation={6}>
        <Title>
          {#if homepageUri}
            <Wrapper>
              <Chip chip="help" style="float: right; margin-left: 6px">
                <Text>
                  <a href={homepageUri} target="_blank" style="text-decoration: none; color: #666">
                    www
                  </a>
                </Text>
              </Chip>
              <Tooltip>
                {homepageUri}
              </Tooltip>
            </Wrapper>
          {/if}
          {#if knownDebtor}
            Account with "{debtorName}"
          {:else}
            Unconfirmed account with "{debtorName}"
          {/if}
        </Title>
        <Content style="clear: both">
          <div style="display: flex; flex-flow: row-reverse wrap">
            <div class="amounts-box">
              {#each pegBounds as pegBound, index}
                <p class="amount">
                  {#if index === 0}
                    <span class:single-amount={pegBounds.length === 1}>
                      {calcDisplayAmount(amount, pegBound)}
                    </span>
                  {:else}
                    <a href="." target="_blank" on:click|preventDefault={() => showAccount(pegBound.accountUri)}>
                      = {calcDisplayAmount(amount, pegBound)}
                    </a>
                  {/if}
                </p>
              {/each}
            </div>
            {#if summary}
              <blockquote class="summary-box">
                {summary}
              </blockquote>
            {/if}
          </div>
          <ul>
            <li>
              The annual interest rate on this account is
              {#if interestRate === 0}
                0%.
              {:else}
                {interestRate.toFixed(3)}%.
              {/if}
            </li>
            {#if scheduledForDeletion}
              <li>
                This account has been scheduled for deletion.
              </li>
            {/if}
            {#if configError !== undefined}
              <li>
                {#if configError === 'NO_CONNECTION_TO_DEBTOR'}
                  No connection can be made to the servers that manage
                  this currency. You will not be able to send or
                  receive money from this account, but you still can
                  peg other currencies to it.
                {:else if configError === 'CONFIGURATION_IS_NOT_EFFECTUAL'}
                  This account has some configuration problem. Usually
                  this means that temporarily, a connection can not be
                  made to the servers that manage this currency.
                {:else}
                  An unexpected account configuration problem has
                  occurred:
                  <span style="word-break: break-all">{configError}</span>.
                {/if}
              </li>
            {/if}
          </ul>
        </Content>
      </Paper>

    {:else if model.tab === 'coin'}
      <div class="qrcode-container">
        <QrGenerator
          value={digitalCoin}
          size={320}
          padding={28}
          errorCorrection="L"
          background="#FFFFFF"
          color="#000000"
          bind:dataUrl
          />
      </div>
      <a class="download-link" href={dataUrl} download={`${debtorName}.png`} bind:this={downloadLinkElement}>
        download
      </a>
      <div class="text-container">
        <Paper elevation={8} style="margin: 0 16px 24px 16px; max-width: 600px; word-break: break-word">
          <Title>
            Digital coin for "{debtorName}"
          </Title>
          <Content>
            <a href="{digitalCoin}" target="_blank" on:click|preventDefault={() => downloadLinkElement?.click()}>
              The image above
            </a>
            (an ordinary QR code, indeed) uniquely identifies the
            account's digital currency. Other people may want to scan
            this image with their mobile devices, so that they can use
            the currency too.
          </Content>
        </Paper>
      </div>

    {:else if model.tab === 'sort'}
      <Paper style="margin: 24px 18px; word-break: break-word" elevation={6}>
        <Title>Sort rank for "{debtorName}"</Title>
        <Content>
          To select this account more easily among other accounts, you
          may increase its sort rank. By doing so, you will push this
          account closer to the top of the accounts list.
        </Content>
      </Paper>
      <div class="text-container">
        <FormField align="center" style="max-width: 400px; flex-grow: 1; display: flex; margin: 16px">
          <Slider style="flex-grow: 1" min={0} max={10} step={1} bind:value={sortRank} />
          <span slot="label" style="flex-grow: 0; padding: 8px 8px 8px 12px; font-size: 1.5em">
            {sortRank}
          </span>
        </FormField>
      </div>

    {:else if model.tab === 'ledger'}
      {#if transfers.length === 0}
        <p class="no-transfers">
          There are no known transfers to/from this account.
        </p>
      {/if}
      <LayoutGrid>
        {#each transfers as transfer }
          <Cell>
            <CommittedTransferCard
              {transfer}
              pegBound={pegBounds[0]}
              activate={() => showLedgerEntry(transfer.uri)}
              />
          </Cell>
        {/each}
        <Cell span={12} style="text-align: cetner; visibility: {showLoadedTranfersButton ? 'visible' : 'hidden'}">
          <Card>
            <PrimaryAction on:click={loadTransfers}>
              <CardContent>
                <div class="load-button">
                  <span>
                    Load older tranfers
                  </span>
                  <Icon class="material-icons">
                    arrow_forward
                  </Icon>
                </div>
              </CardContent>
            </PrimaryAction>
          </Card>
        </Cell>
      </LayoutGrid>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab on:click={() => undefined} >
        <Icon class="material-icons">
          settings
        </Icon>
      </Fab>
    </div>
    <div class="fab-container">
      <Fab on:click={() => undefined} >
        <ExchangeSvgIcon />
      </Fab>
    </div>
    {#if isSecureCoin}
      <div class="fab-container">
        <Fab color="primary" on:click={() => undefined} >
          <Icon class="material-icons">
            receipt
          </Icon>
        </Fab>
      </div>
    {/if}
  </svelte:fragment>
</Page>
