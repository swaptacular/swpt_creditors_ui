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
  
  function calcBrief(s: string): string {
    const MAX_LENGTH = 160
    return (
      s.length <= MAX_LENGTH
        ? s
        : s.slice(0, MAX_LENGTH) + '\u2026'
    )
  }

  $: paymentInfo = parseTransferNote(transfer)
  $: payeeName = paymentInfo.payeeName
  $: payeeReference = paymentInfo.payeeReference
  $: description = paymentInfo.description
  $: briefContent = calcBrief(paymentInfo.description.content)
  $: amount = transfer.acquiredAmount
  $: displayAmount = calcDisplayAmount(amount)
</script>

<style>
  h5 {
    font-family: Roboto,sans-serif;
    font-size: 1.1em;
    font-weight: bold;
  }
  a {
    overflow-wrap: break-word;
    width: 100%;
  }
  .transfer {
    font-family: Courier,monospace;
    word-break: break-word;
    margin: 10px 0 0 1em;
    text-indent: -1em;
  }
  .transfer span {
    font-size: 1.25em;
  }
  .transfer-note {
    word-break: break-word;
    font-family: Roboto,sans-serif;
    margin-top: 6px;
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
          toward "{payeeReference}"
        {/if}
      </p>
      <p class="transfer-note">
        {#if description.contentFormat === '.'}
          <a href="{description.content}" target="_blank" on:click|stopPropagation>{briefContent}</a>
        {:else if description.content}
          {briefContent}
        {/if}
      </p>
    </Content>
  </PrimaryAction>
</Card>