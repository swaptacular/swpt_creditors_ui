<script lang="ts">
  import type { AppState, ActionRecordWithId } from '../app-state'
  import { amountToString } from '../format-amounts'
  import { getContext } from 'svelte'
  import { fly, fade } from 'svelte/transition'
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
      return action.transfer.result ? "Show the failed payment" : "Show the delayed payment"
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
    case 'PaymentRequest':
      return 'Request payment'
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

  function removeEndingDot(s: string): string {
    const lastDotIndex = s.search(/\.\s*$/u)
    return lastDotIndex > 0 ? s.slice(0, lastDotIndex) : s
  }

  function getDescription(action: ActionRecordWithId): string {
    switch (action.actionType) {
      case "CreateTransfer": {
        const payeeName = action.paymentInfo.payeeName
        const amount = action.editedAmount
        const display = app.accountsMap.getAccountDisplay(action.accountUri)
        if (display) {
          const unit = display.unit
          const unitAmount = amountToString(amount, display.amountDivisor, display.decimalPlaces)
          return `Send ${unitAmount} ${unit} to ${payeeName}.`
        } else {
          const unit = "\u00a4"
          const unitAmount = amountToString(amount, 1, 0n)
          return `Send ${unitAmount} ${unit} to ${payeeName}.`
        }
      }
      case "AbortTransfer": {
        const transfer = action.transfer
        const title = transfer.result ? "Failed payment" : "Delayed payment"
        const payeeName = transfer.paymentInfo.payeeName
        let amountDivisor = 1
        let decimalPlaces = 0n
        let unit = "\u00a4"
        if (action.accountUri !== undefined) {
          const display = app.accountsMap.getAccountDisplay(action.accountUri)
          if (display) {
            amountDivisor = display.amountDivisor
            decimalPlaces = display.decimalPlaces
            unit = display.unit ?? "\u00a4"
          }
        }
        const unitAmount = amountToString(transfer.amount, amountDivisor, decimalPlaces)
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
      case 'PaymentRequest': {
        const debtorName = getDebtorName(action.accountUri)
        if (!debtorName) {
          return 'Request payment.'
        }
        if (action.sealedAt === undefined) {
          return `Request payment via "${debtorName}".`
        } else {
          const n = 120  // number of characters to show from the payment note.
          const s = action.editedNote
          const nonemptyNote = /\S/u.test(s)
          const note = nonemptyNote
            ? (s.length <= n ? `: ${removeEndingDot(s)}` : `: ${s.slice(0, n)}..`)
            : `: ${action.sealedAt.toLocaleString()}`
          const display = app.accountsMap.getAccountDisplay(action.accountUri)
          if (action.editedAmount && display) {
            const unitAmount = amountToString(action.editedAmount, display.amountDivisor, display.decimalPlaces)
            return `Request ${unitAmount} ${display.unit} via "${debtorName}"${note}.`
          } else {
            return `Request payment via "${debtorName}"${note}.`
          }
        }
      }
      default:
        return "Unknown action type"
    }
  }
</script>

<div in:fly|local="{{ x: -350, duration: 1000 }}" out:fade|local="{{ duration: 1000 }}">
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
