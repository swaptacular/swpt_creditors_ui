<script lang="ts">
  import type { AppState, TransfersModel, TransferRecord } from '../app-state'
  // import { onMount } from "svelte"
  import { amountToString } from '../format-amounts'
  import { Icon } from '@smui/common'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Card, { PrimaryAction, Content } from '@smui/card'
  import InfiniteScroll from "./InfiniteScroll.svelte"
  import Page from './Page.svelte'

  export let app: AppState
  export let model: TransfersModel
  export const snackbarBottom: string = "0px"

  let scrollElement: HTMLElement
  let transfers: TransferRecord[] = []
  let newBatch = model.transfers

  async function fetchNewBatch(): Promise<void> {
    newBatch = await model.fetchTransfers()
  }

  function showTransfer(transferUri: string): void {
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    app.showTransfer(transferUri, () => {
      app.pageModel.set({ ...model, transfers, scrollTop, scrollLeft })
    })
  }

  function getIconName(t: TransferRecord): string {
    if (!t.result) {
      return 'schedule'
    } else if (t.result.error) {
      return 'close'
    } else {
      return 'check'
    }
  }

  function getDate(t: TransferRecord): string {
    const initiatedAt = new Date(t.initiatedAt)
    return initiatedAt.toLocaleString()
  }

  // onMount(() => {
  //   if (scrollElement) {
  //     scrollElement.scrollTop = model.scrollTop ?? scrollElement.scrollTop
  //     scrollElement.scrollLeft = model.scrollLeft ?? scrollElement.scrollLeft
  //   }
  // })

  $: transfers = [...transfers, ...newBatch]
  $: amountDivisor = 1
  $: decimalPlaces = 0n
  $: unit = '\u00A4'
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
                    <Icon style="vertical-align: -20%" class="material-icons">{getIconName(transfer)}</Icon>
                    {getDate(transfer)}
                  </h5>
                  <p>
                    {`${amountToString(transfer.amount, amountDivisor, decimalPlaces)} ${unit} to ${transfer.paymentInfo.payeeName}`}
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
</Page>
