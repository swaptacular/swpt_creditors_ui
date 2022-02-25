<script lang="ts">
  import type { AppState, ApprovePegModel, ActionManager } from '../app-state'
  import type { ApprovePegActionWithId } from '../operations'
  import { amountToString, calcSmallestDisplayableNumber } from '../format-amounts'
  import Button, { Label as ButtonLabel } from '@smui/button'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Radio from '@smui/radio'
  import FormField from '@smui/form-field'
  import Dialog from './Dialog.svelte'
  import { Title as DialogTitle, Content as DialogContent, Actions } from '@smui/dialog'
  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'

  type Display = {
    amountDivisor: number,
    decimalPlaces: bigint,
  }

  export let app: AppState
  export let model: ApprovePegModel
  export const snackbarBottom: string = "84px"

  const MAX_AMOUNT = Number(9223372036854775807n)

  let currentModel: ApprovePegModel
  let showCurrencies: boolean = false
  let actionManager: ActionManager<ApprovePegActionWithId>
  let shakingElement: HTMLElement
  let openEnterPinDialog: boolean = false
  let approved: 'yes' | 'no' | ''

  function createUpdatedAction(): ApprovePegActionWithId {
    return {
      ...action,
      approved: approved === 'yes' || (approved === 'no' ? false : undefined),
    }
  }

  function confirm(): void {
    if (invalid) {
      shakeForm()
    } else if (approved === 'no') {
      actionManager.remove()
    } else {
      openEnterPinDialog = true
    }
  }

  function calcExampleAmount(peggedDisplay: Display, pegDisplay: Display, exchangeRate: number): number {
    let exampleAmount: number
    let prec = 4n  // We want our example to have a precision of at least 4 decimal places.
    const minPegAmount = calcSmallestDisplayableNumber(pegDisplay.amountDivisor, pegDisplay.decimalPlaces - prec)
    do {
      exampleAmount = calcSmallestDisplayableNumber(peggedDisplay.amountDivisor, peggedDisplay.decimalPlaces - prec)
      prec++
    } while (exampleAmount * exchangeRate < minPegAmount)
    return Math.min(exampleAmount, MAX_AMOUNT)
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function submit(pin: string): void {
    app.performApprovePegAction(actionManager, model.pegAccountUri, peggedDisplay.latestUpdateId, pin, model.goBack)
  }

  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    switch (model.action.approved) {
    case true:
      approved = 'yes'
      break
    case false:
      approved = 'no'
      break
    default:
      approved = ''
    }
  }
  $: action = model.action
  $: exampleAmount = calcExampleAmount(peggedDisplay, pegDisplay, action.peg.exchangeRate)
  $: peggedDisplay = model.peggedAccountDisplay
  $: peggedDebtorName = peggedDisplay.debtorName
  $: peggedKnownDebtor = peggedDisplay.knownDebtor
  $: peggedAmount = Math.ceil(exampleAmount)
  $: peggedAmountString = amountToString(
    BigInt(peggedAmount),
    peggedDisplay.amountDivisor,
    peggedDisplay.decimalPlaces,
  )
  $: peggedUnitAmount = peggedAmountString + ' ' + peggedDisplay.unit
  $: pegDisplay = action.peg.display
  $: pegDebtorName = model.pegDebtorName
  $: pegAmount = Math.ceil(exampleAmount * action.peg.exchangeRate)
  $: pegAmountString = amountToString(
    BigInt(Math.min(pegAmount, MAX_AMOUNT)),
    pegDisplay.amountDivisor,
    pegDisplay.decimalPlaces,
  )
  $: pegUnitAmount = pegAmountString + ' ' + pegDisplay.unit
  $: currencyList = app.accountsMap.getRecursivelyPeggedDebtorNames(action.accountUri)
  $: invalid = approved === ''
</script>

<style>
  .checklist {
    list-style: '\2713\00A0' outside;
    margin: 0.75em 1.25em 0 1.25em;
  }
  .checklist li {
    margin-top: 0.5em;
  }
  .currency-list {
    list-style: square outside;
    margin: 0.75em 1.25em 0 1.25em;
  }
  .amount {
    font-size: 1.1em;
  }
  .fab-container {
    margin: 16px 16px;
  }
  .radio-group > :global(*) {
    margin: 0 0.2em;
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

<Page title="Approve peg">
  <svelte:fragment slot="content">
    <EnterPinDialog bind:open={openEnterPinDialog} performAction={submit} />

    {#if showCurrencies}
      <Dialog
        open
        aria-labelledby="show-currencies-dialog-title"
        aria-describedby="show-currencies-dialog-content"
        on:MDCDialog:closed={() => showCurrencies = false}
        >
        <DialogTitle>Indirectly pegged currencies:</DialogTitle>
        <DialogContent style="word-break: break-word">
          <ul class="currency-list">
            {#each currencyList as currency }
              <li>{currency}</li>
            {/each}
          </ul>
        </DialogContent>
        <Actions>
          <Button>
            <ButtonLabel>Close</ButtonLabel>
          </Button>
        </Actions>
      </Dialog>
    {/if}

    <div bind:this={shakingElement} slot="content">
      <form
        noValidate
        autoComplete="off"
        on:input={() => actionManager.markDirty()}
        on:change={() => actionManager.save()}
        >
        <LayoutGrid>
          <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
            <Paper style="margin-top: 12px; margin-bottom: 24px; word-break: break-word" elevation={6}>
              <Title>Currency peg</Title>
              <Content>
                <p>
                  "{peggedDebtorName}"
                  {#if !peggedKnownDebtor}
                    (unconfirmed account)
                  {/if}
                  has declared a fixed exchange rate with "{pegDebtorName}". If
                  you approve this peg:
                </p>
                <ul class="checklist">
                  <li>
                    Every
                    <em class="amount">{peggedUnitAmount}</em> in your account
                    with "{peggedDebtorName}", will be considered
                    equivalent to
                    <em class="amount">{pegUnitAmount}</em>.
                  </li>
                  {#if currencyList.length > 0}
                    <li>
                      {#if currencyList.length === 1}
                        <a  href="." target="_blank" on:click|preventDefault={() => showCurrencies = true}>1 other currency</a>
                        will get indirectly pegged to
                        "{pegDebtorName}", which may change the
                        way its amounts are displayed.
                      {:else}
                        <a  href="." target="_blank" on:click|preventDefault={() => showCurrencies = true}>{currencyList.length} other currencies</a>
                        will get indirectly pegged to
                        "{pegDebtorName}", which may change the
                        way their amounts are displayed.
                      {/if}
                    </li>
                  {/if}
                  <li>
                    More possibilities will exist for automatic
                    exchanges between currencies.
                  </li>
                </ul>
              </Content>
            </Paper>
          </Cell>

          <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
            <div class="radio-group" style="margin-top: -10px; word-break: break-word">
              <FormField>
                <Radio bind:group={approved} value="yes" touch />
                <span slot="label">Approve this peg</span>
              </FormField>
              <FormField>
                <Radio bind:group={approved} value="no" touch />
                <span slot="label">Do not approve this peg</span>
              </FormField>
            </div>
          </Cell>
        </LayoutGrid>
      </form>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab color="primary" on:click={confirm} extended>
        <Label>Make decision</Label>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
