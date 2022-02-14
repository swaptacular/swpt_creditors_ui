<script lang="ts">
  import type { AppState, ApproveAmountDisplayActionModel, ActionManager } from '../app-state'
  import type { ApproveAmountDisplayActionWithId } from '../operations'
  import Fab, { Label } from '@smui/fab'
  // import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  // import Textfield from '@smui/textfield'
  // import TextfieldIcon from '@smui/textfield/icon'
  // import HelperText from '@smui/textfield/helper-text/index'
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

  let useNew: 'yes' | 'no'
  
  function createUpdatedAction(): ApproveAmountDisplayActionWithId {
    return {
      ...action,
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
    if (invalid) {
      shakeForm()
    } else if (useNew === 'no') {
      actionManager.remove()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    console.log(`Submitting ${pin}`)
    // app.resolveApproveDebtorNameAction(actionManager, model.display.latestUpdateId, pin, model.goBack)
  }

  assert(model.display.debtorName !== undefined)
  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action, createUpdatedAction)
    useNew = 'yes'
  }
  $: action = model.action
  $: invalid = false
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
            <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
              <div class="radio-group">
                <FormField>
                  <Radio bind:group={useNew} value="yes" touch />
                    <span slot="label">Use the new display</span>
                </FormField>
                <FormField>
                  <Radio bind:group={useNew} value="no" touch />
                    <span slot="label">Use the old display</span>
                </FormField>
              </div>
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
