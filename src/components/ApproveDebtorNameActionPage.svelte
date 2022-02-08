<script lang="ts">
  import type { AppState, ApproveDebtorNameActionModel, ActionManager } from '../app-state'
  import type { ApproveDebtorNameActionWithId } from '../operations'
  import Fab, { Label } from '@smui/fab'
  // import Paper, { Title, Content } from '@smui/paper'
  // import LayoutGrid, { Cell } from '@smui/layout-grid'
  // import Textfield from '@smui/textfield'
  // import TextfieldIcon from '@smui/textfield/icon'
  // import HelperText from '@smui/textfield/helper-text/index'
  // import Chip, { Text } from '@smui/chips'
  // import Tooltip, { Wrapper } from '@smui/tooltip'
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

  let invalidDebtorName: boolean
  let uniqueDebtorName: boolean

  function createUpdatedAction(): ApproveDebtorNameActionWithId {
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    return {
      ...action,
      editedDebtorName: debtorName,
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
    uniqueDebtorName = isUniqueDebtorName(debtorName)
    if (invalid) {
      shakeForm()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    console.log(`submitted ${pin}`)
    //app.confirmCreateAccountAction(actionManager, data, pin, model.goBack)
  }

  function isUniqueDebtorName(debtorName: string): boolean {
    const nameRegex = new RegExp(`^${debtorName}$`, 'us')
    const matchingAccounts = app.accountsMap.getAccountRecordsMatchingDebtorName(nameRegex)
    switch (matchingAccounts.length) {
    case 0:
      return true
    case 1:
      return matchingAccounts[0].debtor.uri === model.account.debtor.uri
    default:
      return false
    }
  }

  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    debtorName = model.action.editedDebtorName ?? ''
    uniqueDebtorName = isUniqueDebtorName(debtorName)
  }
  $: action = model.action
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
  <Page title="Approve name">
    <svelte:fragment slot="content">
      <EnterPinDialog bind:open={openEnterPinDialog} performAction={submit} />

      <div bind:this={shakingElement} slot="content">
        <form
          noValidate
          autoComplete="off"
          on:input={() => actionManager.markDirty()}
          on:change={() => actionManager.save()}
          >
        </form>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="floating">
      <div class="fab-container">
        <Fab color="primary" on:click={confirm} extended>
          <Label>Submit</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
</div>
