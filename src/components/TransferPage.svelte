<script lang="ts">
  import type { AppState, TransferModel, TransferRecord, ExtendedTransferRecord } from '../app-state'
  import { getTransferStatusDetails } from '../operations'
  import { amountToString } from '../format-amounts'
  import { generatePr0Blob } from '../payment-requests'
  import { onDestroy } from 'svelte'
  import Fab, { Icon } from '@smui/fab';
  import PaymentInfo from './PaymentInfo.svelte'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: TransferModel
  export const snackbarBottom: string = '84px'

  let downloadLinkElement: HTMLAnchorElement
  let currentDataUrl: string

  function getUnitAmount(transfer: ExtendedTransferRecord): string {
    const display = transfer?.display
    const amountDivisor = display?.amountDivisor ?? 1
    const decimalPlaces = display?.decimalPlaces ?? 0n
    return transfer.amount ? amountToString(transfer.amount, amountDivisor, decimalPlaces) : ''
  }

  function getDeadline(transfer: TransferRecord): string {
    let deadline = new Date(transfer.options.deadline ?? '')
    if (Number.isNaN(deadline.getTime())) {
      return '9999-12-31T23:59'
    }
    deadline.setMinutes(deadline.getMinutes() - deadline.getTimezoneOffset())
    deadline.setSeconds(0)
    deadline.setMilliseconds(0)
    const isoDeadline = deadline.toISOString()
    return isoDeadline.slice(0, isoDeadline.length - 1)
  }

  function getStatus(transfer: TransferRecord): string {
    switch (true) {
    case transfer.result?.error !== undefined:
      return 'Failed'
    case transfer.result !== undefined:
      return 'Successful'
    default:
      return 'Initiated'
    }
  }

  function revokeCurrentDataUrl() {
    if (currentDataUrl) {
      URL.revokeObjectURL(currentDataUrl)
    }
  }

  function generateDataUrl(t: TransferRecord): string {
    let deadline = new Date(t.options.deadline ?? '')
    const blob = generatePr0Blob({
      ...t.paymentInfo,
      accountUri: t.recipient.uri,
      amount: t.noteFormat === 'PAYMENT0' ? t.amount : 0n,
      deadline: Number.isNaN(deadline.getTime()) ? undefined : deadline,
    })
    revokeCurrentDataUrl()
    return currentDataUrl = URL.createObjectURL(blob)
  }

  function goBack(): void {
    app.startInteraction()
    model.goBack?.()
  }

  onDestroy(revokeCurrentDataUrl)

  $: transfer = model.transfer
  $: unitAmount = getUnitAmount($transfer)
  $: deadline = getDeadline($transfer)
  $: paymentInfo = $transfer.paymentInfo
  $: display = $transfer.display
  $: unit = display?.unit ?? '\u00a4'
  $: status = getStatus($transfer)
  $: statusTooltip = getTransferStatusDetails($transfer)
  $: dataUrl = generateDataUrl($transfer)
  $: payeeName = paymentInfo.payeeName.slice(0, 40) ?? 'unknown payee'
  $: payeeReference = paymentInfo.payeeReference
  $: downloadNameShort = `Pay ${unitAmount} ${unit.slice(0, 10)} to ${payeeName}`
  $: downloadName = payeeReference ? `${downloadNameShort} - ${payeeReference}` : downloadNameShort
  $: fileName = downloadName.slice(0, 120).replace(/[<>:"/|?*\\]/g, ' ') + '.pr0'

  $: showAccount = $transfer.display ? () => {
    assert($transfer.display)
    const accountUri = $transfer.display.account.uri
    app.showAccount(accountUri, () => app.pageModel.set(model))
  } : undefined
</script>

<style>
  .download-link {
    display: none;
  }
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="Payment">
  <svelte:fragment slot="content">
    <PaymentInfo
      {unitAmount}
      {deadline}
      {display}
      {showAccount}
      {paymentInfo}
      {status}
      {statusTooltip}
      />
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <a class="download-link" href={dataUrl} download={fileName} bind:this={downloadLinkElement}>download</a>
      <Fab on:click={() => downloadLinkElement.click()}>
        <Icon class="material-icons">download</Icon>
      </Fab>
    </div>
    <div class="fab-container">
      <Fab on:click={goBack} color="primary">
        <Icon class="material-icons">arrow_back</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
