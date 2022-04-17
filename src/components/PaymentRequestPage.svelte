<script lang="ts">
  import type { AppState, PaymentRequestModel, PaymentRequestActionWithId } from '../app-state'
  import {
    amountToString, limitAmountDivisor, calcSmallestDisplayableNumber, MAX_INT64
  } from '../format-amounts'
  import { generatePayment0TransferNote } from '../payment-requests'
  import { onDestroy } from 'svelte'
  import Fab, { Icon, Label } from '@smui/fab'
  import { Row } from '@smui/top-app-bar'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Paper, { Title, Content } from '@smui/paper'
  import Chip, { Text } from '@smui/chips'
  import QrGenerator from './QrGenerator.svelte'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: PaymentRequestModel
  export const snackbarBottom: string = "84px"
  export const scrollElement = document.documentElement

  const utf8encoder = new TextEncoder()

  let downloadImageElement: HTMLAnchorElement
  let downloadTextElement: HTMLAnchorElement
  let shakingElement: HTMLElement
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let unitAmount: unknown = calcInitialUnitAmount(model)
  let payeeName: string = model.action.editedPayeeName
  let deadline: string = model.action.editedDeadline
  let note: string = model.action.editedNote
  let sealed: boolean = model.action.sealed
  let invalidUnitAmount: boolean | undefined
  let invalidPayeeName: boolean | undefined
  let invalidDeadline: boolean | undefined
  let invalidNote: boolean | undefined

  let imageDataUrl: string = ''
  let textDataUrl: string = ''
  let emptyPayment0TransferNote = generatePayment0TransferNote({
    payeeName: '',
    payeeReference: '',
    description: { contentFormat: '', content: '' },
  })

  function createUpdatedAction(): PaymentRequestActionWithId {
    return {
      ...action,
      editedAmount: amountToBigint(unitAmount, amountDivisor),
      editedPayeeName: payeeName,
      editedDeadline: deadline,
      editedNote: note,
      sealed,
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
    if (typeof amount === 'number') {
      assert(Number.isFinite(amount))
      amount = BigInt(Math.ceil(amount))
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

  function revokeTextDataUrl() {
    if (textDataUrl) {
      URL.revokeObjectURL(textDataUrl)
    }
  }

  function generateDataUrl(s: string): string {
    const blob = new Blob([s])
    revokeTextDataUrl()
    return textDataUrl = URL.createObjectURL(blob)
  }

  function getByteLength(s: string): number {
    return utf8encoder.encode(s).length
  }

  function calcNoteBytesLimit(noteMaxBytes: bigint, payeeName: string): number {
    return (
      + Number(noteMaxBytes)
      - emptyPayment0TransferNote.length
      - getByteLength(payeeName)
      - 36  // This is the number of bytes in the generated payee reference.
      - 1   // The link-format ('.') could be used instead of the default text format ('').
      - 44  // Some bytes must be left unused, so that another UUID reference can be added.
    )
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function request(): void {
    if (invalid) {
      shakeForm()
    } else if (!sealed) {
      sealed = true
      scrollElement.scrollTop = 0
      scrollElement.scrollLeft = 0
      actionManager.save()
      app.setDefaultPayeeName(payeeName)
    } else {
      submit()
    }
  }

  function submit(): void {
    // TODO:
    // app.executeUpdatePolicyAction(actionManager, accountData.exchange.latestUpdateId, pin, model.backToAccount)
  }

  onDestroy(revokeTextDataUrl)

  $: action = model.action
  $: accountUri = action.accountUri
  $: accountData = model.accountData
  $: noteBytesLimit = calcNoteBytesLimit(accountData.info.noteMaxBytes, payeeName)
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
  $: paymentRequest = 'Demo payement request'.repeat(5)
  $: imageFileName = 'payment-request.png'
  $: textFileName = 'payment-request.pr0'
  $: invalid = invalidUnitAmount || invalidPayeeName || invalidDeadline || erroneousNote
  $: {
    generateDataUrl(paymentRequest)
  }
</script>

<style>
  .empty-space {
    height: 56px;
  }
  pre {
    color: #888;
    margin-top: 16px;
    font-size: 0.9em;
    font-family: monospace;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    width: 100%;
  }
  .received-box {
    width: 100%;
    height: 100%;
    color: black;
    background-color: #f4f4f4;
    border-bottom: 1px solid #ccc;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .text-container {
    display: flex;
    width: 100%;
    justify-content: center;
  }
  .qrcode-container {
    width: 100%;
    text-align: center;
  }
  .qrcode-container :global(img) {
    width: 100%;
    max-width: 66vh;
  }
  .download-link {
    display: none;
  }
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
  <Page title="Request payment">
    <svelte:fragment slot="app-bar">
      {#if sealed}
        <Row style="height: 56px">
          <div class="received-box">
          </div>
        </Row>
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="content">
      <div bind:this={shakingElement} slot="content">
        {#if sealed}
          <div class="empty-space"></div>
          <div class="qrcode-container">
            <QrGenerator
              value={paymentRequest}
              size={320}
              padding={28}
              errorCorrection="L"
              background="#FFFFFF"
              color="#000000"
              bind:dataUrl={imageDataUrl}
              />
          </div>
          <a class="download-link" href={imageDataUrl} download={imageFileName} bind:this={downloadImageElement}>
            download
          </a>
          <a class="download-link" href={textDataUrl} download={textFileName} bind:this={downloadTextElement}>
            download
          </a>
          <div class="text-container">
            <Paper elevation={8} style="margin: 0 16px 24px 16px; max-width: 600px; word-break: break-word">
              <Title>
                <Chip chip="account" style="float: right; margin-left: 6px">
                  <Text>
                    <a
                      href="."
                      style="text-decoration: none; color: #666"
                      on:click|preventDefault={() => app.showAccount(accountUri, () => app.showAction(action.actionId))}
                      >
                      account
                    </a>
                  </Text>
                </Chip>
                Payment via "{debtorName}"
              </Title>
              <Content>
                <a href="qr" target="_blank" on:click|preventDefault={() => downloadImageElement?.click()}>
                  The QR code above
                </a>
                describes a request 500.00 EUR to be paid to "Ivan
                Ivanov" before 1/1/2000.
                {#if true}
                  <pre>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</pre>
                {/if}
              </Content>
            </Paper>
          </div>
        {:else}
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
                        <a
                          href="."
                          style="text-decoration: none; color: #666"
                          on:click|preventDefault={() => app.showAccount(accountUri, () => app.showAction(action.actionId))}
                          >
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
                  input$maxlength="40"
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
                    {noteBytes} / {noteBytesLimit}
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
        {/if}
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      {#if sealed}
        <div class="fab-container">
          <Fab on:click={() => downloadTextElement.click()}>
            <Icon class="material-icons">download</Icon>
          </Fab>
        </div>
        <div class="fab-container">
          <Fab color="primary" on:click={() => actionManager.remove() }>
            <Icon class="material-icons">close</Icon>
          </Fab>
        </div>
      {:else}
        <div class="fab-container">
          <Fab on:click={() => actionManager.remove() } extended>
            <Label>Cancel</Label>
          </Fab>
        </div>
        <div class="fab-container">
          <Fab color="primary" on:click={request} extended>
            <Label>Request</Label>
          </Fab>
        </div>
      {/if}
    </svelte:fragment>
  </Page>
</div>
