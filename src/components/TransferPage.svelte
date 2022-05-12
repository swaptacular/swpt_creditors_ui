<script lang="ts">
  // import { onDestroy } from 'svelte'
  // import { generatePr0Blob } from '../payment-requests'
  // import type { TransferRecord } from '../operations'
  // import { getTooltip } from '../utils'
  // import type { AppState, TransferModel } from '../app-state'
  // import Fab, { Icon, Label } from '@smui/fab';
  // import PaymentInfo from './PaymentInfo.svelte'
  import Page from './Page.svelte'

  // export let app: AppState
  // export let model: TransferModel
  export const snackbarBottom: string = '84px'

  // const maxUnitAmount =  Number(app.amountToString(2n ** 63n - 1000000n))
  // const debtorName = app.getDebtorConfigData()?.debtorInfo?.debtorName
  // let downloadLinkElement: HTMLAnchorElement
  // let currentDataUrl: string

  // function getTitle(t: TransferRecord): string {
  //   switch (true) {
  //   case t.result?.error !== undefined:
  //       return 'Failed payment'
  //   case t.result !== undefined:
  //     return 'Successful payment'
  //   default:
  //     return 'Initiated payment'
  //   }
  // }

  // function revokeCurrentDataUrl() {
  //   if (currentDataUrl) {
  //     URL.revokeObjectURL(currentDataUrl)
  //   }
  // }

  // function generateDataUrl(t: TransferRecord): string {
  //   const blob = generatePr0Blob({
  //     ...t.paymentInfo,
  //     accountUri: t.recipient.uri,
  //     amount: t.noteFormat === 'PAYMENT0' ? t.amount : 0n,

  //     // NOTE: The `deadline` field is not set, because
  //     // deadlines are not supported in the Web API.
  //   })
  //   revokeCurrentDataUrl()
  //   return currentDataUrl = URL.createObjectURL(blob)
  // }

  // onDestroy(revokeCurrentDataUrl)

  // $: transfer = model.transfer
  // $: payeeName = $transfer.paymentInfo.payeeName
  // $: payeeReference = $transfer.paymentInfo.payeeReference
  // $: unitAmount = app.amountToString($transfer.amount)
  // $: description = $transfer.paymentInfo.description
  // $: title = getTitle($transfer)
  // $: tooltip = getTooltip($transfer)
  // $: dataUrl = generateDataUrl($transfer)
  // $: downloadNameShort = `${payeeName} - ${debtorName}`
  // $: downloadName = payeeReference ? `${downloadNameShort}, ${payeeReference}` : downloadNameShort
  // $: fileName = downloadName.slice(0, 120) + '.pr0'
  
</script>

<style>
  
  /* .download-link { */
  /*   display: none; */
  /* } */
  /* .fab-container { */
  /*   margin: 16px 16px; */
  /* } */
  
</style>

<Page title="Payment">
  <svelte:fragment slot="content">
    <!-- <PaymentInfo -->
    <!--   {payeeName} -->
    <!--   {unitAmount} -->
    <!--   {description} -->
    <!--   {title} -->
    <!--   {tooltip} -->
    <!--   {maxUnitAmount} -->
    <!--   unit={app.unit} -->
    <!--   /> -->
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <!-- {#if $transfer.result} -->
    <!--   <div class="fab-container"> -->
    <!--     <Fab on:click={() => app.retryTransfer($transfer)} extended> -->
    <!--       <Label> -->
    <!--         {#if $transfer.result.error} -->
    <!--           Retry -->
    <!--         {:else} -->
    <!--           Pay again -->
    <!--         {/if} -->
    <!--       </Label> -->
    <!--     </Fab> -->
    <!--   </div> -->
    <!-- {/if} -->
    <!-- <div class="fab-container"> -->
    <!--   <a class="download-link" href={dataUrl} download={fileName} bind:this={downloadLinkElement}>download</a> -->
    <!--   <Fab color="primary" on:click={() => downloadLinkElement.click()} extended> -->
    <!--     <Icon class="material-icons">download</Icon> -->
    <!--     <Label>Save</Label> -->
    <!--   </Fab> -->
    <!-- </div> -->
  </svelte:fragment>
</Page>
