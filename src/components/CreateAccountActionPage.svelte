<script lang="ts">
  import type { AppState, CreateAccountActionModel, ActionManager } from '../app-state'
  import type { CreateAccountActionWithId } from '../operations'
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
  export let model: CreateAccountActionModel
  export const snackbarBottom: string = "84px"

  let currentModel: CreateAccountActionModel
  let actionManager: ActionManager<CreateAccountActionWithId>
  let shakingElement: HTMLElement
  let openEnterPinDialog: boolean = false

  let debtorName: string
  let negligibleUnitAmount: string | number
  let negligibleUnitAmountStep: string

  let invalidDebtorName: boolean
  let invalidNegligibleUnitAmount: boolean

  function createUpdatedAction(): CreateAccountActionWithId {
    assert(data && action.state)
    return {
      ...action,
      state: {
        ...action.state,
        editedDebtorName: debtorName,
        editedNegligibleAmount: Math.max(0, Number(negligibleUnitAmount) || 0) * data.amountDivisor,
      },
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

  function confirm(): void {
    assert(data && action.state)
    if (invalid) {
      shakeForm()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    assert(data && action.state)
    app.confirmCreateAccountAction(actionManager, data, pin)
  }

  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    debtorName = model.action.state?.editedDebtorName ?? ''
    negligibleUnitAmount = (model.data && model.action.state) ? amountToString(
      BigInt(Math.ceil(model.action.state.editedNegligibleAmount)),
      model.data.amountDivisor,
      model.data.decimalPlaces,
    ) : ''
    negligibleUnitAmountStep = (model.data && model.action.state) ? amountToString(
      BigInt(Math.ceil(model.action.state.tinyNegligibleAmount)),
      model.data.amountDivisor,
      model.data.decimalPlaces,
    ) : 'any'
  }
  $: action = model.action
  $: data = model.data

  // TODO: Check whether `debtorName` is unique among user's accounts,
  // and show an error if there is a name collision.
  $: invalid = invalidDebtorName || invalidNegligibleUnitAmount
</script>

<style>
  ul {
    list-style: '\2713\00A0' outside;
    margin: 0.75em 1.25em;
  }
  li {
    margin: 0.5em 0;
  }
  em {
    font-weight: bold;
    color: #444;
  }
  .summary {
    color: #888;
    margin-top: 16px;
  }
  .amount {
    font-size: 1.1em;
    white-space: nowrap;
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
  {#if !(data && action.state)}
    <Page title="Create account">
      <svelte:fragment slot="content">
        <Paper style="margin: 36px 18px" elevation={8}>
          <Title>Unknown debtor</Title>
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
            <Label>Reject</Label>
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
    <Page title="Create account">
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
                <Wrapper>
                  <Paper style="margin-top: 16px; margin-bottom: 16px; word-wrap: break-word" elevation={4}>
                    <Title style="font-size: 1.25em; font-weight: bold; line-height: 1.3; color: #444">
                      {#if data.debtorData.debtorHomepage}
                        <Chip chip="help" on:click={() => undefined} style="float: right; margin-left: 6px">
                          <Text>
                            <a
                              href={data.debtorData.debtorHomepage.uri}
                              target="_blank"
                              style="text-decoration: none; color: black"
                              >
                              www
                            </a>
                          </Text>
                        </Chip>
                        <Tooltip>{data.debtorData.debtorHomepage.uri}</Tooltip>
                      {/if}
                      {#if data.existingAccount}
                        Existing account with "{data.debtorData.debtorName}"
                      {:else}
                        Account with "{data.debtorData.debtorName}"
                      {/if}
                    </Title>
                    <Content style="clear: both">
                      {#if data.debtorData.summary}
                        <blockquote class="summary">{data.debtorData.summary}</blockquote>
                      {/if}
                      <ul>
                        <li>
                          <em class="amount">
                            {amountToString(data.account.ledger.principal, data.amountDivisor, data.decimalPlaces)} {data.unit}
                          </em>
                          are deposited in your account.
                        </li>
                        {#if data.account.display.debtorName === undefined && data.debtorData.peg}
                          <li>
                            This currency is pegged to another
                            currency. Later, you will be asked to
                            approve this currency peg.
                          </li>
                        {/if}
                      </ul>
                    </Content>
                  </Paper>
                </Wrapper>
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
                  label="Debtor name"
                  >
                  <svelte:fragment slot="trailingIcon">
                    {#if invalidDebtorName}
                      <TextfieldIcon class="material-icons">error</TextfieldIcon>
                    {/if}
                  </svelte:fragment>
                  <HelperText slot="helper" persistent>
                    Every account must have a unique debtor name.
                  </HelperText>
                </Textfield>
              </Cell>

              <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
                <Textfield
                  required
                  variant="outlined"
                  type="number"
                  input$min="0"
                  input$step={negligibleUnitAmountStep}
                  style="width: 100%"
                  withTrailingIcon={invalidNegligibleUnitAmount}
                  bind:value={negligibleUnitAmount}
                  bind:invalid={invalidNegligibleUnitAmount}
                  label="Negligible amount"
                  suffix="{data.unit}"
                  >
                  <svelte:fragment slot="trailingIcon">
                    {#if invalidNegligibleUnitAmount}
                      <TextfieldIcon class="material-icons">error</TextfieldIcon>
                    {/if}
                  </svelte:fragment>
                  <HelperText slot="helper" persistent>
                    An amount to be considered negligible. It will be
                    used to decide whether the account can be safely
                    deleted, and whether an incoming transfer can be
                    ignored.
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
            <Label>{data.existingAccount ? 'Cancel' : 'Reject'}</Label>
          </Fab>
        </div>
        <div class="fab-container">
          <Fab color="primary" on:click={confirm} extended>
            <Label>Confirm</Label>
          </Fab>
        </div>
      </svelte:fragment>
    </Page>
  {/if}
</div>
