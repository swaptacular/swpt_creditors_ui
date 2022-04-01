<script lang="ts">
  import type { AppState, ActionsModel, ActionRecordWithId } from '../app-state'
  import { IS_A_NEWBIE_KEY } from '../app-state'
  import { onMount } from "svelte"
  import Fab, { Icon } from '@smui/fab';
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import ActionCard from './ActionCard.svelte'
  import Checkbox from '@smui/checkbox'
  import FormField from '@smui/form-field'
  import Paper, { Title, Content } from '@smui/paper'
  import Page from './Page.svelte'
  import Card, { Actions, Content as CardContent } from '@smui/card'
  import Button, { Label } from '@smui/button'
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
    app.showAction(actionId, () => {
      app.pageModel.set({ ...model, scrollTop, scrollLeft })
    })
  }

  onMount(() => {
    scrollElement.scrollTop = model.scrollTop ?? scrollElement.scrollTop
    scrollElement.scrollLeft = model.scrollLeft ?? scrollElement.scrollLeft
  })

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
    --no-actions-color: #c4c4c4;
    margin: 36px 18px 26px 18px;
    text-align: center;
    color: var(--no-actions-color);
  }
</style>

<Page title="Actions">
  <svelte:fragment slot="content">
    {#if hasRegularActions }
      <LayoutGrid>
        {#each regularActions as action }
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
            <Card>
              <CardContent>
                To acquire any digital currency, first you need to
                create an account with it. To create an account with
                the digital currency of your choice, you should scan
                the QR code that identifies the currency. In
                Swaptacular, the QR code that identifies a given
                currency is called "the digital coin" for this
                currency.
              </CardContent>
              <Actions fullBleed>
                <Button on:click={() => app.showAccounts() }>
                  <Label>Create an account</Label>
                  <i class="material-icons" aria-hidden="true">arrow_forward</i>
                </Button>
              </Actions>
            </Card>
          </Cell>
        </LayoutGrid>
      {:else}
        <p class="no-actions">
          Press
          <Icon class="material-icons" style="vertical-align: middle">local_atm</Icon>
          to make a payment.
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
          {#each foreignActions as action }
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
    {#if hasAccounts}
      <div class="fab-container">
        <Fab on:click={() => alert('not implemented') }>
          <Icon class="material-icons">history</Icon>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={() => showMakePaymentDialog = true} >
          <Icon class="material-icons">local_atm</Icon>
        </Fab>
      </div>
    {/if}
    <div class="fab-container">
      <Fab color="primary" on:click={() => app.showAccounts() } >
        <Icon class="material-icons">account_balance_wallet</Icon>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
