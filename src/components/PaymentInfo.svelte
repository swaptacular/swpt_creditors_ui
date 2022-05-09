<script lang="ts">
  import type { PaymentDescription } from '../payment-requests'
  import { amountToString, calcSmallestDisplayableNumber } from '../format-amounts'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Chip, { Text } from '@smui/chips'
  import Tooltip, { Wrapper } from '@smui/tooltip'

  export let amountDivisor: number
  export let decimalPlaces: bigint
  export let payeeName: string
  export let unitAmount: string | number
  export let deadline: string
  export let description: PaymentDescription
  export let title: string
  export let tooltip: string
  export let unit: string
  export let forbidChange: boolean = true
  export let invalidPayeeName: boolean | undefined = undefined
  export let invalidUnitAmount: boolean | undefined = undefined
  export let invalidDeadline: boolean | undefined = undefined

  $: tinyNegligibleAmount = calcSmallestDisplayableNumber(amountDivisor, decimalPlaces)
  $: unitAmountStep = amountToString(tinyNegligibleAmount, amountDivisor, decimalPlaces)
  $: maxUnitAmount = Number(amountToString(9223372036853775000n, amountDivisor, decimalPlaces))
</script>

<style>
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
</style>

<LayoutGrid>
  <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
    <Wrapper>
      <Paper style="margin-top: 12px; margin-bottom: 24px; word-break: break-word" elevation={6}>
        <Title style="display: flex; justify-content: space-between; align-items: center">
          {title}
          <Chip chip="help" on:click={() => undefined}>
            <Text tabindex="0">info</Text>
          </Chip>
          <Tooltip>{tooltip}</Tooltip>
        </Title>
        <Content>
          {#if description.contentFormat === '.'}
            <a href="{description.content}" target="_blank">{description.content}</a>
          {:else if description.content}
            <pre>
              {description.content}
            </pre>
          {:else}
            <span style="color: #c4c4c4">The payment request does not contain a description.</span>
          {/if}
        </Content>
      </Paper>
    </Wrapper>
  </Cell>

  <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
    <Textfield
      required
      variant="outlined"
      type="number"
      disabled={forbidChange}
      input$min={unitAmountStep}
      input$max={maxUnitAmount}
      input$step={unitAmountStep}
      style="width: 100%"
      withTrailingIcon={invalidUnitAmount}
      bind:value={unitAmount}
      bind:invalid={invalidUnitAmount}
      label="Amount"
      suffix={unit}
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

  <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
    <Textfield
      required
      variant="outlined"
      style="width: 100%"
      input$maxlength="200"
      input$spellcheck="false"
      disabled={forbidChange}
      bind:invalid={invalidPayeeName}
      bind:value={payeeName}
      label="Payee name"
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
      disabled={forbidChange}
      variant="outlined"
      style="width: 100%"
      type="datetime-local"
      bind:invalid={invalidDeadline}
      bind:value={deadline}
      label="Deadline"
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
</LayoutGrid>
