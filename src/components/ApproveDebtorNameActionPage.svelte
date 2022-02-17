<script lang="ts">
  import type { AppState, ApproveDebtorNameActionModel, ActionManager } from '../app-state'
  import type { ApproveDebtorNameActionWithId } from '../operations'
  import { tick } from 'svelte'
  import { amountToString } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Radio from '@smui/radio'
  import FormField from '@smui/form-field'
  import Checkbox from '@smui/checkbox'

  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'

  export let app: AppState
  export let model: ApproveDebtorNameActionModel
  export const snackbarBottom: string = "84px"

  let currentModel: ApproveDebtorNameActionModel
  let actionManager: ActionManager<ApproveDebtorNameActionWithId>
  let shakingElement: HTMLElement
  let openEnterPinDialog: boolean = false

  let debtorName: string

  let invalidDebtorName: boolean | undefined
  let uniqueDebtorName: boolean
  let unsetKnownDebtor: boolean

  function createUpdatedAction(): ApproveDebtorNameActionWithId {
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    return {
      ...action,
      editedDebtorName: debtorName,
      unsetKnownDebtor: unsetKnownDebtor,
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

  async function setDebtorName(s: string): Promise<void> {
    debtorName = s
    await tick()
    invalidDebtorName = undefined
  }

  function confirm(): void {
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    if (invalid) {
      shakeForm()
    } else if (debtorName === oldName && !unsetKnownDebtor) {
      actionManager.remove()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    app.resolveApproveDebtorNameAction(actionManager, model.display.latestUpdateId, pin, model.goBack)
  }

  function isUniqueDebtorName(debtorName: string): boolean {
    const nameRegex = new RegExp(`^${debtorName}$`, 'us')
    const matchingAccounts = app.accountsMap.getAccountRecordsMatchingDebtorName(nameRegex)
    switch (matchingAccounts.length) {
    case 0:
      return true
    case 1:
      return matchingAccounts[0].debtor.uri === model.accountRecord.debtor.uri
    default:
      return false
    }
  }

  assert(model.display.debtorName !== undefined)
  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    debtorName = model.action.editedDebtorName
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    unsetKnownDebtor = (
      model.action.debtorName !== model.display.debtorName &&
      model.display.knownDebtor &&
      model.action.unsetKnownDebtor
    )
  }
  $: action = model.action
  $: knownDebtor = model.display.knownDebtor
  $: oldName = model.display.debtorName ?? ''
  $: newName = action.debtorName
  $: changedName = newName !== oldName
  $: useName = debtorName === newName ? 'new' : (debtorName === oldName ? 'old' : '')
  $: availableAmount = amountToString(model.availableAmount, model.display.amountDivisor, model.display.decimalPlaces)
  $: amountUnit = model.display.unit
  $: showConfusedCheckbox = knownDebtor && changedName
  $: invalid = invalidDebtorName || !uniqueDebtorName
</script>

<style>
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
  <Page title="Currency name">
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
              <Paper style="margin-top: 12px; margin-bottom: 28px; word-break: break-word" elevation={6}>
                <Title>
                  Approve a new name
                </Title>
                <Content>
                  <p>
                    {#if changedName}
                      "{oldName}" has changed the currency's official name to "{newName}".
                    {:else}
                      Now the official name of the currency is: "{newName}".
                    {/if}
                    You have {availableAmount} {amountUnit} available in this account.
                  </p>
                </Content>
              </Paper>
            </Cell>

            {#if showConfusedCheckbox}
              <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }} style="margin: -18px 0 20px 0">
                <FormField>
                  <Checkbox bind:checked={unsetKnownDebtor} on:click={() => unsetKnownDebtor || setDebtorName(newName)} />
                  <span slot="label">
                    This change is confusing. I am not certain about
                    the real identity of the issuer of this currency
                    anymore, and I do not want to receive payments in
                    it from now on.
                  </span>
                </FormField>
              </Cell>
            {/if}

            <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
              <Textfield
                required
                variant="outlined"
                style="width: 100%"
                input$maxlength="40"
                input$spellcheck="false"
                bind:invalid={invalidDebtorName}
                bind:value={debtorName}
                label="Currency name"
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidDebtorName || !uniqueDebtorName}
                    <TextfieldIcon class="material-icons">error</TextfieldIcon>
                  {/if}
                </svelte:fragment>
                <HelperText slot="helper" persistent>
                  Every account must have a unique currency name.
                </HelperText>
              </Textfield>
            </Cell>

            {#if showConfusedCheckbox}
              <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
                <div class="radio-group">
                  <FormField>
                    <Radio
                      bind:group={useName}
                      value="new"
                      touch
                      disabled={unsetKnownDebtor}
                      on:click={() => setDebtorName(newName)}
                      />
                      <span slot="label">Use the new name</span>
                  </FormField>
                  <FormField>
                    <Radio
                      bind:group={useName}
                      value="old"
                      touch
                      disabled={unsetKnownDebtor}
                      on:click={() => setDebtorName(oldName)}
                      />
                      <span slot="label">Use the old name</span>
                  </FormField>
                </div>
              </Cell>
            {/if}
          </LayoutGrid>
        </form>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab color="primary" on:click={confirm} extended>
          <Label>Approve</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
