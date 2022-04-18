<script lang="ts">
  import type { AppState, SealedPaymentRequestModel } from '../app-state'
  import { amountToString } from '../format-amounts'
  import { onDestroy } from 'svelte'
  import Fab, { Icon } from '@smui/fab'
  import { Row } from '@smui/top-app-bar'
  import Paper, { Title, Content } from '@smui/paper'
  import Chip, { Text } from '@smui/chips'
  import QrGenerator from './QrGenerator.svelte'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: SealedPaymentRequestModel
  export const snackbarBottom: string = "84px"
  export const scrollElement = document.documentElement

  assert(model.action.sealed)

  let downloadImageElement: HTMLAnchorElement
  let downloadTextElement: HTMLAnchorElement
  let actionManager = app.createActionManager(model.action)
  let imageDataUrl: string = ''
  let textDataUrl: string = URL.createObjectURL(new Blob([model.paymentRequest]))

  function showAccount(): void {
    const m = {
      ...model,
      scrollTop: scrollElement.scrollTop,
      scrollLeft: scrollElement.scrollLeft,
    }
    app.showAccount(accountUri, () => app.pageModel.set(m))
  }

  function revokeTextDataUrl() {
    if (textDataUrl) {
      URL.revokeObjectURL(textDataUrl)
    }
  }

  onDestroy(revokeTextDataUrl)

  $: action = model.action
  $: accountUri = action.accountUri
  $: accountData = model.accountData
  $: display = accountData.display
  $: debtorName = display.debtorName
  $: amountDivisor = display.amountDivisor
  $: decimalPlaces = display.decimalPlaces
  $: amount = action.editedAmount ?? 0n
  $: deadline = new Date(action.editedDeadline)
  $: unitAmount = amountToString(amount, amountDivisor, decimalPlaces)
  $: unit = display.unit ?? '\u00a4'
  $: payeeName = action.editedPayeeName
  $: fileName = `${debtorName} - ${action.payeeReference.slice(0, 8)}`
  $: imageFileName = `${fileName}.png`
  $: textFileName = `${fileName}.pr0`
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

<div>
  <Page title="Request payment" scrollTop={model.scrollTop} scrollLeft={model.scrollLeft}>
    <svelte:fragment slot="app-bar">
      <Row style="height: 56px">
        <div class="received-box">
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
          <Paper elevation={8} style="margin: 0 16px 24px 16px; word-break: break-word">
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
              <a href="qr" target="_blank" on:click|preventDefault={() => downloadImageElement?.click()}>
                The QR code above
              </a>
              {#if amount === 0n}
                represents a generic payment request from "{payeeName}".
              {:else}
                represents a request {unitAmount} {unit} to be paid to "{payeeName}".
              {/if}

              {#if deadline.getTime()}
                The deadline for this payment is {deadline.toLocaleString()}.
              {/if}

              {#if action.editedNote}
                <pre>{action.editedNote}</pre>
              {/if}
            </Content>
          </Paper>
        </div>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
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
    </svelte:fragment>
  </Page>
</div>
