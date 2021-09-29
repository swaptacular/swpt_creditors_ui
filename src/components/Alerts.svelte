<script lang="ts">
  import type { AppState, Alert } from '../app-state'
  import { Title, Content, Actions } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import Dialog from './Dialog.svelte'

  export let app: AppState
  export let alerts: Alert[]
</script>

{#if alerts.length > 0}
<Dialog
  open
  scrimClickAction=""
  aria-labelledby="alert-title"
  aria-describedby="alert-content"
  on:MDCDialog:closed={() => app.dismissAlert(alerts[0])}
  >
  <Title id="alert-title">Error</Title>
  <Content id="alert-content">{alerts[0].message}</Content>
  <Actions>
    <Button>
      <Label>OK</Label>
    </Button>
  </Actions>
</Dialog>
{/if}
