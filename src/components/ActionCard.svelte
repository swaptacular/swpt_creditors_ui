<script lang="ts">
  import type { AppState, ActionRecordWithId } from '../app-state'
  import { getContext } from 'svelte'
  import { fly } from 'svelte/transition'
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
      return 'Confirm account'
    case "AckAccountInfo":
      return 'Acknowledge changes'
    case 'ApprovePeg':
      return 'Approve peg'
    case 'ApproveAmountDisplay':
      return 'Approve display'
    case 'ApproveDebtorName':
      return 'Approve name'
    case 'ConfigAccount':
      return 'Modify account'
    case 'UpdatePolicy':
      return 'Modify policy'
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
        const editedDebtorName = action.accountCreationState?.editedDebtorName
        const descripiton = editedDebtorName !== undefined
          ? `Confirm account with "${editedDebtorName}".`
          : "Create a new account."
        return descripiton
      }
      case "AckAccountInfo": {
        const debtorName = getDebtorName(action.accountUri)
        const descripiton = debtorName
          ? `There have been some changes in the "${debtorName}" currency.`
          : 'A currency has been changed.'
        return descripiton
      }
      case 'ApprovePeg': {
        const debtorName = getDebtorName(action.accountUri)
        const descripiton = debtorName
          ? `Approve a fixed exchange rate between "${debtorName}" and another currency.`
          : 'Approve a fixed exchange rate between two currencies.'
        return descripiton
      }
      case 'ApproveAmountDisplay': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName ?
          `Approve a new way to display currency amounts for "${debtorName}".` :
          'Approve a new way to display currency amounts.'
      }
      case 'ApproveDebtorName': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName ? `Approve a new name for "${debtorName}".` : 'Approve a new name.'
      }
      case 'ConfigAccount': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName
          ? `Modify the configuration settings for your account with "${debtorName}".`
          : 'Modify account configuration settings.'
      }
      case 'UpdatePolicy': {
        const debtorName = getDebtorName(action.accountUri)
        return debtorName
          ? `Modify the exchange policy for your account with "${debtorName}".`
          : 'Modify exchange policy.'
      }
      default:
        return "Unknown action type"
    }
  }
</script>

<div in:fly|local="{{ x: -350, duration: 1000 }}">
  <Card>
    <Content style="word-break: break-word">{getDescription(action)}</Content>
    <Actions fullBleed>
      <Button {color} on:click={show}>
        <Label>{getButtonLabel(action)}</Label>
        <i class="material-icons" aria-hidden="true">arrow_forward</i>
      </Button>
    </Actions>
  </Card>
</div>
