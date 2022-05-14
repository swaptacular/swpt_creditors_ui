<script lang="ts">
  import type { AppState, AbortTransferModel, TransferRecord, AccountDisplayRecord } from '../app-state'
  import type { AbortTransferActionWithId } from '../operations'
  import { amountToString } from '../format-amounts'
  import { parseTransferNote } from '../payment-requests'
  import Fab, { Label } from '@smui/fab';
  import Button, { Label as ButtonLabel } from '@smui/button'
  import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  import Dialog from './Dialog.svelte'
  import PaymentInfo from './PaymentInfo.svelte'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: AbortTransferModel
  export let action: AbortTransferActionWithId
  export const snackbarBottom: string = "84px"

  let showFailedCancellationDialog = false

  function getUnitAmount(amount: bigint, display?: AccountDisplayRecord): string {
    const amountDivisor = display?.amountDivisor ?? 1
    const decimalPlaces = display?.decimalPlaces ?? 0n
    return transfer.amount ? amountToString(amount, amountDivisor, decimalPlaces) : ''
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
    return transfer.result ? "Failed" : "Delayed"
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

  function retry() {
    app.retryTransfer(action)
  }

  function dismiss() {
    app.dismissTransfer(action)
  }

  function cancel() {
    app.cancelTransfer(action, () => { showFailedCancellationDialog = true })
  }

  function closeDialog() {
    showFailedCancellationDialog = false
  }

  $: action = model.action
  $: transfer = action.transfer
  $: title = transfer.result ? "Failed payment" : "Delayed payment"
  $: unitAmount = getUnitAmount(transfer.amount, model.accountData?.display)
  $: deadline = getDeadline(transfer)
  $: display = model.accountData?.display
  $: paymentInfo = parseTransferNote(transfer)
  $: status = getStatus(transfer)
  $: statusTooltip = getStatusTooltip(transfer)

  $: showAccount = display ? () => {
    assert(display)
    const accountUri = display.account.uri
    app.showAccount(accountUri, () => app.pageModel.set(model))
  } : undefined
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title={title}>
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

    {#if showFailedCancellationDialog}
      <Dialog
        open
        scrimClickAction=""
        aria-labelledby="failed-cancellation-title"
        aria-describedby="failed-cancellation-content"
        on:MDCDialog:closed={closeDialog}
        >
        <Title id="failed-cancellation-title">Failed payment cancellation</Title>
        <Content id="failed-cancellation-content">
          The attempt to cancel the delayed payment has failed. You
          can get rid of this payment, but please note that it is not
          certain whether the amount was successfully transferred or
          not.
        </Content>
        <Actions>
          <Button on:click={dismiss}>
            <ButtonLabel>Get rid of this payment</ButtonLabel>
          </Button>
          <Button default use={[InitialFocus]}>
            <ButtonLabel>OK</ButtonLabel>
          </Button>
        </Actions>
      </Dialog>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="floating">
    {#if transfer.result}
      <div class="fab-container">
        <Fab on:click={retry} extended>
          <Label>Retry</Label>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={dismiss} extended>
          <Label>Dismiss</Label>
        </Fab>
      </div>
    {:else}
      <div class="fab-container">
        <Fab color="primary" on:click={cancel} extended>
          <Label>Cancel payment</Label>
        </Fab>
      </div>
    {/if}
  </svelte:fragment>
</Page>
