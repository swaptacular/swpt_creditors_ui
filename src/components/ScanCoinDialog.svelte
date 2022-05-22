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

  function close() {
    open = false
    flashlightOn = false
  }

  function toggleFlashlight() {
    flashlightOn = !flashlightOn
  }

  $: if (scannedValue) {
    app.createCreateAccountAction(scannedValue)
    open = false
    scannedValue = undefined
  }
</script>

<style>
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

{#if open}
  <Dialog
    open
    scrimClickAction=""
    aria-labelledby="scan-coin-dialog-title"
    aria-describedby="scan-coin-dialog-content"
    on:MDCDialog:closed={close}
    >
    <Title id="scan-coin-dialog-title">Scan the digital coin (a QR code)</Title>
    <Content id="scan-coin-dialog-content">
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
          <Button default use={[InitialFocus]}>
            <Label>Close</Label>
          </Button>
        </div>
      </div>
    </Actions>
  </Dialog>
{/if}
