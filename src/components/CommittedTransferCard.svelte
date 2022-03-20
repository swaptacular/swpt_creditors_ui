<script lang="ts">
  import type { CommittedTransferRecord, PegBound } from '../operations'
  import { amountToString } from '../format-amounts'
  import { parseTransferNote } from '../payment-requests'
  import Card, { PrimaryAction, Content } from '@smui/card'

  export let transfer: CommittedTransferRecord
  export let pegBound: PegBound
  export let activate: () => void
  
  function getDate(t: CommittedTransferRecord): string {
    return new Date(t.committedAt).toLocaleString()
  }
  
  function calcDisplayAmount(amt: bigint): string {
    const amount = Number(amt) * pegBound.exchangeRate
    const { amountDivisor, decimalPlaces } = pegBound.display
    const unitAmount = amountToString(amount, amountDivisor, decimalPlaces)
    const unit = pegBound.display.unit
    return `${unitAmount} ${unit}`
  }
  
  $: paymentInfo = parseTransferNote(transfer)
</script>

<style>
  h5 {
    font-size: 1.1em;
    font-weight: bold;
  }
  .transfer {
    font-size: 1.1em;
    word-break: break-word;
    margin-top: 10px;
  }
  .transfer-note {
    word-break: break-word;
    margin-top: 5px;
    color: #888;
  }
</style>

<Card>
  <PrimaryAction on:click={activate}>
    <Content>
      <h5>{getDate(transfer)}</h5>
      <p class="transfer">
        <span>{calcDisplayAmount(transfer.acquiredAmount)}</span>
        to
        "{paymentInfo.payeeName}"
      </p>
      <p class="transfer-note">
        {paymentInfo.description.content}
      </p>
    </Content>
  </PrimaryAction>
</Card>
