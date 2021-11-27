<script lang="ts">
  import { getContext } from 'svelte'
  import type { AppState } from '../app-state'
  import { HAS_LOADED_PAYMENT_REQUEST_KEY } from '../app-state'
  import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import QrScanner from './QrScanner.svelte'
  import Dialog from './Dialog.svelte'

  export let open: boolean = true

  const app: AppState = getContext('app')
  let scannedValue: string | undefined
  let fileInputElement: HTMLInputElement
  let files: FileList | undefined

  function markDone() {
    localStorage.setItem(HAS_LOADED_PAYMENT_REQUEST_KEY, 'true')
  }

  function chooseFile() {
    fileInputElement.click()
  }

  $: if (scannedValue) {
    app.initiatePayment(new Blob([scannedValue]))
    open = false
    scannedValue = undefined
    markDone()
  }
  $: chosenFile = files?.[0]
  $: if (chosenFile) {
    app.initiatePayment(chosenFile)
    markDone()
    fileInputElement.value = ''
  }
</script>

<style>
  .invisible {
    display: none;
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
    on:MDCDialog:closed={() => open = false}
    >
    <Title id="payment-dialog-title">Scan the QR code of the payment request</Title>
    <Content id="payment-dialog-content">
      <QrScanner bind:result={scannedValue}/>
    </Content>
    <Actions>
      <Button on:click={chooseFile}>
        <Label>Load from file</Label>
      </Button>
      <Button default use={[InitialFocus]}>
        <Label>Close</Label>
      </Button>
    </Actions>
  </Dialog>
{/if}
