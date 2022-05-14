<script lang="ts">
  import type {
    AppState, AbortTransferModel, TransferRecord, AccountDisplayRecord, AbortTransferActionWithId
  } from '../app-state'
  import { getTransferStatusDetails } from '../operations'
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

  function getStatus(transfer: TransferRecord): string {
    return transfer.result ? "Failed" : "Delayed"
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
  $: statusTooltip = getTransferStatusDetails(transfer)

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
