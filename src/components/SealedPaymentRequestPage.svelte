<script lang="ts">
  import type { AppState, PaymentRequestActionWithId, SealedPaymentRequestModel } from '../app-state'
  import { getExpectedPaymentAmount } from '../operations'
  import { amountToString } from '../format-amounts'
  import { onMount, onDestroy } from 'svelte'
  import Fab, { Label as FabLabel } from '@smui/fab'
  import { Row } from '@smui/top-app-bar'
  import { Title as DialogTitle, Content as DialogContent, Actions, InitialFocus } from '@smui/dialog'
  import Paper, { Title, Content } from '@smui/paper'
  import Button, { Label } from '@smui/button'
  import Chip, { Text } from '@smui/chips'
  import QrGenerator from './QrGenerator.svelte'
  import Page from './Page.svelte'
  import Dialog from './Dialog.svelte'
  import DoneSvgIcon from './DoneSvgIcon.svelte'

  export let app: AppState
  export let model: SealedPaymentRequestModel
  export const snackbarBottom: string = "84px"
  export const scrollElement = document.documentElement

  assert(model.action.sealedAt !== undefined)
  const POLLING_INTERVAL: number = 5 * 1000  // 5 seconds

  let doneIcon: HTMLElement
  let showConfirmDialog = false
  let downloadImageElement: HTMLAnchorElement
  let downloadTextElement: HTMLAnchorElement
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let imageDataUrl: string = ''
  let textDataUrl: string = URL.createObjectURL(new Blob([model.paymentRequest], { type: 'application/octet-stream' }))
  let updatedPaidAmount: bigint | undefined
  let timeoutId: number | undefined
  let pollingDeadline: number = Date.now() + 10 * 60 * 1000  // 10 minutes from now
  let baseAmount: bigint = model.baseAmount

  function createUpdatedAction(): PaymentRequestActionWithId {
    return {
      ...action,
      baseAmount: baseAmount,
    }
  }

  function showAccount(): void {
    const m = {
      ...model,
      baseAmount: baseAmount,
      scrollTop: scrollElement.scrollTop,
      scrollLeft: scrollElement.scrollLeft,
    }
    app.startInteraction()
    app.showAccount(accountUri, () => app.pageModel.set(m))
  }

  function scheduleUpdateIfNecessary(): void {
    if (!done && timeoutId === undefined && Date.now() <= pollingDeadline) {
      timeoutId = window.setTimeout(() => {
        app.scheduleUpdate(async () => {
          updatedPaidAmount = await getExpectedPaymentAmount(action.payeeReference)
          timeoutId = undefined
          scheduleUpdateIfNecessary()
        })
      }, POLLING_INTERVAL)
    }
  }

  function remove(): void {
    if (!showConfirmDialog) {
      app.startInteraction()
      showConfirmDialog = true
    }
  }

  function freeUsedResources() {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    if (textDataUrl) {
      URL.revokeObjectURL(textDataUrl)
    }
    pollingDeadline = -Infinity
  }

  function toggleAmount() {
    if (amount === 0n && baseAmount === 0n) {
      baseAmount = paidAmount
    } else {
      baseAmount = 0n
    }
    actionManager.save()
  }

  onMount(scheduleUpdateIfNecessary)
  onDestroy(freeUsedResources)

  $: action = model.action
  $: paidAmount = (updatedPaidAmount ?? model.paidAmount) - baseAmount
  $: accountUri = action.accountUri
  $: sealedAt = action.sealedAt
  $: accountData = model.accountData
  $: display = accountData.display
  $: debtorName = display.debtorName
  $: amountDivisor = display.amountDivisor
  $: decimalPlaces = display.decimalPlaces
  $: paidUnitAmount = amountToString(paidAmount, amountDivisor, decimalPlaces)
  $: amount = action.editedAmount ?? 0n
  $: done = amount > 0n && amount <= paidAmount
  $: deadline = new Date(action.editedDeadline)
  $: unitAmount = amountToString(amount, amountDivisor, decimalPlaces)
  $: unit = display.unit ?? '\u00a4'
  $: amountSuffix = unit.slice(0, 10)
  $: payeeName = action.editedPayeeName
  $: rawFileName = amount ? action.payeeReference : `Generic payment request - ${debtorName}`
  $: fileName = rawFileName.replace(/[<>:"/|?*\\]/g, ' ')
  $: imageFileName = `${fileName}.png`
  $: textFileName = `${fileName}.pr0`
  $: if (done && doneIcon) {
      doneIcon.className += ' rotate'
  }
</script>

<style>
  .empty-space {
    height: 72px;
  }
  pre {
    color: #888;
    margin-top: 16px;
    font-size: 0.9em;
    font-family: "Roboto Mono", monospace;
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
    overflow: hidden;
  }
  .received-amount-container {
    flex-grow: 1;
    margin-left: 10px;
    word-break: break-word;
  }
  .received-text {
    font-size: 13px;
    font-family: Roboto, sans-serif;
    color: #888;
  }
  .received-amount {
    margin-top: 5px;
    font-size: 25px;
    font-family: "Cutive Mono", monospace;
  }
  .received-amount a {
    text-decoration: none;
    color: black;
  }
  .received-icon {
    flex-grow: 0;
    width: 60px;
    padding-right: 6px;
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
  .qrcode-container :global(canvas) {
    width: 100%;
    max-width: 66vh;
  }
  .download-link {
    display: none;
  }
  .important {
    font-weight: bold;
    font-size: 1.1em;
    margin-top: 16px;
  }
  .fab-container {
    margin: 16px 16px;
  }

  @keyframes rotate {
    0% { transform: scale(0.3, 0.3) rotate(0deg); }
    100% { transform: scale(1, 1) rotate(720deg); }
  }

  :global(.rotate) {
    animation: rotate 0.8s;
    animation-iteration-count: 1;
  }
</style>

<div>
  <Page title="Payment request" scrollTop={model.scrollTop} scrollLeft={model.scrollLeft}>
    <svelte:fragment slot="app-bar">
      <Row style="height: 72px">
        <div class="received-box">
          <div class="received-amount-container">
            <div class="received-text">
                {#if baseAmount === 0n }
                  {#if amount === 0n}
                    total{/if} received
                {:else}
                  last received
                {/if}
            </div>
            <div class="received-amount">
              <a href="." on:click|preventDefault={toggleAmount}>
                {paidUnitAmount} {amountSuffix}
              </a>
            </div>
          </div>
          <div bind:this={doneIcon} class="received-icon">
            {#if done}
              <DoneSvgIcon />
            {/if}
          </div>
        </div>
      </Row>
    </svelte:fragment>

    <svelte:fragment slot="content">
      <div slot="content">
        <div class="empty-space"></div>
        <div class="qrcode-container">
          <QrGenerator value={model.paymentRequest} bind:dataUrl={imageDataUrl} />
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
                  <a href="." style="text-decoration: none; color: #666" on:click|preventDefault={showAccount}>
                    account
                  </a>
                </Text>
              </Chip>
              Payment via "{debtorName}"
            </Title>
            <Content>
              <a href="qr" target="_blank" rel="noreferrer" on:click|preventDefault={() => downloadImageElement?.click()}>
                The QR code above
              </a>
              {#if amount === 0n}
                represents a generic payment request from "{payeeName}".
              {:else}
                represents a request {unitAmount} {unit} to be paid to "{payeeName}".
              {/if}

              This payment request has been created at
              {sealedAt?.toLocaleString()}.

              {#if deadline.getTime()}
                The deadline for the payment is {deadline.toLocaleString()}.
              {/if}

              {#if action.editedNote}
                <pre>{action.editedNote}</pre>
              {/if}

              <p class="important">
                Show the QR code to the payer, or download and send a
                file. Discard this payment request once the
                corresponding payment has been received!
              </p>
            </Content>
          </Paper>
        </div>
      </div>

      {#if showConfirmDialog}
        <Dialog
          open
          scrimClickAction=""
          aria-labelledby="confirm-delete-dialog-title"
          aria-describedby="confirm-delete-dialog-content"
          on:MDCDialog:closed={() => showConfirmDialog = false}
          >
          <DialogTitle id="confirm-delete-dialog-title">Discard this payment request</DialogTitle>
          <DialogContent id="confirm-delete-dialog-content">
            {#if done}
              Are you sure you want to do this?
            {:else}
              If you discard this payment request, you may fail to
              notice the corresponding payment. Are you sure you want
              to do this?
            {/if}
          </DialogContent>
          <Actions>
            <Button>
              <Label>No</Label>
            </Button>
            <Button default use={[InitialFocus]} on:click={() => actionManager.remove()}>
              <Label>Yes</Label>
            </Button>
          </Actions>
        </Dialog>
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab on:click={() => downloadTextElement.click()} extended>
          <FabLabel>Download</FabLabel>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={remove} extended>
          <FabLabel>Discard</FabLabel>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
