<script lang="ts">
  import type { AppState, ApproveAmountDisplayActionModel, ActionManager } from '../app-state'
  import type { ApproveAmountDisplayActionWithId } from '../operations'
  import { limitAmountDivisor } from '../format-amounts'
  import { amountToString } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Radio from '@smui/radio'
  import FormField from '@smui/form-field'

  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'

  export let app: AppState
  export let model: ApproveAmountDisplayActionModel
  export const snackbarBottom: string = "84px"

  let currentModel: ApproveAmountDisplayActionModel
  let actionManager: ActionManager<ApproveAmountDisplayActionWithId>
  let shakingElement: HTMLElement
  let openEnterPinDialog: boolean = false

  let negligibleUnitAmount: string | number
  let negligibleUnitAmountStep: string
  let approved: 'yes' | 'no'

  let invalidNegligibleUnitAmount: boolean

  function createUpdatedAction(): ApproveAmountDisplayActionWithId {
    assert(action.state)
    return {
      ...action,
      state: {
        ...action.state,
        editedNegligibleAmount: Math.max(0, Number(negligibleUnitAmount) || 0) * limitAmountDivisor(action.amountDivisor),
        approved,
      },
    }
  }

  function formatAsUnitAmount(amount: bigint | number | undefined): string {
    if (amount === undefined) {
      return ''
    }
    if (typeof amount === 'number') {
      assert(Number.isFinite(amount))
      amount = BigInt(Math.ceil(amount))
    }
    return amountToString(amount, model.action.amountDivisor, model.action.decimalPlaces)
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function confirm(): void {
    if (invalid) {
      shakeForm()
    } else if (approved === 'no') {
      console.log('removing')
      // actionManager.remove()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    app.resolveApproveAmountDisplayAction(actionManager, model.display.latestUpdateId, pin, model.goBack)
  }

  assert(model.display.debtorName !== undefined)
  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    approved = model.action.state?.approved ?? 'no'
    negligibleUnitAmount = formatAsUnitAmount(model.action.state?.editedNegligibleAmount)
    negligibleUnitAmountStep = formatAsUnitAmount(model.action.state?.tinyNegligibleAmount)
  }
  $: action = model.action
  $: debtorName = model.display.debtorName ?? ''
  $: invalid = approved === 'yes' && invalidNegligibleUnitAmount
  $: oldUnitAmount = amountToString(1000n, model.display.amountDivisor, model.display.decimalPlaces) + ' ' + model.display.unit
  $: newUnitAmount = amountToString(1000n, action.amountDivisor, action.decimalPlaces) + ' ' + action.unit
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
  <Page title="Currency display">
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
              <Paper style="margin-top: 16px; margin-bottom: 24px; word-break: break-word" elevation={4}>
                <Title>
                  Approve a new way amounts are displayed
                </Title>
                <Content>
                  "{debtorName}" has changed the way currency amounts
                  are displayed. If you choose to use the new way to
                  display amounts, the {oldUnitAmount} that you have
                  in your account, in the future will be shown as
                  {newUnitAmount}.
                </Content>
              </Paper>
            </Cell>

            <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
              <div class="radio-group" style="margin-bottom: 16px; word-break: break-word">
                <FormField>
                  <Radio bind:group={approved} value="yes" touch />
                    <span slot="label">Use the new way ({newUnitAmount})</span>
                </FormField>
                <FormField>
                  <Radio bind:group={approved} value="no" touch />
                    <span slot="label">Use the old way ({oldUnitAmount})</span>
                </FormField>
              </div>
            </Cell>

            <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
              <Textfield
                required
                variant="outlined"
                type="number"
                input$min={negligibleUnitAmountStep}
                input$step={negligibleUnitAmountStep}
                style="width: 100%"
                withTrailingIcon={invalidNegligibleUnitAmount}
                bind:value={negligibleUnitAmount}
                bind:invalid={invalidNegligibleUnitAmount}
                label="Negligible amount"
                suffix="{action.unit.slice(0, 10)}"
                disabled={approved === 'no'}
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidNegligibleUnitAmount}
                    <TextfieldIcon class="material-icons">error</TextfieldIcon>
                  {/if}
                </svelte:fragment>
                <HelperText style="word-break: break-word" slot="helper" persistent>
                  An amount to be considered negligible. It will be
                  used to decide whether the account can be safely
                  deleted, and whether an incoming transfer can be
                  ignored. Can not be smaller than
                  {negligibleUnitAmountStep} {action.unit}
                </HelperText>
              </Textfield>
            </Cell>
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
