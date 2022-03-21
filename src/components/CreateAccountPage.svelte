<script lang="ts">
  import type { AppState, CreateAccountModel } from '../app-state'
  import type { CreateAccountActionWithId, ApprovePegActionWithId } from '../operations'
  import { limitAmountDivisor } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import Chip, { Text } from '@smui/chips'
  import Tooltip, { Wrapper } from '@smui/tooltip'
  import { amountToString } from '../format-amounts'
  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'

  export let app: AppState
  export let model: CreateAccountModel
  export const snackbarBottom: string = "84px"

  let shakingElement: HTMLElement
  let openEnterPinDialog = false
  let actionManager = app.createActionManager(model.action, createUpdatedAction)
  let debtorName = model.action.accountCreationState?.editedDebtorName ?? ''
  let uniqueDebtorName = isUniqueDebtorName(debtorName, model.action)
  let negligibleUnitAmount = formatAsUnitAmount(model.action.accountCreationState?.editedNegligibleAmount)
  let negligibleUnitAmountStep = formatAsUnitAmount(model.action.accountCreationState?.tinyNegligibleAmount)
  let invalidDebtorName: boolean
  let invalidNegligibleUnitAmount: boolean

  function createUpdatedAction(): CreateAccountActionWithId | ApprovePegActionWithId {
    assert(data && action.accountCreationState)
    uniqueDebtorName = isUniqueDebtorName(debtorName, action)
    return {
      ...action,
      accountCreationState: {
        ...action.accountCreationState,
        editedDebtorName: debtorName,
        editedNegligibleAmount: Math.max(0, Number(negligibleUnitAmount) || 0) * limitAmountDivisor(data.amountDivisor),
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
    return amountToString(
      amount,
      model.createAccountData?.amountDivisor ?? 1,
      model.createAccountData?.decimalPlaces ?? 0n,
    )
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
    uniqueDebtorName = isUniqueDebtorName(debtorName, action)
    if (invalid) {
      shakeForm()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    assert(data && action.accountCreationState)
    const knownDebtor = action.actionType === 'CreateAccount'
    app.approveAccountCreationAction(actionManager, data, pin, knownDebtor, model.goBack)
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

  $: action = model.action
  $: pageTitle = action.actionType === 'CreateAccount' ? 'Confirm account' : 'Create peg account'
  $: data = model.createAccountData
  $: invalid = invalidDebtorName || !uniqueDebtorName || invalidNegligibleUnitAmount
</script>

<style>
  ul {
    list-style: '\2713\00A0' outside;
    margin: 0.75em 1.25em 0 1.25em;
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
          <Fab on:click={() => actionManager.remove()} extended>
            <Label>Cancel</Label>
          </Fab>
        </div>
        <div class="fab-container">
          <Fab color="primary" on:click={() => model.reload()} extended>
            <Label>Retry</Label>
          </Fab>
        </div>
      </svelte:fragment>
    </Page>
  {:else}
    <Page title={pageTitle}>
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
                    {#if data.debtorData.debtorHomepage}
                      <Wrapper>
                        <Chip chip="help" on:click={() => undefined} style="float: right; margin-left: 6px">
                          <Text>
                            <a
                              href={data.debtorData.debtorHomepage.uri}
                              target="_blank"
                              style="text-decoration: none; color: #666"
                              >
                              www
                            </a>
                          </Text>
                        </Chip>
                        <Tooltip>{data.debtorData.debtorHomepage.uri}</Tooltip>
                      </Wrapper>
                    {/if}
                    Account with "{data.debtorData.debtorName}"
                  </Title>
                  <Content style="clear: both">
                    {#if data.debtorData.summary}
                      <blockquote class="summary">{data.debtorData.summary}</blockquote>
                    {/if}
                    <ul>
                      <li>
                        <em class="amount">
                          {formatAsUnitAmount(data.account.ledger.principal)}&nbsp;{data.unit}
                        </em>
                        are currently available in your account.
                      </li>
                      {#if data.account.display.debtorName === undefined && data.debtorData.peg}
                        <li>
                          This currency is pegged to another
                          currency. Later, you will be asked to
                          approve this currency peg.
                        </li>
                      {/if}
                      {#if data.isConfirmedAccount}
                        <li>
                          You have already confirmed, that you are
                          certain about the real identity of the
                          issuer of this currency.
                        </li>
                      {/if}
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
                  suffix="{data.unit.slice(0, 10)}"
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
                    {negligibleUnitAmountStep} {data.unit}
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
            <Label>{action.actionType === 'CreateAccount'
              ? (data.isConfirmedAccount ? 'Update' : 'Confirm')
              : 'Create'
              }
            </Label>
          </Fab>
        </div>
      </svelte:fragment>
    </Page>
  {/if}
</div>
