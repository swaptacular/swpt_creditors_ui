<script lang="ts">
  import type { AppState, UpdatePolicyModel, UpdatePolicyActionWithId, PegBound } from '../app-state'
  import {
    amountToString, limitAmountDivisor, calcPegExampleAmount, calcSmallestDisplayableNumber,
    MIN_INT64, MAX_INT64
  } from '../format-amounts'
  import { slide } from 'svelte/transition'
  import Fab, { Label } from '@smui/fab'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import FormField from '@smui/form-field'
  import Radio from '@smui/radio'
  import Checkbox from '@smui/checkbox'
  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'
  import AccountInfo from './AccountInfo.svelte'

  export let app: AppState
  export let model: UpdatePolicyModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let openEnterPinDialog = false
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let policy = calcInitialPolicy(model)
  let minPrincipalUnitAmount = calcInitialMinPrincipalUnitAmount(model)
  let maxPrincipalUnitAmount = calcInitialMaxPrincipalUnitAmount(model)
  let useNonstandardPeg = model.action.editedUseNonstandardPeg
  let ignoreDeclaredPeg = model.action.editedIgnoreDeclaredPeg
  let reviseApprovedPeg = model.action.editedReviseApprovedPeg
  let invalidMinPrincipalUnitAmount: boolean | undefined
  let invalidMaxPrincipalUnitAmount: boolean | undefined

  function createUpdatedAction(): UpdatePolicyActionWithId {
    return {
      ...action,
      editedPolicy: policy === 'off' ? undefined : policy,
      editedMinPrincipal: minPrincipal,
      editedMaxPrincipal: maxPrincipal,
      editedUseNonstandardPeg: useNonstandardPeg,
      editedIgnoreDeclaredPeg: ignoreDeclaredPeg,
      editedReviseApprovedPeg: reviseApprovedPeg,
    }
  }

  function formatAsUnitAmount(amount: bigint | number | undefined, amountDivisor: number, decimalPlaces: bigint): string {
    if (amount === undefined) {
      return ''
    }
    if (typeof amount === 'number') {
      assert(Number.isFinite(amount))
      amount = BigInt(Math.ceil(amount))
    }
    return amountToString(amount, amountDivisor, decimalPlaces)
  }

  function calcInitialMinPrincipalUnitAmount(model: UpdatePolicyModel): string {
    let n: bigint | undefined = model.action.editedMinPrincipal
    if (n < 0n) {
      n = undefined
    }
    return formatAsUnitAmount(n, model.accountData.display.amountDivisor, model.accountData.display.decimalPlaces)
  }

  function calcInitialMaxPrincipalUnitAmount(model: UpdatePolicyModel): string {
    let n: bigint | undefined = model.action.editedMaxPrincipal
    if (n >= MAX_INT64) {
      n = undefined
    } else if (n < 0n) {
      n = 0n
    }
    return formatAsUnitAmount(n, model.accountData.display.amountDivisor, model.accountData.display.decimalPlaces)
  }

  function calcInitialPolicy(model: UpdatePolicyModel): 'off' | 'conservative' {
    if (model.action.editedPolicy === undefined) {
      return 'off'
    } else {
      return 'conservative'
    }
  }

  function calcExampleAmount(pegBounds: PegBound[]): bigint {
    if (pegBounds.length < 2) {
      return 0n
    }
    const [pegged, peg] = pegBounds
    const amount = calcPegExampleAmount(pegged.display, peg.display, peg.exchangeRate)
    return BigInt(Math.ceil(amount))
  }

  function amountToBigint(amount: any, divisor: number, missing: bigint): bigint {
    let result = missing
    if (amount !== '') {
      let x = Number(amount)
      if (Number.isFinite(x)) {
        x = Math.max(0, x) * limitAmountDivisor(divisor)
        result = BigInt(Math.ceil(x))
        if (result >= MAX_INT64) {
          result = MAX_INT64 - 1n
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

  async function enableExchanges(): Promise<void> {
    invalidMinPrincipalUnitAmount = undefined
    invalidMaxPrincipalUnitAmount = undefined
  }

  function modify(): void {
    if (invalid) {
      shakeForm()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    app.executeUpdatePolicyAction(actionManager, accountData, pin, model.backToAccount)
  }

  $: action = model.action
  $: accountData = model.accountData
  $: debtorData = accountData.debtorData
  $: pegBounds = accountData.pegBounds
  $: amount = calcExampleAmount(pegBounds)
  $: display = accountData.display
  $: knownDebtor = display.knownDebtor
  $: amountDivisor = display.amountDivisor
  $: decimalPlaces = display.decimalPlaces
  $: unit = display.unit ?? '\u00A4'
  $: tinyNegligibleAmount = calcSmallestDisplayableNumber(amountDivisor, decimalPlaces)
  $: unitAmountStep = formatAsUnitAmount(tinyNegligibleAmount, amountDivisor, decimalPlaces)
  $: usesStandardPeg = model.usesStandardPeg
  $: usesNonstandardPeg = model.usesNonstandardPeg
  $: ignoresDeclaredPeg = model.ignoresDeclaredPeg
  $: disabledExchanges = policy === 'off'
  $: minPrincipal = amountToBigint(minPrincipalUnitAmount, amountDivisor, MIN_INT64)
  $: maxPrincipal = amountToBigint(maxPrincipalUnitAmount, amountDivisor, MAX_INT64)
  $: smallMaxPrincipal = maxPrincipal < minPrincipal
  $: erroneousMaxPrinciple = invalidMaxPrincipalUnitAmount || smallMaxPrincipal
  $: invalid = !disabledExchanges && (invalidMinPrincipalUnitAmount || erroneousMaxPrinciple)
</script>

<style>
  .radio-group > :global(*) {
    margin: 0 0.2em;
  }
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
  <Page title="Modify policy">
    <svelte:fragment slot="content">
      <EnterPinDialog bind:open={openEnterPinDialog} performAction={submit} />

      <div bind:this={shakingElement} slot="content">
        <form
          noValidate
          autoComplete="off"
          on:input={() => actionManager.markDirty()}
          on:change={() => actionManager.save()}
          >
          <LayoutGrid>
            <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
              <AccountInfo
                homepage={debtorData.debtorHomepage?.uri}
                summary={debtorData.summary}
                pegBounds={amount > 0n ? pegBounds : []}
                {amount}
                >
                <svelte:fragment slot="title">
                  {#if knownDebtor}
                    Exchange policy for "{display.debtorName}"
                  {:else}
                    Exchange policy for "{display.debtorName}" (unconfirmed account)
                  {/if}
                </svelte:fragment>
              </AccountInfo>
            </Cell>

            {#if usesNonstandardPeg}
              <Cell>
                <FormField>
                  <Checkbox bind:checked={useNonstandardPeg} />
                  <span slot="label">
                    Use a nonstandard currency peg.
                  </span>
                </FormField>
              </Cell>
            {/if}

            {#if ignoresDeclaredPeg}
              <Cell>
                <FormField>
                  <Checkbox bind:checked={ignoreDeclaredPeg} />
                  <span slot="label">
                    Ignore the currency peg declared by the issuer.
                  </span>
                </FormField>
              </Cell>
            {/if}

            {#if usesStandardPeg}
              <Cell>
                <FormField>
                  <Checkbox bind:checked={reviseApprovedPeg} />
                  <span slot="label">
                    Revise the approved currency peg.
                  </span>
                </FormField>
              </Cell>
            {/if}

            <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
              <div class="radio-group">
                <FormField>
                  <Radio
                    bind:group={policy}
                    value="off"
                    touch
                    />
                  <span slot="label">
                    Do not allow automatic exchanges.
                  </span>
                </FormField>
                <FormField>
                  <Radio
                    bind:group={policy}
                    on:click={enableExchanges}
                    value="conservative"
                    touch
                    />
                  <span slot="label">
                    Allow automatic buying and selling of this
                    currency so that, if possible, the available
                    amount stays within the defined limits.
                  </span>
                </FormField>
              </div>
            </Cell>
          </LayoutGrid>

          <div style="height: 400px">
            {#if !disabledExchanges}
              <div in:slide={{ duration: 250 }} out:slide|local={{ duration: 250 }}>
                <LayoutGrid>
                  <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
                    <Textfield
                      required
                      variant="outlined"
                      type="number"
                      input$min={0}
                      input$step={unitAmountStep}
                      style="width: 100%"
                      withTrailingIcon={invalidMinPrincipalUnitAmount}
                      bind:value={minPrincipalUnitAmount}
                      bind:invalid={invalidMinPrincipalUnitAmount}
                      label="Minumum amount"
                      suffix="{unit.slice(0, 10)}"
                      >
                      <svelte:fragment slot="trailingIcon">
                        {#if invalidMinPrincipalUnitAmount}
                          <TextfieldIcon class="material-icons">error</TextfieldIcon>
                        {/if}
                      </svelte:fragment>
                      <HelperText slot="helper" persistent>
                        The available amount should not fall below this
                        value. The limit applies only to automatic
                        exchanges, and will be enforced on "best effort"
                        bases.
                      </HelperText>
                    </Textfield>
                  </Cell>

                  <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
                    <Textfield
                      required
                      variant="outlined"
                      type="number"
                      input$min={0}
                      input$step={unitAmountStep}
                      style="width: 100%"
                      withTrailingIcon={erroneousMaxPrinciple}
                      bind:value={maxPrincipalUnitAmount}
                      bind:invalid={invalidMaxPrincipalUnitAmount}
                      label="Maximum amount"
                      suffix="{unit.slice(0, 10)}"
                      >
                      <svelte:fragment slot="trailingIcon">
                        {#if erroneousMaxPrinciple}
                          <TextfieldIcon class="material-icons">error</TextfieldIcon>
                        {/if}
                      </svelte:fragment>
                      <HelperText slot="helper" persistent>
                        The available amount should not exceed this
                        value. The limit applies only to automatic
                        exchanges, and will be enforced on "best effort"
                        bases. This value must be greater or equal than the
                        "Minumum amount" value.
                      </HelperText>
                    </Textfield>
                  </Cell>
                </LayoutGrid>
              </div>
            {/if}
          </div>
        </form>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab on:click={() => actionManager.remove(model.backToAccount) } extended>
          <Label>Cancel</Label>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={modify} extended>
          <Label>Modify</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
