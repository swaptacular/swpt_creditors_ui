<script lang="ts">
  import type { AppState, PaymentRequestModel, PaymentRequestActionWithId } from '../app-state'
  import {
    amountToString, limitAmountDivisor, calcSmallestDisplayableNumber, MAX_INT64
  } from '../format-amounts'
  import { generatePayment0TransferNote } from '../payment-requests'
  import { Alert } from '../app-state'
  import Fab, { Label } from '@smui/fab'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Paper, { Title, Content } from '@smui/paper'
  import Chip, { Text } from '@smui/chips'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: PaymentRequestModel
  export const snackbarBottom: string = "84px"
  export const scrollElement = document.documentElement

  assert(model.action.sealedAt === undefined)
  const utf8encoder = new TextEncoder()
  const emptyNoteBytes = getByteLength(generatePayment0TransferNote({
    payeeName: '',
    payeeReference: model.action.payeeReference,
    description: { contentFormat: '.', content: '' },
  }))
  const payeeNameMaxChars = Math.max(0, Math.min(40, calcNoteBytesLimit('') / 4))

  let shakingElement: HTMLElement
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let unitAmount: unknown = calcInitialUnitAmount(model)
  let payeeName: string = model.action.editedPayeeName.slice(0, payeeNameMaxChars)
  let deadline: string = model.action.editedDeadline
  let note: string = model.action.editedNote
  let invalidUnitAmount: boolean | undefined
  let invalidPayeeName: boolean | undefined
  let invalidDeadline: boolean | undefined
  let invalidNote: boolean | undefined

  function createUpdatedAction(): PaymentRequestActionWithId {
    return {
      ...action,
      editedAmount: requestedAmount,
      editedPayeeName: payeeName,
      editedDeadline: deadline,
      editedNote: note,
    }
  }

  function formatAsUnitAmount(
    amount: bigint | number | undefined,
    amountDivisor: number,
    decimalPlaces: bigint,
  ): string {
    if (amount === undefined) {
      return ''
    }
    return amountToString(amount, amountDivisor, decimalPlaces)
  }

  function calcInitialUnitAmount(model: PaymentRequestModel): string {
    let n: bigint | undefined = model.action.editedAmount
    if (n !== undefined && n < 0n) {
      n = undefined
    }
    return formatAsUnitAmount(n, model.accountData.display.amountDivisor, model.accountData.display.decimalPlaces)
  }

  function amountToBigint(amount: unknown, divisor: number): bigint | undefined {
    let result
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

  function getByteLength(s: string): number {
    return utf8encoder.encode(s).length
  }

  function calcNoteBytesLimit(payeeName: string): number {
    return (
      + Number(model.accountData.info.noteMaxBytes)
      - emptyNoteBytes
      - getByteLength(payeeName)
      - 50  // Some bytes must be left unused, so that other info can
            // be added.
            //
            // NOTE: The value must be at least DEFAULT_SURPLUS_BYTES
            // + 3 (see the "+3" comment in calcPayment0NoteByteLength).
    )
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement && (shakingElement.className = origClassName) }, 1000)
    }
  }

  function createUpdatedModel(): PaymentRequestModel {
    actionManager.save()
    return {
      ...model,
      action: actionManager.currentValue,
      scrollTop: scrollElement.scrollTop,
      scrollLeft: scrollElement.scrollLeft,
    }
  }

  function showAccount(): void {
    const m = createUpdatedModel()
    app.startInteraction()
    app.showAccount(accountUri, () => app.pageModel.set(m))
  }

  function cancel(): void {
    app.startInteraction()
    actionManager.remove(model.backToAccount)
  }

  function request(): void {
    app.startInteraction()
    if (invalid) {
      shakeForm()
    } else if (requestedAmount && requestedAmount < 3 * Math.max(negligibleAmount, 1)) {
      app.addAlert(new Alert(
        'The requested amount is too small. It should be at least three '
        + 'times bigger than the negligible amount for this account '
        + `(${negligibleUnitAmount} ${unit}).`
      ))
    } else {
      app.sealPaymentRequestAction(actionManager)
    }
  }

  $: action = model.action
  $: accountUri = action.accountUri
  $: accountData = model.accountData
  $: noteBytesLimit = calcNoteBytesLimit(payeeName)
  $: noteBytes = getByteLength(note)
  $: noteTooLong = noteBytes > noteBytesLimit
  $: erroneousNote = invalidNote || noteTooLong
  $: display = accountData.display
  $: amountDivisor = display.amountDivisor
  $: decimalPlaces = display.decimalPlaces
  $: debtorName = display.debtorName
  $: unit = display.unit ?? '\u00A4'
  $: amountSuffix = unit.slice(0, 10)
  $: tinyNegligibleAmount = calcSmallestDisplayableNumber(amountDivisor, decimalPlaces)
  $: unitAmountStep = formatAsUnitAmount(tinyNegligibleAmount, amountDivisor, decimalPlaces)
  $: requestedAmount = amountToBigint(unitAmount, amountDivisor)
  $: negligibleAmount = accountData.config.negligibleAmount
  $: negligibleUnitAmount = formatAsUnitAmount(negligibleAmount, amountDivisor, decimalPlaces)
  $: invalid = invalidUnitAmount || invalidPayeeName || invalidDeadline || erroneousNote
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
  .shaking-container {
    position: relative;
    overflow: hidden;
  }

  @keyframes shake {
    0% { transform: translate(1px, 1px) rotate(0deg); }
    10% { transform: translate(-1px, -2px) rotate(-1deg); }
    20% { transform: translate(-3px, 0px) rotate(1deg); }
    30% { transform: translate(3px, 2px) rotate(0deg); }
    40% { transform: translate(1px, -1px) rotate(1deg); }
    50% { transform: translate(-1px, 2px) rotate(-1deg); }
    60% { transform: translate(-3px, 1px) rotate(0deg); }
    70% { transform: translate(3px, 1px) rotate(-1deg); }
    80% { transform: translate(-1px, -1px) rotate(1deg); }
    90% { transform: translate(1px, 2px) rotate(0deg); }
    100% { transform: translate(1px, -2px) rotate(-1deg); }
  }

  :global(.shaking-block) {
    animation: shake 0.5s;
    animation-iteration-count: 1;
  }
