<script lang="ts">
  import type { AppState, AccountModel } from '../app-state'
  import type { CommittedTransferRecord, AccountFullData, PegBound } from '../operations'
  import { amountToString } from '../format-amounts'
  import { onMount } from "svelte"
  import Svg from '@smui/common/Svg.svelte'
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
  let data: AccountFullData | undefined

  function resetScroll(scrollTop: number = 0, scrollLeft: number = 0) {
    if (scrollElement) {
      scrollElement.scrollTop = scrollTop
      scrollElement.scrollLeft = scrollLeft
    }
  }

  async function saveSortRank(): Promise<void> {
    const save = async () => {
      const rank = sortRank
      await app.setAccountSortPriority(model.accountUri, rank)
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
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.showLedgerEntry(commitedTransferUri, () => {
      app.pageModel.set({ ...model, transfers, scrollTop, scrollLeft })
    })
  }

  function showAccount(accountUri: string): void {
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.showAccount(accountUri, () => {
      app.pageModel.set({ ...model, transfers, scrollTop, scrollLeft })
    })
  }

  function calcDisplayAmount(amt: bigint, pegBound: PegBound): string {
    const amount = Number(amt) * pegBound.exchangeRate
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
    data = app.accountsMap.getAccountFullData(model.accountUri)
    sortRank = model.sortRank
    transfers = [...model.transfers]
    showLoadedTranfersButton = true
    resetScroll(model.scrollTop, model.scrollLeft)
  }
  $: if (sortRank !== model.sortRank) {
    saveSortRank()
  }
</script>

<style>
  ul {
    list-style: '\2713\00A0' outside;
    margin: 0.75em 1.25em 0 1.25em;
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
    font-size: 16px;
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

{#if data}
  <Page title="{data.display.debtorName}">
    <svelte:fragment slot="app-bar">
      <Row style="height: 64px">
        <div class="buttons-box">
          <div class="icon-container">
            <IconButton
              class="material-icons"
              disabled={model.tab === 'account'}
              on:click={() => model.tab = 'account'}
              >
              account_balance
            </IconButton>
          </div>
          {#if data.secureCoin}
            <div class="icon-container">
              <IconButton
                class="material-icons"
                disabled={model.tab === 'coin'}
                on:click={() => model.tab = 'coin'}
                >
                qr_code_2
              </IconButton>
            </div>
          {/if}
          <div class="icon-container">
            <IconButton
              class="material-icons"
              disabled={model.tab === 'sort'}
              on:click={() => model.tab = 'sort'}
              >
              sort
            </IconButton>
          </div>
          <div class="icon-container">
            <IconButton
              class="material-icons"
              disabled={model.tab === 'ledger'}
              on:click={() => model.tab = 'ledger'}
              >
              history
            </IconButton>
          </div>
        </div>
      </Row>
    </svelte:fragment>

    <svelte:fragment slot="content">
      <div class="empty-space"></div>

      {#if model.tab === 'account'}
        <Wrapper>
          <Paper style="margin: 24px 18px; word-break: break-word" elevation={6}>
            <Title>
              {#if data.debtorData.debtorHomepage}
                <Chip chip="help" on:click={() => undefined} style="float: right; margin-left: 6px">
                  <Text>
                    <a
                      href={data.debtorData.debtorHomepage.uri}
                      target="_blank"
                      style="text-decoration: none; color: #666"
                      >
                      www
                    </a>
                  </Text>
                </Chip>
                <Tooltip>{data.debtorData.debtorHomepage.uri}</Tooltip>
              {/if}
              {#if data.display.knownDebtor}
                Account with "{data.display.debtorName}"
              {:else}
                Unconfirmed account with "{data.display.debtorName}"
              {/if}
            </Title>
            <Content style="clear: both">
              <div style="display: flex; flex-flow: row-reverse wrap">
                <div class="amounts-box">
                  {#each data.pegBounds as pegBound, index}
                    <p class="amount">
                      {#if index === 0}
                        {calcDisplayAmount(data.amount, pegBound)}
                      {:else}
                        <a href="." target="_blank" on:click|preventDefault={() => showAccount(pegBound.accountUri)}>
                          = {calcDisplayAmount(data.amount, pegBound)}
                        </a>
                      {/if}
                    </p>
                  {/each}
                </div>
                {#if data.debtorData.summary}
                  <blockquote class="summary-box">{data.debtorData.summary}</blockquote>
                {/if}
              </div>
              <ul>
                <li>
                  The annual interest rate on this account is {data.info.interestRate.toFixed(3)}%.
                </li>
                {#if data.config.scheduledForDeletion}
                  <li>
                    This account has been scheduled for deletion.
                  </li>
                {/if}
                {#if data.info.configError === 'NO_CONNECTION_TO_DEBTOR'}
                  <li>
                    No connection can be made to the servers that manage
                    this currency. You will not be able to send or receive
                    money from this account, but you still can peg other
                    currencies to it.
                  </li>
                {:else if data.info.configError === 'CONFIGURATION_IS_NOT_EFFECTUAL'}
                  <li>
                    This account has some configuration problem. Usually
                    this means that temporarily, a connection can not be
                    made to the servers that manage this currency.
                  </li>
                {:else if data.info.configError !== undefined}
                  <li>
                    An unexpected account configuration problem has
                    occurred:
                    <span style="word-break: break-all">{data.info.configError}</span>.
                  </li>
                {/if}
              </ul>
            </Content>
          </Paper>
        </Wrapper>

    {:else if model.tab === 'coin'}
      <div class="qrcode-container">
        <QrGenerator
          value={`${data.debtorData.latestDebtorInfo.uri}#${data.account.debtor.uri}`}
          size={320}
          padding={28}
          errorCorrection="L"
          background="#FFFFFF"
          color="#000000"
          bind:dataUrl
          />
      </div>
      <a
        class="download-link"
        href={dataUrl}
        download={`${data.display.debtorName}.png`}
        bind:this={downloadLinkElement}
        >
        download
      </a>
      <div class="text-container">
        <Paper elevation={8} style="margin: 0 16px 24px 16px; max-width: 600px; word-break: break-word">
          <Title>Digital coin for "{data.display.debtorName}"</Title>
          <Content>
            <a href="." target="_blank" on:click|preventDefault={() => downloadLinkElement?.click()}>
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
        <Title>Sort rank for "{data.display.debtorName}"</Title>
        <Content>
          To select this account more easily among other accounts, you
          may increase its sort rank. By doing so, you will push this
          account closer to the top of the accounts list.
        </Content>
      </Paper>
      <div class="text-container">
        <FormField align="center" style="max-width: 400px; flex-grow: 1; display: flex; margin: 16px">
          <Slider
            style="flex-grow: 1"
            min={0}
            max={10}
            step={1}
            bind:value={sortRank}
            />
          <span
            slot="label"
            style="flex-grow: 0; padding: 8px 8px 8px 12px; font-size: 1.5em"
            >
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
              pegBound={data.pegBounds[0]}
              activate={() => showLedgerEntry(transfer.uri)}
              />
          </Cell>
        {/each}
        <Cell span={12} style="text-align: cetner; visibility: {showLoadedTranfersButton ? 'visible' : 'hidden'}">
          <Card>
            <PrimaryAction on:click={loadTransfers}>
              <CardContent>
                <div class="load-button">
                  <span>Load older tranfers</span>
                  <Icon class="material-icons">arrow_forward</Icon>
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
      {#if data.secureCoin}
        <div class="fab-container">
          <Fab color="primary" on:click={() => undefined} >
            <Icon class="material-icons">receipt</Icon>
          </Fab>
        </div>
      {/if}
    </svelte:fragment>
  </Page>

{:else}
  <!-- Normally, this should not happen. -->
  <Page title="Account">
    <svelte:fragment slot="content">
      <Paper style="margin: 24px 18px" elevation={6}>
        <Title>Unknown account</Title>
        <Content>Can not obtain information about this account.</Content>
      </Paper>
    </svelte:fragment>
  </Page>
{/if}

