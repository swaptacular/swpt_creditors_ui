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
    case "AckAccountInfo":
      return 'Acknowledge'
    case 'ApprovePeg':
      return 'Approve peg'
    case 'ApproveAmountDisplay':
      return 'Approve display'
    case 'ApproveDebtorName':
      return 'Approve name'
    default:
      return 'Unknown action type'
    }
  }

  function getDebtorName(accountUri: string): string | undefined {
    let debtorName
    const account = app.accountsMap.getObjectByUri(accountUri)
    if (account) {
      assert(account.type === 'Account')
      const display = app.accountsMap.getObjectByUri(account.display.uri)
      if (display) {
        assert(display.type === 'AccountDisplay')
        debtorName = display.debtorName
      }
    }
    return debtorName
  }

  function getDescription(action: ActionRecordWithId): string {
    switch (action.actionType) {
      case "CreateTransfer": {
        const payeeName = action.paymentInfo.payeeName
        const unitAmount = "0.00"
        const unit = "\u00a4"
        return `Send ${unitAmount} ${unit} to ${payeeName}.`
      }
      case "AbortTransfer": {
        const transfer = action.transfer
        const title = transfer.result ? "Failed payment" : "Delayed payment"
        const payeeName = transfer.paymentInfo.payeeName
        const unitAmount = "0.00"
        const unit = "\u00a4"
        return `${title}: ${unitAmount} ${unit} to ${payeeName}.`
      }
      case "CreateAccount": {
        const editedDebtorName = action.state?.editedDebtorName
        const name = editedDebtorName !== undefined ? `"${editedDebtorName}"` : "an unknown currency"
        return `Create account with ${name}.`
      }
      case "AckAccountInfo": {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName ? `There are some changes in the "${debtorName}" currency.` : 'A currency has been changed.'
      }
      case 'ApprovePeg': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName ? `"${debtorName}" has declared a currency peg.` : 'Declared currency peg.'
      }
      case 'ApproveAmountDisplay': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName ?
          `"${debtorName}" has changed the way currency amounts are displayed.` :
          'Changed way to display currency amounts.'
      }
      case 'ApproveDebtorName': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName ? `Approve new name for "${debtorName}".` : 'Approve new name.'
      }
      default:
        return "Unknown action type"
    }
  }
</script>

<Card>
  <Content style="word-break: break-word">{getDescription(action)}</Content>
  <Actions fullBleed>
    <Button {color} on:click={show}>
      <Label>{getButtonLabel(action)}</Label>
      <i class="material-icons" aria-hidden="true">arrow_forward</i>
    </Button>
  </Actions>
</Card>