</style>

<div class="shaking-container">
  <Page title="Request payment" scrollTop={model.scrollTop} scrollLeft={model.scrollLeft}>
    <svelte:fragment slot="content">
      <div bind:this={shakingElement}>
        <form
          noValidate
          autoComplete="off"
          on:input={() => actionManager.markDirty()}
          on:change={() => actionManager.save()}
          >
          <LayoutGrid>
            <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
              <Paper style="margin-top: 12px; margin-bottom: 24px; word-break: break-word" elevation={6}>
                <Title>
                  <Chip chip="account" style="float: right; margin-left: 6px">
                    <Text>
                      <a href="." style="text-decoration: none; color: #666" on:click|preventDefault={showAccount}>
                        account
                      </a>
                    </Text>
                  </Chip>
                  Payment via "{debtorName}"
                </Title>
                <Content style="clear: both">
                  To receive a payment, you should fill a payment
                  request, and then show the generated QR code to the
                  payer.
                </Content>
              </Paper>
            </Cell>

            <Cell>
              <Textfield
                required
                variant="outlined"
                type="number"
                input$min={0}
                input$step={unitAmountStep}
                style="width: 100%"
                withTrailingIcon={invalidUnitAmount}
                bind:value={unitAmount}
                bind:invalid={invalidUnitAmount}
                label="Amount"
                suffix="{amountSuffix}"
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidUnitAmount}
                    <TextfieldIcon class="material-icons">error</TextfieldIcon>
                  {/if}
                </svelte:fragment>
                <HelperText slot="helper" persistent>
                  The amount to be paid. You may enter "0" here, to
                  create a generic payment request.
                </HelperText>
              </Textfield>
            </Cell>

            <Cell>
              <Textfield
                required
                variant="outlined"
                style="width: 100%"
                input$maxlength={payeeNameMaxChars}
                input$spellcheck="false"
                bind:invalid={invalidPayeeName}
                bind:value={payeeName}
                label="Payee name"
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidPayeeName}
                    <TextfieldIcon class="material-icons">error</TextfieldIcon>
                  {/if}
                </svelte:fragment>
                <HelperText slot="helper" persistent>
                  The name of the recipient of the payment. This will
                  be your name, most of the time.
                </HelperText>
              </Textfield>
            </Cell>

            <Cell>
              <Textfield
                variant="outlined"
                style="width: 100%"
                type="datetime-local"
                bind:invalid={invalidDeadline}
                bind:value={deadline}
                label="Deadline"
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidDeadline}
                    <TextfieldIcon class="material-icons">error</TextfieldIcon>
                  {/if}
                </svelte:fragment>
                <HelperText slot="helper" persistent>
                  The payment must be completed before that moment
                  (optional).
                </HelperText>
              </Textfield>
            </Cell>

            <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
              <Textfield
                textarea
                variant="outlined"
                input$maxlength="500"
                style="width: 100%"
                bind:invalid={invalidNote}
                bind:value={note}
                label="Payment reason"
                >
                <div class="mdc-text-field-character-counter" slot="internalCounter">
                  {noteBytes} / {noteBytesLimit} bytes
                </div>
                <HelperText slot="helper" persistent>
                  This field may contain any information that you want
                  the payer to see, before making the
                  payment. Generally, it should describe the reason
                  for the payment (optional).
                </HelperText>
              </Textfield>
            </Cell>
          </LayoutGrid>
        </form>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab on:click={cancel} extended>
          <Label>Cancel</Label>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={request} extended>
          <Label>Request</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
