<script lang="ts">
  import type { AppState, PaymentRequestModel, PaymentRequestActionWithId } from '../app-state'
  import {
    amountToString, limitAmountDivisor, calcSmallestDisplayableNumber, MAX_INT64
  } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: PaymentRequestModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let unitAmount: unknown = calcInitialUnitAmount(model)
  let invalidUnitAmount: boolean | undefined

  function createUpdatedAction(): PaymentRequestActionWithId {
    return {
      ...action,
      editedAmount: amountToBigint(unitAmount, amountDivisor),
    }
  }

  function formatAsUnitAmount(
    amount: bigint | number | undefined,
    amountDivisor: number,
    decimalPlaces: bigint,
  ): string {
    if (amount === undefined) {
      return ''
    }
    if (typeof amount === 'number') {
      assert(Number.isFinite(amount))
      amount = BigInt(Math.ceil(amount))
    }
    return amountToString(amount, amountDivisor, decimalPlaces)
  }

  function calcInitialUnitAmount(model: PaymentRequestModel): string {
    let n: bigint | undefined = model.action.editedAmount
    if (n <= 0n) {
      n = undefined
    }
    return formatAsUnitAmount(n, model.accountData.display.amountDivisor, model.accountData.display.decimalPlaces)
  }

  function amountToBigint(amount: unknown, divisor: number): bigint {
    let result = 0n
    if (amount !== '') {
      let x = Number(amount)
      if (Number.isFinite(x)) {
        x = Math.max(0, x) * limitAmountDivisor(divisor)
        result = BigInt(Math.ceil(x))
        if (result < 0n) {
          result = 0n
        }
        if (result > MAX_INT64) {
          result = MAX_INT64
        }
      }
    }
    return result
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function request(): void {
    if (invalid) {
      shakeForm()
    } else {
      submit()
    }
  }

  function submit(): void {
    // TODO:
    // app.executeUpdatePolicyAction(actionManager, accountData.exchange.latestUpdateId, pin, model.backToAccount)
  }

  $: action = model.action
  $: accountData = model.accountData
  $: display = accountData.display
  // $: knownDebtor = display.knownDebtor
  $: amountDivisor = display.amountDivisor
  $: decimalPlaces = display.decimalPlaces
  // $: debtorName = display.debtorName
  $: unit = display.unit ?? '\u00A4'
  $: minUnitAmount = unitAmountStep
  $: amountSuffix = unit.slice(0, 10)
  $: tinyNegligibleAmount = calcSmallestDisplayableNumber(amountDivisor, decimalPlaces)
  $: unitAmountStep = formatAsUnitAmount(tinyNegligibleAmount, amountDivisor, decimalPlaces)
  $: invalid = invalidUnitAmount
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
  .shaking-container {
    position: relative;
    overflow: hidden;
  }

  @keyframes shake {
    0% { transform: translate(1px, 1px) rotate(0deg); }
    10% { transform: translate(-1px, -2px) rotate(-1deg); }
    20% { transform: translate(-3px, 0px) rotate(1deg); }
    30% { transform: translate(3px, 2px) rotate(0deg); }
    40% { transform: translate(1px, -1px) rotate(1deg); }
    50% { transform: translate(-1px, 2px) rotate(-1deg); }
    60% { transform: translate(-3px, 1px) rotate(0deg); }
    70% { transform: translate(3px, 1px) rotate(-1deg); }
    80% { transform: translate(-1px, -1px) rotate(1deg); }
    90% { transform: translate(1px, 2px) rotate(0deg); }
    100% { transform: translate(1px, -2px) rotate(-1deg); }
  }

  :global(.shaking-block) {
    animation: shake 0.5s;
    animation-iteration-count: 1;
  }
</style>

<div class="shaking-container">
  <Page title="Request payment">
    <svelte:fragment slot="content">
      <div bind:this={shakingElement} slot="content">
        <form
          noValidate
          autoComplete="off"
          on:input={() => actionManager.markDirty()}
          on:change={() => actionManager.save()}
          >

          <LayoutGrid>
            <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
              <Textfield
                required
                variant="outlined"
                type="number"
                input$min={minUnitAmount}
                input$step={unitAmountStep}
                style="width: 100%"
                withTrailingIcon={invalidUnitAmount}
                bind:value={unitAmount}
                bind:invalid={invalidUnitAmount}
                label="Requested amount"
                suffix="{amountSuffix}"
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidUnitAmount}
                    <TextfieldIcon class="material-icons">error</TextfieldIcon>
                  {/if}
                </svelte:fragment>
                <HelperText slot="helper" persistent>
                  The available amount should not fall below
                  this value. The limit applies only to
                  automatic exchanges, and will be enforced on
                  "best effort" basis.
                </HelperText>
              </Textfield>
            </Cell>
          </LayoutGrid>
        </form>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab on:click={() => actionManager.remove() } extended>
          <Label>Cancel</Label>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={request} extended>
          <Label>Request</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
