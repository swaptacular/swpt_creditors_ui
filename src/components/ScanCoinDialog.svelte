<script lang="ts">
  import { getContext } from 'svelte'
  import type { AppState } from '../app-state'
  import { HAS_SCANNED_DIGITAL_COIN_KEY } from '../app-state'
  import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import QrScanner from './QrScanner.svelte'
  import Dialog from './Dialog.svelte'

  export let open: boolean = true

  const app: AppState = getContext('app')
  let scannedValue: string | undefined

  function markDone() {
    localStorage.setItem(HAS_SCANNED_DIGITAL_COIN_KEY, 'true')
  }

  $: if (scannedValue) {
    app.createCreateAccountAction(scannedValue)
    open = false
    scannedValue = undefined
    markDone()
  }
</script>

{#if open}
  <Dialog
    open
    scrimClickAction=""
    aria-labelledby="scan-coin-dialog-title"
    aria-describedby="scan-coin-dialog-content"
    on:MDCDialog:closed={() => open = false}
    >
    <Title id="scan-coin-dialog-title">Scan the digital coin (a QR code)</Title>
    <Content id="scan-coin-dialog-content">
      <QrScanner bind:result={scannedValue}/>
    </Content>
    <Actions>
      <Button default use={[InitialFocus]}>
        <Label>Close</Label>
      </Button>
    </Actions>
  </Dialog>
{/if}
