<script lang="ts">
  import type {
    AppState, CreateTransferActionStatus, CreateTransferModel, CreateTransferActionWithId
  } from '../app-state'
  import { INVALID_REQUEST_MESSAGE } from '../app-state'
  import { getCreateTransferActionStatus } from '../operations'
  import { amountToString, limitAmountDivisor, MAX_INT64 } from '../format-amounts'
  import { generatePayment0TransferNote } from '../payment-requests'
  import Fab, { Icon, Label } from '@smui/fab';
  // import LayoutGrid, { Cell } from '@smui/layout-grid'
  // import Paper, { Title, Content } from '@smui/paper'
  import Page from './Page.svelte'
  import PaymentInfo from './PaymentInfo.svelte'

  export let app: AppState
  export let model: CreateTransferModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let payeeName: string = model.action.paymentInfo.payeeName
  let unitAmount: string | number = getInitialUnitAmount(model)
  let deadline: string = getInitialDeadline(model)

  let invalidPayeeName: boolean | undefined
  let invalidUnitAmount: boolean | undefined
  let invalidDeadline: boolean | undefined

  function createUpdatedAction(): CreateTransferActionWithId {
    const paymentInfo = {
      ...action.paymentInfo,
      payeeName,
    }
    return {
      ...action,
      paymentInfo,
      creationRequest: {
        ...action.creationRequest,
        amount: amountToSend ?? 0n,
        noteFormat: action.requestedAmount ? 'PAYMENT0' : 'payment0',
        note: generatePayment0TransferNote(paymentInfo, noteMaxBytes),
        options: {
          type: 'TransferOptions',
          deadline: new Date(deadline).toISOString(),
        },
      },
    }
  }

  function getInitialUnitAmount(model: CreateTransferModel): string {
    const amount = model.action.creationRequest.amount
    const display = model.accountData?.display
    const amountDivisor = display?.amountDivisor ?? 1
    const decimalPlaces = display?.decimalPlaces ?? 0n
    return amount ? amountToString(amount, amountDivisor, decimalPlaces) : ''
  }

  function getInitialDeadline(model: CreateTransferModel): string {
    let deadline = new Date(model.action.creationRequest.options?.deadline ?? '')
    if (Number.isNaN(deadline.getTime())) {
      return '9999-12-31T23:59:00'
    }
    deadline.setMinutes(deadline.getMinutes() + deadline.getTimezoneOffset())
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
        + 'but it was unsuccessful. '
        + 'It is safe to retry the transfer, though.'
    case 'Not confirmed':
      return 'An attempt has been made to transfer the amount, '
        + 'but it is unknown whether the amount was successfully transferred or not. '
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

  function amountToBigint(amount: unknown, divisor: number): bigint | undefined {
    let result
    if (amount !== '') {
      let x = Number(amount)
      if (Number.isFinite(x)) {
        x = Math.max(0, x) * limitAmountDivisor(divisor)
        result = BigInt(Math.ceil(x))
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

  function execute(): void {
    if (invalid) {
      shakeForm()
    } else if (status === 'Timed out') {
      // Timed out payments can not be executed, but still must be
      // acknowledged (not dismissed), because they may have resulted
      // in a transfer.
      actionManager.remove()
    } else {
      // TODO:
    }
  }

  $: action = model.action
  $: accountData = model.accountData
  // $: forbidAmountChange = action.requestedAmount > 0
  // $: deadline = action.requestedDeadline
  $: description = action.paymentInfo.description
  $: noteMaxBytes = Number(accountData?.info.noteMaxBytes ?? 500n)
  $: display = accountData?.display
  $: amountDivisor = display?.amountDivisor ?? 1
  $: decimalPlaces = display?.decimalPlaces ?? 0n
  $: unit = display?.unit ?? '\u00a4'
  $: status = getCreateTransferActionStatus(action)
  $: forbidChange = status !== 'Draft'
  $: executeButtonLabel = (status !== 'Initiated' && status !== 'Timed out' && status !== 'Failed') ? "Send" : 'Acknowledge'
  $: executeButtonIsHidden = (status === 'Failed')
  $: dismissButtonIsHidden = (status === 'Not confirmed' || status === 'Initiated' || status === 'Timed out')
  $: title = status === 'Draft' ? 'Payment request' : `${status} payment`
  $: tooltip = getInfoTooltip(status)
  $: amountToSend = amountToBigint(unitAmount, amountDivisor)
  $: invalid = (
    invalidPayeeName ||
    invalidUnitAmount ||
    invalidDeadline
  )

  /*
  $: accountData = model.accountData
  $: pegBounds = accountData.pegBounds
  $: pegBound = pegBounds[0]
  $: display = accountData.display
  $: debtorName = display.debtorName
  $: transfer = model.ledgerEntry
  $: committedTransfer = transfer.transfer
  $: rationale = committedTransfer?.rationale
  $: paymentInfo = committedTransfer ? parseTransferNote(committedTransfer) : dumyPaymentInfo
  $: payeeName = paymentInfo.payeeName
  $: description = paymentInfo.description
  $: payeeReference = paymentInfo.payeeReference
  $: contentFormat = description.contentFormat
  $: content = description.content
  $: amount = transfer.acquiredAmount
  $: displayAmount = calcDisplayAmount(amount)
  */
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
</style>

<div class="shaking-container">
  <Page title="Make payment">
    <svelte:fragment slot="content">
      <div bind:this={shakingElement}>
        <form
          noValidate
          autoComplete="off"
          on:input={() => actionManager.markDirty()}
          on:change={() => actionManager.save()}
          >
          <PaymentInfo
            bind:payeeName
            bind:unitAmount
            bind:deadline
            bind:invalidPayeeName
            bind:invalidUnitAmount
            bind:invalidDeadline
            {description}
            {title}
            {tooltip}
            {forbidChange}
            {amountDivisor}
            {decimalPlaces}
            {unit}
            />
        </form>
      </div>
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
          <Fab color="primary" on:click={execute} extended>
            <Icon class="material-icons">monetization_on</Icon>
            <Label>{executeButtonLabel}</Label>
          </Fab>
        </div>
      {/if}
    </svelte:fragment>
  </Page>
</div>
