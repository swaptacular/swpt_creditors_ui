<script lang="ts">
  import type { AppState, TransferModel, TransferRecord, ExtendedTransferRecord } from '../app-state'
  import { amountToString } from '../format-amounts'
  import { parseTransferNote, generatePr0Blob } from '../payment-requests'
  import { onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
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

  function getFailureReason(errorCode: string): string {
    switch (errorCode) {
    case 'CANCELED_BY_THE_SENDER':
      return 'The payment has been canceled the sender.'
    case 'RECIPIENT_IS_UNREACHABLE':
      return "The recipient's account does not exist, or does not accept incoming payments."
    case 'NO_RECIPIENT_CONFIRMATION':
      return "A confirmation from the recipient is required, but has not been obtained."
    case 'TRANSFER_NOTE_IS_TOO_LONG':
      return "The byte-length of the payment note is too big."
    case 'INSUFFICIENT_AVAILABLE_AMOUNT':
      return "The requested amount is not available on the sender's account."
    case 'TERMINATED':
      return "The payment has been terminated due to expired deadline, unapproved "
        + "interest rate change, or some other temporary or correctable condition. If "
        + "the payment is retried with the correct options, chances are that it can "
        + "be committed successfully."
    default:
      return errorCode
    }
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

  export function getStatusTooltip(t: TransferRecord): string {
    let tooltip = `The payment was initiated at ${new Date(t.initiatedAt).toLocaleString()}`
    if (t.result) {
      const finalizedAt = new Date(t.result.finalizedAt).toLocaleString()
      if (t.result.error) {
        const reason = getFailureReason(t.result.error.errorCode)
        tooltip += `, and failed at ${finalizedAt}.`
        tooltip += `The reason for the failure is: "${reason}"`
      } else {
        tooltip += `, and succeeded at ${finalizedAt}.`
      }
    } else {
      tooltip += '.'
    }
    return tooltip
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

  function update(): void {
    app.fetchDataFromServer(() => model.reload())
  }

  onDestroy(revokeCurrentDataUrl)

  $: transfer = model.transfer
  $: unitAmount = getUnitAmount($transfer)
  $: deadline = getDeadline($transfer)
  $: display = $transfer.display
  $: unit = display?.unit ?? '\u00a4'
  $: paymentInfo = parseTransferNote($transfer)
  $: status = getStatus($transfer)
  $: statusTooltip = getStatusTooltip($transfer)
  $: dataUrl = generateDataUrl($transfer)
  $: payeeName = $transfer.paymentInfo.payeeName ?? 'Unknown payee'
  $: payeeReference = $transfer.paymentInfo.payeeReference
  $: downloadNameShort = `Pay ${unitAmount} ${unit} to ${payeeName}`
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
    {#if status === 'Initiated'}
      <div out:fade="{{ duration: 1000 }}" class="fab-container">
        <Fab on:click={update}>
          <Icon class="material-icons">sync</Icon>
        </Fab>
      </div>
    {/if}
  </svelte:fragment>
</Page>
