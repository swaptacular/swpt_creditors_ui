<script lang="ts">
  import type { AccountDisplayRecord, AppState } from '../app-state'
  import type { PaymentInfo } from '../payment-requests'
  import { getContext } from 'svelte'  
  import { amountToString, calcSmallestDisplayableNumber } from '../format-amounts'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Chip, { Text } from '@smui/chips'
  import Tooltip, { Wrapper } from '@smui/tooltip'
  import Button, { Label } from '@smui/button'

  export let showAccount: (() => void) | undefined
  export let paymentInfo: PaymentInfo
  export let display: AccountDisplayRecord | undefined
  export let unitAmount: unknown
  export let deadline: string
  export let status: string
  export let statusTooltip: string
  export let invalid: boolean | undefined = undefined
  export let dataUrl: string | undefined = undefined

  let downloadLinkElement: HTMLAnchorElement | undefined
  let invalidPayeeName: boolean | undefined = undefined
  let invalidUnitAmount: boolean | undefined = undefined
  let invalidDeadline: boolean | undefined = undefined

  const app: AppState = getContext('app')  

  function followAccount(): void {
    app.startInteraction()
    showAccount?.()    
  }
  
  $: payeeName = paymentInfo.payeeName
  $: payeeReference = paymentInfo.payeeReference
  $: description = paymentInfo.description
  $: contentFormat = description.contentFormat
  $: content = description.content
  $: currencyName = display?.debtorName !== undefined ? `"${display.debtorName}"` : "unknown currency"
  $: amountDivisor = display?.amountDivisor ?? 1
  $: decimalPlaces = display?.decimalPlaces ?? 0n
  $: unit = display?.unit ?? '\u00a4'
  $: isDraft = status === 'Draft'
  $: tinyNegligibleAmount = calcSmallestDisplayableNumber(amountDivisor, decimalPlaces)
  $: unitAmountStep = amountToString(tinyNegligibleAmount, amountDivisor, decimalPlaces)
  $: maxUnitAmount = Number(amountToString(9223372036853775000n, amountDivisor, decimalPlaces))
  $: invalid = invalidPayeeName || invalidUnitAmount || invalidDeadline
  $: name = payeeName.slice(0, 40) ?? 'unknown payee'
  $: downloadNameShort = unitAmount ? `Pay ${unitAmount} ${unit.slice(0, 10)} to ${name}` : `Pay ${name}`
  $: downloadName = payeeReference ? `${downloadNameShort} - ${payeeReference}` : downloadNameShort
  $: fileName = downloadName.slice(0, 120).replace(/[<>:"/|?*\\]/g, ' ') + '.pr0'
</script>

<style>
  pre {
    color: #888;
    font-size: 0.9em;
    font-family: "Roboto Mono", monospace;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    width: 100%;
  }
  a {
    overflow-wrap: break-word;
    width: 100%;
  }
  .transfer-status {
    display: flex;
    user-select: none;
    font-size: 1.3em;
    font-weight: bold;
    padding: 16px 0 16px 0;
  }
  .status-name {
    display: flex;
    flex-direction: column;
  }
  .status-smalltext {
    font-size: 0.55em;
    font-weight: normal;
    line-height: 1.3;
    color: #666;
  }
  .save-button-container {
    margin-top: 0.5em;
    margin-bottom: -0.5em;
    width: 100%;
    text-align: center;
  }
  .download-link {
    display: none;
  }
</style>

<LayoutGrid>
  <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
    <Paper style="margin-top: 12px; margin-bottom: 24px; word-break: break-word" elevation={6}>
      <Title>
        {#if showAccount !== undefined}
          <Chip chip="account" style="float: right; margin-left: 6px">
            <Text>
              <a href="." style="text-decoration: none; color: #666" on:click|preventDefault={followAccount}>
                account
              </a>
            </Text>
          </Chip>
        {/if}
        Payment via {currencyName}
      </Title>
      <Content>
        {#if !isDraft}
          <div class="transfer-status">
            <div style="padding-right: 0.3em">Status:</div>
            <Wrapper>
              <div class="status-name">
                <span style="text-decoration: underline">{status.toLowerCase()}</span>
                <span class="status-smalltext">
                  {#if status !== 'Initiated' && status !== 'Successful'}
                    tap for details
                  {:else}
                    &nbsp;
                  {/if}
                </span>
              </div>
              <Tooltip>{statusTooltip}</Tooltip>
            </Wrapper>
          </div>
        {/if}
        {#if contentFormat === '.' || contentFormat === '-'}
          <a href="{content}" target="_blank" rel="noreferrer">{content}</a>
        {:else if content}
          <pre>{content}</pre>
        {:else}
          <span style="color: #ccc">The payment request does not contain a description.</span>
        {/if}
        {#if dataUrl}
          <div class="save-button-container">
            <a class="download-link" href={dataUrl} download={fileName} bind:this={downloadLinkElement}>download</a>
            <Button type="button" color="secondary" on:click={() => downloadLinkElement?.click()}>
              <Label>Save this payment request</Label>
            </Button>
          </div>
        {/if}
      </Content>
    </Paper>
  </Cell>

  {#if !isDraft}
    <Cell>
      <Textfield
        required
        variant="outlined"
        style="width: 100%"
        type="number"
        label="Amount"
        input$readonly
        input$step="any"
        bind:invalid={invalidUnitAmount}
        value={unitAmount}
        suffix={unit}
        >
        <HelperText slot="helper" persistent>
          The amount that will be sent to the payee.
        </HelperText>
      </Textfield>
    </Cell>

    <Cell>
      <Textfield
        variant="outlined"
        style="width: 100%"
        label="Payee name"
        input$readonly
        input$spellcheck="false"
        bind:invalid={invalidPayeeName}
        value={payeeName}
        >
        <HelperText slot="helper" persistent>
          The name of the recipient of the payment.
        </HelperText>
      </Textfield>
    </Cell>

    <Cell>
      <Textfield
        variant="outlined"
        style="width: 100%"
        type="datetime-local"
        label="Deadline"
        required
        input$readonly
        bind:invalid={invalidDeadline}
        value={deadline}
        >
        <HelperText slot="helper" persistent>
          The payment must be completed before that moment.
        </HelperText>
      </Textfield>
    </Cell>
  {:else}
    <Cell>
      <Textfield
        required
        variant="outlined"
        style="width: 100%"
        type="number"
        label="Amount"
        input$min={unitAmountStep}
        input$max={maxUnitAmount}
        input$step={unitAmountStep}
        suffix={unit}
        withTrailingIcon={invalidUnitAmount}
        bind:value={unitAmount}
        bind:invalid={invalidUnitAmount}
        >
        <svelte:fragment slot="trailingIcon">
          {#if invalidUnitAmount}
            <TextfieldIcon class="material-icons">error</TextfieldIcon>
          {/if}
        </svelte:fragment>
        <HelperText slot="helper" persistent>
          The amount that will be sent to the payee.
        </HelperText>
      </Textfield>
    </Cell>

    <Cell>
      <Textfield
        variant="outlined"
        style="width: 100%"
        label="Payee name"
        input$readonly
        input$maxlength="200"
        input$spellcheck="false"
        withTrailingIcon={invalidPayeeName}
        bind:invalid={invalidPayeeName}
        value={payeeName}
        >
        <svelte:fragment slot="trailingIcon">
          {#if invalidPayeeName}
            <TextfieldIcon class="material-icons">error</TextfieldIcon>
          {/if}
        </svelte:fragment>
        <HelperText slot="helper" persistent>
          The name of the recipient of the payment.
        </HelperText>
      </Textfield>
    </Cell>

    <Cell>
      <Textfield
        required
        variant="outlined"
        style="width: 100%"
        type="datetime-local"
        label="Deadline"
        withTrailingIcon={invalidDeadline}
        bind:invalid={invalidDeadline}
        bind:value={deadline}
        >
        <svelte:fragment slot="trailingIcon">
          {#if invalidDeadline}
            <TextfieldIcon class="material-icons">error</TextfieldIcon>
          {/if}
        </svelte:fragment>
        <HelperText slot="helper" persistent>
          The payment must be completed before that moment.
        </HelperText>
      </Textfield>
    </Cell>
  {/if}
</LayoutGrid>
