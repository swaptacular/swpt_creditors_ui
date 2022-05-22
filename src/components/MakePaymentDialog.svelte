<script lang="ts">
  import type { AppState } from '../app-state'
  import { getContext } from 'svelte'
  import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import QrScanner from './QrScanner.svelte'
  import Dialog from './Dialog.svelte'

  export let open: boolean = true

  const app: AppState = getContext('app')
  let hasFlash: boolean = false
  let flashlightOn: boolean = false
  let scannedValue: string | undefined
  let fileInputElement: HTMLInputElement
  let files: FileList | undefined

  function close() {
    open = false
    flashlightOn = false
  }

  function chooseFile() {
    fileInputElement.click()
  }

  function toggleFlashlight() {
    flashlightOn = !flashlightOn
  }

  $: if (scannedValue) {
    app.initiatePayment(new Blob([scannedValue]))
    open = false
    scannedValue = undefined
  }
  $: chosenFile = files?.[0]
  $: if (chosenFile) {
    app.initiatePayment(chosenFile)
    fileInputElement.value = ''
  }
</script>

<style>
  .invisible {
    display: none;
  }
  .buttons-container {
    display: flex;
    width: 100%;
    justify-content: right;
    align-items: center;
  }
  .flashlight-button {
    flex-grow: 1;
    margin-left: 10px;
  }
</style>

<input
  type="file"
  class="invisible"
  accept=".pr0,application/vnd.swaptacular.pr0"
  bind:this={fileInputElement}
  bind:files
  />

{#if open}
  <Dialog
    open
    scrimClickAction=""
    aria-labelledby="payment-dialog-title"
    aria-describedby="payment-dialog-content"
    on:MDCDialog:closed={close}
    >
    <Title id="payment-dialog-title">Scan the QR code of the payment request</Title>
    <Content id="payment-dialog-content">
      <QrScanner bind:hasFlash bind:result={scannedValue} {flashlightOn} />
    </Content>
    <Actions>
      <div class="buttons-container">
        <div class="flashlight-button">
          {#if hasFlash}
            <i
              on:click={toggleFlashlight}
              style="user-select: none"
              class="material-icons"
              aria-hidden="true"
              >
              {flashlightOn ? 'flashlight_off' : 'flashlight_on'}
            </i>
          {/if}
        </div>
        <div>
          <Button on:click={chooseFile}>
            <Label>Load from file</Label>
          </Button>
          <Button default use={[InitialFocus]}>
            <Label>Close</Label>
          </Button>
        </div>
      </div>
    </Actions>
  </Dialog>
{/if}
