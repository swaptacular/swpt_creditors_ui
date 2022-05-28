<script lang="ts">
  import type {
    AppState, CreateTransferActionStatus, CreateTransferModel, CreateTransferActionWithId, AccountFullData
  } from '../app-state'
  import { INVALID_REQUEST_MESSAGE } from '../app-state'
  import { getCreateTransferActionStatus } from '../operations'
  import { generatePr0Blob } from '../payment-requests'
  import { amountToString, limitAmountDivisor, MAX_INT64 } from '../format-amounts'
  import { onDestroy } from 'svelte'
  import { Title as DialogTitle, Content as DialogContent, Actions, InitialFocus } from '@smui/dialog'
  import Button, { Label as ButtonLabel } from '@smui/button'
  import Fab, { Icon, Label } from '@smui/fab'
  import Page from './Page.svelte'
  import PaymentInfo from './PaymentInfo.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'
  import Dialog from './Dialog.svelte'

  export let app: AppState
  export let model: CreateTransferModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let unitAmount: unknown = getUnitAmount(model.accountData, model.action.editedAmount)
  let deadline: string = getInitialDeadline(model)
  let showConfirmDialog = false
  let openEnterPinDialog = false
  let currentDataUrl: string
  let invalid: boolean | undefined

  function createUpdatedAction(): CreateTransferActionWithId {
    if (!isDraft) return action

    // In case the user has not edited the amount, we want the sent
    // amount to be exactly the same as the requested amount.
    const editedAmount = unchangedAmount ? action.requestedAmount : amountToBigint(unitAmount, amountDivisor)
    const editedDeadline = new Date(deadline)
    return {
      ...action,
      editedDeadline: Number.isNaN(editedDeadline.getTime()) ? undefined : editedDeadline,
      editedAmount,
    }
  }

  function getUnitAmount(accountData: AccountFullData | undefined, amount: bigint): string {
    const display = accountData?.display
    const amountDivisor = display?.amountDivisor ?? 1
    const decimalPlaces = display?.decimalPlaces ?? 0n
    return amount ? amountToString(amount, amountDivisor, decimalPlaces) : ''
  }

  function resetAmount(): void {
    if (isDraft) {
      unitAmount = getUnitAmount(accountData, action.requestedAmount)
      actionManager.save()
    }
  }

  function getInitialDeadline(model: CreateTransferModel): string {
    let deadline = new Date(model.action.editedDeadline ?? '')
    if (Number.isNaN(deadline.getTime())) {
      const requestedDeadline = model.action.requestedDeadline
      if (requestedDeadline) {
        deadline = new Date(requestedDeadline)
        assert(!Number.isNaN(deadline.getTime()))
      } else {
        return '9999-12-31T23:59'
      }
    }
    deadline.setMinutes(deadline.getMinutes() - deadline.getTimezoneOffset())
    deadline.setSeconds(0)
    deadline.setMilliseconds(0)
    const isoDeadline = deadline.toISOString()
    return isoDeadline.slice(0, isoDeadline.length - 1)
  }

  function getInfoTooltip(status: CreateTransferActionStatus): string {
    switch (status) {
    case 'Draft':
      return 'No attempts to transfer the amount have been made yet.'
    case 'Not sent':
      return 'An attempt has been made to transfer the amount, '
        + 'but it has been unsuccessful. '
        + 'It is safe to retry the transfer, though.'
    case 'Not confirmed':
      return 'An attempt has been made to transfer the amount, '
        + 'but it is unknown whether the amount has been successfully transferred or not. '
        + 'It is safe to retry the transfer, though.'
    case 'Initiated':
      return 'The payment has been initiated successfully.'
    case 'Failed':
      return INVALID_REQUEST_MESSAGE
    case 'Timed out':
      return 'An attempt has been made to transfer the amount, '
        + 'but it is unknown whether the amount has been successfully transferred or not. '
        + 'It is not safe to retry the transfer.'
    }
  }

  function revokeCurrentDataUrl() {
    if (currentDataUrl) {
      URL.revokeObjectURL(currentDataUrl)
    }
  }

  function generateDataUrl(action: CreateTransferActionWithId): string {
    const blob = generatePr0Blob({
      ...action.paymentInfo,
      accountUri: action.recipientUri,
      amount: action.requestedAmount,
      deadline: action.requestedDeadline,
    }, { mimeType: 'application/octet-stream'})
    revokeCurrentDataUrl()
    return currentDataUrl = URL.createObjectURL(blob)
  }

  function createUpdatedModel(): CreateTransferModel {
    actionManager.save()
    return {
      ...model,
      action: actionManager.currentValue,
    }
  }

  const showAccount = model.accountData ? () => {
    assert(model.accountData)
    const accountUri = model.accountData.account.uri
    const m = createUpdatedModel()
    app.showAccount(accountUri, () => app.pageModel.set(m))
  } : undefined

  function amountToBigint(amount: unknown, divisor: number): bigint {
    let result = 0n
    if (amount !== '') {
      let x = Number(amount)
      if (Number.isFinite(x)) {
        x = Math.max(0, x) * limitAmountDivisor(divisor)
        result = BigInt(Math.round(x))
        if (result < 0n) {
          result = 0n
        }
        if (result > MAX_INT64) {
          result = MAX_INT64
        }
      }
    }
    return result
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement && (shakingElement.className = origClassName) }, 1000)
    }
  }

  function confirm(): void {
    if (invalid && isDraft) {
      shakeForm()
    } else if (status === 'Timed out') {
      // Timed out payments can not be executed, but still must be
      // acknowledged (not dismissed), because they may have resulted
      // in a transfer.
      actionManager.remove()
    } else if (requestedUnitAmount !== '' && !unchangedAmount) {
      showConfirmDialog = true
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    app.executeCreateTransferAction(actionManager, pin)
  }

  onDestroy(revokeCurrentDataUrl)

  $: action = model.action
  $: accountData = model.accountData
  $: requestedUnitAmount = getUnitAmount(accountData, action.requestedAmount)
  $: unchangedAmount = Number(unitAmount) === Number(requestedUnitAmount)
  $: paymentInfo = action.paymentInfo
  $: display = accountData?.display
  $: amountDivisor = display?.amountDivisor ?? 1
  $: unit = display?.unit ?? '\u00a4'
  $: status = getCreateTransferActionStatus(action)
  $: isDraft = status === 'Draft'
  $: executeButtonLabel = (status !== 'Initiated' && status !== 'Timed out' && status !== 'Failed') ? "Send" : 'Acknowledge'
  $: executeButtonIsHidden = (status === 'Failed')
  $: dismissButtonIsHidden = (status === 'Not confirmed' || status === 'Initiated' || status === 'Timed out')
  $: statusTooltip = getInfoTooltip(status)
  $: dataUrl = generateDataUrl(action)
</script>

<style>
  .fab-container {
    margin: 24px 16px;
  }
</style>

<div class="shaking-container">
  <Page title="Make payment" hideFloating={openEnterPinDialog}>
    <svelte:fragment slot="content">
      <EnterPinDialog bind:open={openEnterPinDialog} performAction={submit} />

      <div bind:this={shakingElement}>
        <form
          noValidate
          autoComplete="off"
          on:input={() => actionManager.markDirty()}
          on:change={() => actionManager.save()}
          >
          <PaymentInfo
            bind:invalid
            bind:unitAmount
            bind:deadline
            {display}
            {showAccount}
            {paymentInfo}
            {status}
            {statusTooltip}
            {dataUrl}
            />
        </form>
      </div>
      {#if showConfirmDialog}
        <Dialog
          open
          scrimClickAction=""
          aria-labelledby="confirm-change-amount-dialog-title"
          aria-describedby="confirm-change-amount-dialog-content"
          on:MDCDialog:closed={() => showConfirmDialog = false}
          >
          <DialogTitle id="confirm-change-amount-dialog-title">Changed amount</DialogTitle>
          <DialogContent id="confirm-change-amount-dialog-content">
            The amount that you are about to send ({unitAmount}
            {unit}), is not the same as the amount stated in the
            payment request ({requestedUnitAmount} {unit}). Are you
            sure you want to make this payment?
          </DialogContent>
          <Actions>
            <Button on:click={resetAmount}>
              <ButtonLabel>No</ButtonLabel>
            </Button>
            <Button default use={[InitialFocus]} on:click={() => openEnterPinDialog = true}>
              <ButtonLabel>Yes</ButtonLabel>
            </Button>
          </Actions>
        </Dialog>
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="floating">
      {#if !dismissButtonIsHidden}
        <div class="fab-container">
          <Fab color={executeButtonIsHidden ? "primary" : "secondary"} on:click={() => actionManager.remove()} extended>
            <Label>Dismiss</Label>
          </Fab>
        </div>
      {/if}
      {#if !executeButtonIsHidden}
        <div class="fab-container">
          <Fab color="primary" on:click={confirm} extended>
            <Icon class="material-icons">monetization_on</Icon>
            <Label>{executeButtonLabel}</Label>
          </Fab>
        </div>
      {/if}
    </svelte:fragment>
  </Page>
</div>
