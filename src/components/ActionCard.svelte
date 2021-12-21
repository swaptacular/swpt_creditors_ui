<script lang="ts">
  import { getContext } from 'svelte'
  import type { ActionRecordWithId } from '../operations'
  import type { AppState } from '../app-state'
  import Button, { Label } from '@smui/button'
  import Card, { Content, Actions } from '@smui/card'

  const app: AppState = getContext('app')

  export let action: ActionRecordWithId
  export let show = () => { app.showAction(action.actionId) }
  export let color: string = 'primary'

  function getButtonLabel(action: ActionRecordWithId): string {
    switch (action.actionType) {
    case 'CreateTransfer':
      return 'Make payment'
    case 'AbortTransfer':
      return 'Show the problem'
    case 'CreateAccount':
      return 'Confirm'
    default:
      return 'Unknown action type'
    }
  }

  function getDescription(action: ActionRecordWithId): string {
    let payeeName
    let unitAmount
    let unit
    switch (action.actionType) {
    case 'CreateTransfer':
      payeeName = action.paymentInfo.payeeName
      unitAmount = '0.00'
      unit = '\u00a4'
      return `Send ${unitAmount} ${unit} to ${payeeName}.`
    case 'AbortTransfer':
      const transfer = action.transfer
      const title = transfer.result ? "Failed payment" : "Delayed payment"
      payeeName = transfer.paymentInfo.payeeName
      unitAmount = '0.00'
      unit = '\u00a4'
      return `${title}: ${unitAmount} ${unit} to ${payeeName}.`
    case 'CreateAccount':
      return `Create account.`
    default:
      return 'Unknown action type'
    }
  }
</script>

<Card>
  <Content>{getDescription(action)}</Content>
  <Actions fullBleed>
    <Button {color} on:click={show}>
      <Label>{getButtonLabel(action)}</Label>
      <i class="material-icons" aria-hidden="true">arrow_forward</i>
    </Button>
  </Actions>
</Card>
