<script lang="ts">
  import type { AppState, OverrideCoinModel, ActionManager } from '../app-state'
  import type { ApprovePegActionWithId } from '../operations'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Radio from '@smui/radio'
  import Button, { Label as ButtonLabel } from '@smui/button'
  import FormField from '@smui/form-field'
  import Dialog from './Dialog.svelte'
  import { Title as DialogTitle, Content as DialogContent, Actions } from '@smui/dialog'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: OverrideCoinModel
  export const snackbarBottom: string = "84px"

  let currentModel: OverrideCoinModel
  let showKnownCurrencies: boolean = false
  let showNewCurrencies: boolean = false
  let actionManager: ActionManager<ApprovePegActionWithId>
  let shakingElement: HTMLElement

  let replace: 'yes' | 'no' = 'no'

  function createUpdatedAction(): ApprovePegActionWithId {
    return {
      ...action,
      editedReplaceCoin,
    }
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function submit(): void {
    if (editedReplaceCoin === undefined) {
      shakeForm()
    } else {
      // TODO: implement
      console.log(`submitted ${editedReplaceCoin}`)
    }
  }

  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    replace = model.action.editedReplaceCoin ? 'yes' : 'no'
  }
  $: action = model.action
  $: editedReplaceCoin = replace === 'yes' || (replace === 'no' ? false : undefined)
  $: peggedDisplay = model.peggedAccountDisplay
  $: peggedDebtorName = peggedDisplay.debtorName
  $: peggedKnownDebtor = peggedDisplay.knownDebtor
  $: pegDebtorName = model.createAccountData.account.display.debtorName
  $: knownCurrencyList = ['xxx']
  $: newCurrencyList = ['yyy', '222']
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
  .fab-container {
    margin: 16px 16px;
  }
  .shaking-container {
    position: relative;
    overflow: hidden;
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

<div class="shaking-container">
  <Page title="Replace coin">
    <svelte:fragment slot="content">
      {#if showKnownCurrencies}
        <Dialog
          open
          aria-labelledby="show-known-currencies-dialog-title"
          aria-describedby="show-known-currencies-dialog-content"
          on:MDCDialog:closed={() => showKnownCurrencies = false}
          >
          <DialogTitle>Currencies using the already known coin:</DialogTitle>
          <DialogContent style="word-break: break-word">
            <ul class="currency-list">
              {#each knownCurrencyList as currency }
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

      {#if showNewCurrencies}
        <Dialog
          open
          aria-labelledby="show-new-currencies-dialog-title"
          aria-describedby="show-new-currencies-dialog-content"
          on:MDCDialog:closed={() => showNewCurrencies = false}
          >
          <DialogTitle>Currencies specifying the same digital coin as "{peggedDebtorName}":</DialogTitle>
          <DialogContent style="word-break: break-word">
            <ul class="currency-list">
              {#each newCurrencyList as currency }
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
                <Title>
                  Digital coin conflict
                </Title>
                <Content>
                  <p>
                    "{peggedDebtorName}"
                    {#if !peggedKnownDebtor}
                      (unconfirmed account)
                    {/if}
                    has declared a fixed exchange rate with
                    "{pegDebtorName}". However, the digital coin
                    specified for "{pegDebtorName}" does not match the
                    already known coin for it.
                  </p>
                  {#if knownCurrencyList.length !== 0 || newCurrencyList.length !== 0}
                    <ul class="checklist">
                      {#if knownCurrencyList.length !== 0}
                        <li>
                          {#if knownCurrencyList.length === 1}
                            <a  href="." target="_blank" on:click|preventDefault={() => showKnownCurrencies = true}>
                              1 pegged currency
                            </a>
                            uses the already known coin.
                          {:else}
                            <a  href="." target="_blank" on:click|preventDefault={() => showKnownCurrencies = true}>
                              {knownCurrencyList.length} pegged currencies
                            </a>
                            use the already known coin.
                          {/if}
                        </li>
                      {/if}
                      {#if newCurrencyList.length !== 0}
                        <li>
                          {#if newCurrencyList.length === 1}
                            <a  href="." target="_blank" on:click|preventDefault={() => showNewCurrencies = true}>
                              1 other pegged currency
                            </a>
                            specifies the same digital coin as "{peggedDebtorName}".
                          {:else}
                            <a  href="." target="_blank" on:click|preventDefault={() => showNewCurrencies = true}>
                              {newCurrencyList.length} other pegged currencies
                            </a>
                            specify the same digital coin as "{peggedDebtorName}".
                          {/if}
                        </li>
                      {/if}
                    </ul>
                  {/if}
                </Content>
              </Paper>
            </Cell>

            <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
              <div class="radio-group" style="margin-top: -10px; word-break: break-word">
                <FormField>
                  <Radio bind:group={replace} value="yes" touch />
                  <span slot="label">Replace the known coin</span>
                </FormField>
                <FormField>
                  <Radio bind:group={replace} value="no" touch />
                  <span slot="label">Do not replace the known coin</span>
                </FormField>
              </div>
            </Cell>
          </LayoutGrid>
        </form>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab color="primary" on:click={submit} extended>
          <Label>Make a decision</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
