<script lang="ts">
  import type { AppState, TransfersModel, ExtendedTransferRecord } from '../app-state'
  import { amountToString } from '../format-amounts'
  import Fab, { Icon } from '@smui/fab';
  import { Icon as CommonIcon } from '@smui/common'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Card, { PrimaryAction, Content } from '@smui/card'
  import InfiniteScroll from "./InfiniteScroll.svelte"
  import Page from './Page.svelte'

  export let app: AppState
  export let model: TransfersModel
  export const snackbarBottom: string = "84px"

  let scrollElement: HTMLElement
  let transfers: ExtendedTransferRecord[] = []
  let newBatch = model.transfers

  async function fetchNewBatch(): Promise<void> {
    newBatch = await model.fetchTransfers()
  }

  function goBack(): void {
    app.startInteraction()
    model.goBack?.()
  }

  function showTransfer(transferUri: string): void {
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.startInteraction()
    app.showTransfer(transferUri, () => {
      app.pageModel.set({ ...model, transfers, scrollTop, scrollLeft })
    })
  }

  function getIconName(t: ExtendedTransferRecord): string {
    if (!t.result) {
      return 'schedule'
    } else if (t.result.error) {
      return 'close'
    } else {
      return 'check'
    }
  }

  function getDate(t: ExtendedTransferRecord): string {
    const initiatedAt = new Date(t.initiatedAt)
    return initiatedAt.toLocaleString()
  }

  $: transfers = [...transfers, ...newBatch]
</script>

<style>
  h5 {
    font-weight: bold;
    font-size: 1.1em;
    margin-bottom: 0.5em;
  }
  .no-payments {
    margin: 36px 18px 26px 18px;
    text-align: center;
    color: #c4c4c4;
  }
  .transfer {
    font-family: "Cutive Mono", monospace;
    font-size: 1.1em;
    line-height: 1.25;
    word-break: break-word;
    margin: 10px 0 0 1.5em;
    text-indent: -1.5em;
  }
  .transfer span {
    font-size: 1.2em;
  }
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="Payments" scrollTop={model.scrollTop} scrollLeft={model.scrollLeft}>
  <svelte:fragment slot="content">
    {#if transfers.length === 0}
      <p class="no-payments">
        You have not initiated any payments yet.
      </p>
    {:else}
      <LayoutGrid>
        {#each transfers as transfer }
          <Cell>
            <Card>
              <PrimaryAction on:click={() => showTransfer(transfer.uri)}>
                <Content>
                  <h5>
                    <CommonIcon style="vertical-align: -20%" class="material-icons">{getIconName(transfer)}</CommonIcon>
                    {getDate(transfer)}
                  </h5>
                  <p class="transfer">
                    <span>
                      {amountToString(transfer.amount, transfer.display?.amountDivisor ?? 1, transfer.display?.decimalPlaces ?? 0n)}
                      {transfer.display?.unit ?? '\u00a4'}
                    </span>
                    to {transfer.paymentInfo.payeeName || 'unknown payee'}
                  </p>
                </Content>
              </PrimaryAction>
            </Card>
          </Cell>
        {/each}
      </LayoutGrid>
      <InfiniteScroll bind:scrollElement hasMore={newBatch.length > 0} threshold={100} on:loadMore={fetchNewBatch} />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab on:click={goBack} color="primary">
        <Icon class="material-icons">arrow_back</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
