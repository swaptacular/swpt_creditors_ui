<script lang="ts">
  import type { AppState, CreateAccountModel, CreateAccountActionWithId, ApprovePegActionWithId } from '../app-state'
  import { HAS_NOT_CREATED_PEG_ACCOUNT } from '../app-state'
  import { limitAmountDivisor } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import FormField from '@smui/form-field'
  import Checkbox from '@smui/checkbox'
  import Button, { Label as ButtonLabel } from '@smui/button'
  import { Title as DialogTitle, Content as DialogContent, Actions, InitialFocus } from '@smui/dialog'
  import { amountToString } from '../format-amounts'
  import Page from './Page.svelte'
  import Dialog from './Dialog.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'
  import AccountInfo from './AccountInfo.svelte'

  export let app: AppState
  export let model: CreateAccountModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let openEnterPinDialog = false
  let allowIntermediate = false
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let confirmed = model.action.accountCreationState?.confirmed === true
  let debtorName = model.action.accountCreationState?.editedDebtorName ?? ''
  let uniqueDebtorName = isUniqueDebtorName(debtorName, model.action)
  let negligibleUnitAmount = formatAsUnitAmount(model.action.accountCreationState?.editedNegligibleAmount)
  let hasNotCreatedPegAccount = localStorage.getItem(HAS_NOT_CREATED_PEG_ACCOUNT) === 'true'
  let invalidDebtorName: boolean
  let invalidNegligibleUnitAmount: boolean

  function createUpdatedAction(): CreateAccountActionWithId | ApprovePegActionWithId {
    assert(data && action.accountCreationState)
    uniqueDebtorName = isUniqueDebtorName(debtorName, action)
    return {
      ...action,
      accountCreationState: {
        ...action.accountCreationState,
        confirmed,
        editedDebtorName: debtorName,
        editedNegligibleAmount: Math.max(0, Number(negligibleUnitAmount) || 0) * limitAmountDivisor(data.amountDivisor),
      },
    }
  }

  function formatAsUnitAmount(amount: bigint | number | undefined): string {
    if (amount === undefined) {
      return ''
    }
    return amountToString(
      amount,
      model.createAccountData?.amountDivisor ?? 1,
      model.createAccountData?.decimalPlaces ?? 0n,
    )
  }

  function getPeggedDebtorName(model: CreateAccountModel): string {
    let debtroName
    if (model.action.actionType !== 'CreateAccount') {
      debtroName = app.accountsMap.getAccountDisplay(model.action.accountUri)?.debtorName
    }
    return debtroName ?? ''
  }

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement && (shakingElement.className = origClassName) }, 1000)
    }
  }

  function gotIt() {
    localStorage.setItem(HAS_NOT_CREATED_PEG_ACCOUNT, 'false')
    hasNotCreatedPegAccount = false
  }

  function retry(): void {
    app.startInteraction()
    model.reload()  
  }

  function cancel(): void {
    app.startInteraction()
    actionManager.remove()
  }

  function confirm(): void {
    app.startInteraction()
    allowIntermediate = true
    uniqueDebtorName = isUniqueDebtorName(debtorName, action)
    if (invalid) {
      shakeForm()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    assert(data && action.accountCreationState)
    app.approveAccountCreationAction(actionManager, data, pin, isCreateAccountAction, model.goBack)
  }

  function isUniqueDebtorName(debtorName: string, action: CreateAccountActionWithId | ApprovePegActionWithId): boolean {
    const nameRegex = new RegExp(`^${debtorName}$`, 'us')
    const matchingAccounts = app.accountsMap.getAccountRecordsMatchingDebtorName(nameRegex)
    switch (matchingAccounts.length) {
    case 0:
      return true
    case 1:
      const debtorIdentityUri = action.actionType === 'CreateAccount'
        ? action.debtorIdentityUri
        : action.peg.debtorIdentity.uri
      return matchingAccounts[0].debtor.uri === debtorIdentityUri
    default:
      return false
    }
  }

  $: peggedDebtorName = getPeggedDebtorName(model)
  $: action = model.action
  $: isCreateAccountAction = action.actionType === 'CreateAccount'
  $: pageTitle = isCreateAccountAction ? 'Confirm account' : 'Create anchor account'
  $: data = model.createAccountData
  $: negligibleUnitAmountStep = formatAsUnitAmount(action.accountCreationState?.tinyNegligibleAmount)
  $: invalid = (
    invalidDebtorName ||
    !uniqueDebtorName ||
    invalidNegligibleUnitAmount ||
    (isCreateAccountAction && !confirmed)
  )
</script>

<style>
  ul {
    list-style: '\2713\00A0' outside;
    margin: 0.75em 1.25em 0 1.25em;
  }
  li {
    margin-top: 0.5em;
  }
  strong {
    font-size: 1.1em;
    font-weight: bold;
  }
  .amount {
    font-size: 1.05em;
  }
  .fab-container {
    margin: 16px 16px;
  }
  .shaking-container {
    position: relative;
    overflow: hidden;
  }
  .warning {
    margin-top: 16px;
  }
  .peg-definition {
    margin-bottom: 20px;
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
  {#if !(data && action.accountCreationState)}
    <Page title={pageTitle}>
      <svelte:fragment slot="content">
        <Paper style="margin: 36px 18px" elevation={8}>
          <Title>Unknown currency</Title>
          <Content>
            Can not obtain information about the digital
            currency. This is either a temporary problem, or the
            currency is not configured correctly.
          </Content>
        </Paper>
      </svelte:fragment>

      <svelte:fragment slot="floating">
        <div class="fab-container">
          <Fab on:click={cancel} extended>
            <Label>Cancel</Label>
          </Fab>
        </div>
        <div class="fab-container">
          <Fab color="primary" on:click={retry} extended>
            <Label>Retry</Label>
          </Fab>
        </div>
      </svelte:fragment>
    </Page>
  {:else}
    <Page title={pageTitle} hideFloating={openEnterPinDialog}>
      <svelte:fragment slot="content">
        {#if !isCreateAccountAction && hasNotCreatedPegAccount}
          <Dialog
            open
            scrimClickAction=""
            aria-labelledby="ack-peg-explanation-dialog-title"
            aria-describedby="ack-peg-explanation-dialog-content"
            >
            <DialogTitle>What a "currency peg" is?</DialogTitle>
            <DialogContent style="word-break: break-word">
              <p class="peg-definition">
                A currency peg is a promise by the issuer of the
                currency to maintain a
                <span style="font-weight: bold">
                  fixed exchange rate
                </span>
                between their currency (the pegged currency) and some
                other currency (the anchor currency).
              </p>
              <p>
                The issuer of the "{peggedDebtorName}" currency, has
                declared a fixed exchange rate with the
                "{data.debtorData.debtorName}" currency. Before you can
                approve this peg, first you should
                <span style="font-weight: bold">
                  create an account with "{data.debtorData.debtorName}".
                </span>
              </p>
            </DialogContent>
            <Actions>
              <Button use={[InitialFocus]} on:click={gotIt}>
                <ButtonLabel>I have got it</ButtonLabel>
              </Button>
            </Actions>
          </Dialog>
        {/if}

        <EnterPinDialog bind:open={openEnterPinDialog} performAction={submit} />

        <div bind:this={shakingElement}>
          <form
            noValidate
            autoComplete="off"
            on:input={() => actionManager.markDirty()}
            on:change={() => actionManager.save()}
            >
            <LayoutGrid>
              <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
                <AccountInfo
                  homepage={data.debtorData.debtorHomepage?.uri}
                  summary={data.debtorData.summary}
                  >
                  <svelte:fragment slot="title">
                    {#if data.account.display.debtorName === undefined}
                      Account with "{data.debtorData.debtorName}"
                    {:else}
                      Existing account with "{data.debtorData.debtorName}"
                    {/if}
                  </svelte:fragment>
                  <svelte:fragment slot="content">
                    <ul>
                      <li>
                        <em class="amount">
                          {formatAsUnitAmount(data.account.ledger.principal)}&nbsp;{data.unit}
                        </em>
                        are available in your account.
                      </li>
                      {#if data.account.display.debtorName === undefined && data.debtorData.peg}
                        <li>
                          This currency is pegged to another
                          currency. Later, you will be asked to
                          approve this currency peg.
                        </li>
                      {/if}
                    </ul>
                    {#if isCreateAccountAction}
                      <p class="warning">
                        <strong>Note:</strong> You must click the
                        checkbox below, to confirm that you are
                        certain about the real identity of the issuer
                        of this currency. The dangers here are similar
                        to the dangers when a stranger introduces you
                        to an unknown foreign currency: You could be
                        tricked by fraudsters!
                      </p>
                    {/if}
                  </svelte:fragment>
                </AccountInfo>
              </Cell>

              {#if isCreateAccountAction}
                <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }} style="margin: -10px 0 30px 0">
                  <FormField>
                    <Checkbox
                      bind:checked={confirmed}
                      on:click={() => allowIntermediate = false}
                      indeterminate={allowIntermediate && !confirmed}
                      />
                      <span slot="label">
                        I am certain about the real identity of the
                        issuer of this currency.
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
                  suffix="{data.unit.slice(0, 10)}"
                  >
                  <svelte:fragment slot="trailingIcon">
                    {#if invalidNegligibleUnitAmount}
                      <TextfieldIcon class="material-icons">error</TextfieldIcon>
                    {/if}
                  </svelte:fragment>
                  <HelperText style="word-break: break-word" slot="helper" persistent>
                    An amount which you consider as insignificant. It
                    must be equal or bigger than {negligibleUnitAmountStep}
                    {data.unit}. Swaptacular will use this amount when
                    deciding whether the account can be safely
                    deleted, and whether an incoming transfer should
                    be ignored. If in doubt, leave the default value
                    unchanged.
                  </HelperText>
                </Textfield>
              </Cell>
            </LayoutGrid>
          </form>
        </div>
      </svelte:fragment>

      <svelte:fragment slot="floating">
        <div class="fab-container">
          <Fab on:click={cancel} extended>
            <Label>Cancel</Label>
          </Fab>
        </div>
        <div class="fab-container">
          <Fab color="primary" on:click={confirm} extended>
            <Label>{isCreateAccountAction ? 'Confirm' : 'Create'}</Label>
          </Fab>
        </div>
      </svelte:fragment>
    </Page>
  {/if}
</div>
