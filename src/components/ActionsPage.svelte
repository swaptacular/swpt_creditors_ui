<script lang="ts">
  import type { AppState, ActionsModel, ActionRecordWithId } from '../app-state'
  import { IS_A_NEWBIE_KEY } from '../app-state'
  import Fab, { Icon } from '@smui/fab';
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import ActionCard from './ActionCard.svelte'
  import Checkbox from '@smui/checkbox'
  import FormField from '@smui/form-field'
  import Paper, { Title, Content } from '@smui/paper'
  import Page from './Page.svelte'
  import Card, { Content as CardContent } from '@smui/card'
  import MakePaymentDialog from './MakePaymentDialog.svelte'

  export let app: AppState
  export let model: ActionsModel
  export const snackbarBottom: string = '84px'

  const SHOW_FOREIGN_ACTIONS_KEY = 'debtors.showForeignActions'
  const scrollElement = document.documentElement
  let isANewbie = localStorage.getItem(IS_A_NEWBIE_KEY) === 'true'
  let showForeignActions = localStorage.getItem(SHOW_FOREIGN_ACTIONS_KEY) === 'true'
  let showMakePaymentDialog = false

  function separateForeignActions(allActions: ActionRecordWithId[]): [ActionRecordWithId[], ActionRecordWithId[]] {
    let regularActions = []
    let foreignActions = []
    for (const action of allActions) {
      if (action.actionType === 'AbortTransfer' && !action.transfer.originatesHere) {
        foreignActions.push(action)
      } else {
        regularActions.push(action)
      }
    }
    return [regularActions, foreignActions]
  }

  function showAction(actionId: number): void {
    const scrollTop = scrollElement.scrollTop
    const scrollLeft = scrollElement.scrollLeft
    const m = { ...model, scrollTop, scrollLeft }
    app.showAction(actionId, () => {
      app.pageModel.set(m)
    })
  }

  function showTransfers(): void {
    app.startInteraction()
    app.showTransfers()
  }

  function showAccounts(): void {
    app.startInteraction()
    app.showAccounts()
  }

  function scanPaymentRequest(): void {
    app.startInteraction()
    showMakePaymentDialog = true
  }

  $: actions = model.actions
  $: hasAccounts = app.accountsMap.hasAccounts()
  $: [regularActions, foreignActions] = separateForeignActions($actions)
  $: hasRegularActions = regularActions.length > 0
  $: hasForeignActions = foreignActions.length > 0
  $: localStorage.setItem(SHOW_FOREIGN_ACTIONS_KEY, String(showForeignActions))
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
  .no-actions {
    --no-actions-color: #888;
    font-size: 1.25em;
    margin: 36px 18px 26px 18px;
    text-align: center;
    color: var(--no-actions-color);
  }
</style>

<Page title="Actions" scrollTop={model.scrollTop} scrollLeft={model.scrollLeft} >
  <svelte:fragment slot="content">
    {#if hasRegularActions }
      <LayoutGrid>
        {#each regularActions as action (action.actionId) }
          <Cell>
            <ActionCard {action} show={() => showAction(action.actionId)} />
          </Cell>
        {/each}
      </LayoutGrid>
    {:else}
      {#if isANewbie && !hasAccounts}
        <LayoutGrid>
          <Cell>
            <Paper elevation={8} style="margin-bottom: 16px">
              <Title>Are you new to Swaptacular?</Title>
              <Content>
                Every time this app starts, you will see the "Actions"
                screen first. It shows things that require your
                attention &ndash; like actions that have been started,
                but have not been finalized.
              </Content>
            </Paper>
          </Cell>
          <Cell>
            <Card padded>
              <CardContent style="line-height: 1.4">
                Press the
                <Icon class="material-icons" style="vertical-align: middle">account_balance_wallet</Icon>
                button below to check the contents of your wallet, or
                to add a new account to it.
              </CardContent>
            </Card>
          </Cell>
        </LayoutGrid>
      {:else}
        <p class="no-actions">
          Press the
          <Icon class="material-icons" style="vertical-align: middle">local_atm</Icon>
          button below to make a payment.
        </p>
      {/if}
    {/if}
    {#if hasForeignActions}
      <LayoutGrid>
        <Cell span={12}>
          <FormField>
            <Checkbox bind:checked={showForeignActions} />
            <span slot="label">Show troubled payments initiated from other devices.</span>
          </FormField>
        </Cell>
        {#if showForeignActions }
          {#each foreignActions as action (action.actionId) }
            <Cell>
              <ActionCard color="secondary" {action} show={() => showAction(action.actionId)} />
            </Cell>
          {/each}
        {/if}
      </LayoutGrid>
    {/if}

    <MakePaymentDialog bind:open={showMakePaymentDialog}/>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    {#if !isANewbie || hasAccounts}
      <div class="fab-container">
        <Fab on:click={showTransfers}>
          <Icon class="material-icons">history</Icon>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={scanPaymentRequest} >
          <Icon class="material-icons">local_atm</Icon>
        </Fab>
      </div>
    {/if}
    <div class="fab-container">
      <Fab color="primary" on:click={showAccounts} >
        <Icon class="material-icons">account_balance_wallet</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
