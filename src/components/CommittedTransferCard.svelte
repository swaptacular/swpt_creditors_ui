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
  $: payeeName = paymentInfo.payeeName
  $: payeeReference = paymentInfo.payeeReference
  $: description = paymentInfo.description
  $: amount = transfer.acquiredAmount
  $: displayAmount = calcDisplayAmount(amount)
</script>

<style>
  h5 {
    font-size: 1.1em;
    font-weight: bold;
  }
  pre {
    font-family: monospace;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    width: 100%;
  }
  a {
    overflow-wrap: break-word;
    width: 100%;
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
        <span>{displayAmount}</span>
        {#if amount >= 0 && payeeName}
          from "{payeeName}"
        {:else if payeeReference}
          towards "{payeeReference}"
        {/if}
      </p>
      <p class="transfer-note">
        {#if description.contentFormat === '.'}
          <a href="{description.content}" target="_blank" on:click|stopPropagation>{description.content}</a>
        {:else if description.content}
          <pre>
            {description.content}
          </pre>
        {/if}
      </p>
    </Content>
  </PrimaryAction>
</Card>
