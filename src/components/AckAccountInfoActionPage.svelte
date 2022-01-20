<script lang="ts">
  import type { AppState, AckAccountInfoActionModel } from '../app-state'
  import { Title as DialogTitle, Content as DialogContent, Actions, InitialFocus } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import Fab, { Label as FabLabel } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import Page from './Page.svelte'
  import Dialog from './Dialog.svelte'

  export let app: AppState
  export let model: AckAccountInfoActionModel
  export const snackbarBottom: string = "84px"

  let currentModel: AckAccountInfoActionModel
  let showSummary: boolean = false
  let showLink: boolean = false

  function acknowlege(): void {
    app.acknowlegeAckAccountInfoAction(action, model.account, model.goBack)
  }

  $: if (currentModel !== model) {
    currentModel = model
    assert(model.account.display.debtorName !== undefined)
  }
  $: action = model.action
  $: debtorName = model.account.display.debtorName
  $: changes = action.changes
  $: debtorData = action.debtorData
  $: interestRateChangeDate = new Date(action.interestRateChangedAt).toLocaleDateString()
  $: interestRate = action.interestRate.toFixed(3)
  $: configError = action.configError
</script>

<style>
  .text-container {
    display: flex;
    width: 100%;
    justify-content: center;
  }
  .fab-container {
    margin: 16px 16px;
  }
  ul {
    list-style: square outside;
    margin: 0.75em 1.25em;
  }
  li {
    margin: 0.5em 0;
  }
</style>

<Page title="Modified currency">
  <svelte:fragment slot="content">
    {#if showSummary}
      <Dialog
        open
        aria-labelledby="show-summary-dialog-title"
        aria-describedby="show-summary-dialog-content"
        on:MDCDialog:closed={() => showSummary = false}
        >
        <DialogTitle>New currency summary:</DialogTitle>
        <DialogContent style="word-break: break-word">{debtorData.summary}</DialogContent>
        <Actions>
          <Button>
            <Label>Close</Label>
          </Button>
        </Actions>
      </Dialog>
    {/if}

    {#if showLink}
      <Dialog
        open
        aria-labelledby="show-link-dialog-title"
        aria-describedby="show-link-dialog-content"
        on:MDCDialog:closed={() => showLink = false}
        >
        <DialogTitle>New digital coin link:</DialogTitle>
        <DialogContent style="word-break: break-word">
          <a href="{debtorData.latestDebtorInfo.uri}" target="_blank">{debtorData.latestDebtorInfo.uri}</a>
        </DialogContent>
        <Actions>
          <Button use={[InitialFocus]}>
            <Label>Close</Label>
          </Button>
        </Actions>
      </Dialog>
    {/if}

    <div class="text-container">
      <Paper elevation={8} style="margin: 24px 16px; word-break: break-word">
        <Title style="font-size: 1.25em; font-weight: bold; line-height: 1.3; color: #444">
          "{debtorName}" has undergone some changes:
        </Title>
        <Content>
          <ul>
            {#if changes.configError}
              <li>
                {#if configError === undefined}
                  The previously experienced account configuration
                  problem has been resolved. Now your account is
                  configured correctly.
                {:else if configError === 'NO_CONNECTION_TO_DEBTOR'}
                  No connection can be made to the servers that manage
                  this currency. You will not be able to send or
                  receive money from this account, but you still can
                  peg other currencies to it.
                {:else if configError === 'CONFIGURATION_IS_NOT_EFFECTUAL'}
                  An account configuration problem has occurred.
                  Usually this means that temporarily, a connection
                  can not be made to the servers that manage this
                  currency.
                {:else}
                  An account configuration problem has occurred: {configError}.
                {/if}
              </li>
            {/if}

            {#if changes.debtorName}
              <li>
                The official name of the currency has been changed to
                "{debtorData.debtorName}". Later, you will be asked to
                approve this change.
              </li>
            {/if}

            {#if changes.amountDivisor || changes.decimalPlaces || changes.unit}
              <li>
                The issuer has declared a new official way to display
                currency amounts. Later, you will be asked to approve
                this change.
              </li>
            {/if}

            {#if changes.peg}
              <li>
                {#if debtorData.peg}
                  {#if action.hasPreviousPeg}
                    The issuer has declared a new, different currency
                    peg. Later, you will be asked to approve this peg.
                  {:else}
                    The currency has been pegged to another
                    currency. Later, you will be asked to approve this
                    peg.
                  {/if}
                {:else}
                  The previously declared currency peg has been removed.
                {/if}
              </li>
            {/if}

            {#if changes.interestRate}
              <li>
                On {interestRateChangeDate} the issuer changed the
                annual interest rate on your account to
                {interestRate}%.
              </li>
            {/if}

            {#if changes.debtorHomepage}
              <li>
                {#if debtorData.debtorHomepage}
                  The official home page of the currency has been <a href="{debtorData.debtorHomepage.uri}" target="_blank">changed</a>.
                {:else}
                  The official home page of the currency has been changed.
                {/if}
              </li>
            {/if}

            {#if changes.summary}
              {#if debtorData.summary}
                <li>
                  The official currency summary, stated by the issuer,
                  has been <a href="/" target="_blank" on:click|preventDefault={() => showSummary = true}>updated</a>.
                </li>
              {:else}
                <li>
                  The official currency summary, stated by the issuer,
                  has been removed.
                </li>
              {/if}
            {/if}

            {#if changes.latestDebtorInfo}
              <li>
                The digital coin (the QR code) of the currency has
                changed. The new digital coin contains a different
                <a href="/" target="_blank" on:click|preventDefault={() => showLink = true}>link</a>.
              </li>
            {/if}

            {#if changes.otherChanges}
              <li>
                Some unimportant technical details in the description
                of the currency have been changed.
              </li>
            {/if}
          </ul>
        </Content>
      </Paper>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab color="primary" on:click={acknowlege} extended>
        <FabLabel>Acknowlege</FabLabel>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
