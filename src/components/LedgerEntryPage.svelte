<script lang="ts">
  import type { LedgerEntryModel, ExtendedLedgerEntry } from '../app-state'
  import { amountToString } from '../format-amounts'
  import { parseTransferNote } from '../payment-requests'
  import Fab, { Label } from '@smui/fab'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Page from './Page.svelte'
  import Paper, { Title, Content } from '@smui/paper'
  
  export let model: LedgerEntryModel
  export const snackbarBottom: string = "84px"
  
  const dumyPaymentInfo = {
    payeeName: '',
    payeeReference: '',
    description: { contentFormat: '', content: ''},
  }
  
  function getDate(t: ExtendedLedgerEntry): string {
    return new Date(t.addedAt).toLocaleString()
  }

  function calcDisplayAmount(amt: bigint): string {
    const amount = Number(amt) * pegBound.exchangeRate
    const { amountDivisor, decimalPlaces } = pegBound.display
    const unitAmount = amountToString(amount, amountDivisor, decimalPlaces)
    const unit = pegBound.display.unit
    return `${unitAmount} ${unit}`
  }

  $: accountData = model.accountData
  $: pegBounds = accountData.pegBounds
  $: pegBound = pegBounds[0]
  $: display = accountData.display
  $: debtorName = display.debtorName
  $: transfer = model.ledgerEntry
  $: committedTransfer = transfer.transfer
  $: rationale = committedTransfer?.rationale
  $: paymentInfo = committedTransfer ? parseTransferNote(committedTransfer) : dumyPaymentInfo
  $: payeeName = paymentInfo.payeeName
  $: description = paymentInfo.description
  $: payeeReference = paymentInfo.payeeReference
  $: content = description.content
  $: amount = transfer.acquiredAmount
  $: displayAmount = calcDisplayAmount(amount)
  
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="Payment">
  <svelte:fragment slot="content">
    <LayoutGrid>
      <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
        <Paper style="margin-top: 12px; margin-bottom: 24px; word-break: break-word" elevation={6}>
          <Title>
            Payment via "{debtorName}"
          </Title>
          <Content>
            <h5>{getDate(transfer)}</h5>
            <p class="transfer">
              <span>{displayAmount}</span>
              {#if rationale === 'interest'}
                interest payment
              {:else if amount < 0 && payeeName}
                paid to "{payeeName}"
              {:else if amount > 0 && committedTransfer && committedTransfer.noteFormat !== '.' && payeeReference}
                toward "{payeeReference.slice(0, 36)}"
              {/if}
            </p>
            <p class="transfer-note">
              {#if description.contentFormat === '.'}
                <a href="{description.content}" target="_blank" on:click|stopPropagation>{content}</a>
              {:else if description.contentFormat === ''}
                {content}
              {/if}
            </p>
          </Content>
        </Paper>
      </Cell>
    </LayoutGrid>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab on:click={model.goBack} extended>
        <Label>Back</Label>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
