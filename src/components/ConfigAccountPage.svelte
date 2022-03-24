<script lang="ts">
  import type { AppState, ConfigAccountModel } from '../app-state'
  import type { ConfigAccountActionWithId } from '../operations'
  import { limitAmountDivisor } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Chip, { Text } from '@smui/chips'
  import Tooltip, { Wrapper } from '@smui/tooltip'
  // import FormField from '@smui/form-field'
  // import Checkbox from '@smui/checkbox'
  import { amountToString } from '../format-amounts'
  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'

  export let app: AppState
  export let model: ConfigAccountModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let openEnterPinDialog = false
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let debtorName = model.action.editedDebtorName
  let uniqueDebtorName = isUniqueDebtorName(debtorName)
  let negligibleUnitAmount = formatAsUnitAmount(
    model.action.editedNegligibleAmount,
    model.display.amountDivisor,
    model.display.decimalPlaces,
  )
  let invalidDebtorName: boolean
  let invalidNegligibleUnitAmount: boolean

  function createUpdatedAction(): ConfigAccountActionWithId {
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    return {
      ...action,
      editedDebtorName: debtorName,
      editedNegligibleAmount: Math.max(0, Number(negligibleUnitAmount) || 0) * limitAmountDivisor(amountDivisor),
      // editedScheduledForDeletion: boolean,
      // editedApproveNewDisplay: boolean,
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

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function confirm(): void {
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    if (invalid) {
      shakeForm()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    // TODO: implement
    // app.approveAccountCreationAction(actionManager, data, pin, isCreateAccountAction, model.goBack)
    pin
  }

  function isUniqueDebtorName(debtorName: string): boolean {
    const nameRegex = new RegExp(`^${debtorName}$`, 'us')
    const matchingAccounts = app.accountsMap.getAccountRecordsMatchingDebtorName(nameRegex)
    switch (matchingAccounts.length) {
    case 0:
      return true
    case 1:
      return matchingAccounts[0].debtor.uri === model.debtorIdentityUri
    default:
      return false
    }
  }

  $: action = model.action
  $: principal = model.principal
  $: display = model.display
  $: knownDebtor = display.knownDebtor
  $: amountDivisor = display.amountDivisor
  $: decimalPlaces = display.decimalPlaces
  $: unit = display.unit ?? '\u00A4'
  $: debtorData = model.debtorData
  $: negligibleUnitAmountStep = formatAsUnitAmount(model.tinyNegligibleAmount, amountDivisor, decimalPlaces)
  $: invalid = (
    invalidDebtorName ||
    !uniqueDebtorName ||
    invalidNegligibleUnitAmount
  )
</script>

<style>
  ul {
    list-style: disc outside;
    margin: 0.75em 1.25em 0 16px;
  }
  li {
    margin-top: 0.5em;
  }
  .summary {
    color: #888;
    margin-top: 16px;
  }
  .amount {
    font-size: 1.1em;
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
  <Page title="Modify account">
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
              <Paper style="margin-top: 12px; margin-bottom: 24px; word-break: break-word" elevation={6}>
                <Title>
                  {#if debtorData.debtorHomepage}
                    <Wrapper>
                      <Chip chip="help" on:click={() => undefined} style="float: right; margin-left: 6px">
                        <Text>
                          <a
                            href={debtorData.debtorHomepage.uri}
                            target="_blank"
                            style="text-decoration: none; color: #666"
                            >
                            www
                          </a>
                        </Text>
                      </Chip>
                      <Tooltip>{debtorData.debtorHomepage.uri}</Tooltip>
                    </Wrapper>
                  {/if}
                  {#if knownDebtor}
                    Account with "{display.debtorName}"
                  {:else}
                    Unconfirmed account with "{display.debtorName}"
                  {/if}
                </Title>
                <Content style="clear: both">
                  {#if debtorData.summary}
                    <blockquote class="summary">{debtorData.summary}</blockquote>
                  {/if}
                  <ul>
                    <li>
                      <em class="amount">
                        {formatAsUnitAmount(principal, amountDivisor, decimalPlaces)}&nbsp;{unit}
                      </em>
                      are currently available in your account.
                    </li>
                  </ul>
                </Content>
              </Paper>
            </Cell>

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
                suffix="{unit.slice(0, 10)}"
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
                  {negligibleUnitAmountStep} {unit}
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
        <Fab color="primary" on:click={confirm} extended>
          <Label>Modify</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
