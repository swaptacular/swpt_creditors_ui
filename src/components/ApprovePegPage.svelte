<script lang="ts">
  import type { AppState, ApprovePegModel, ActionManager } from '../app-state'
  import type { ApprovePegActionWithId } from '../operations'
  // import { amountToString } from '../format-amounts'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  // import Textfield from '@smui/textfield'
  // import TextfieldIcon from '@smui/textfield/icon'
  // import HelperText from '@smui/textfield/helper-text/index'
  import Radio from '@smui/radio'
  import FormField from '@smui/form-field'

  import Page from './Page.svelte'
  import EnterPinDialog from './EnterPinDialog.svelte'

  export let app: AppState
  export let model: ApprovePegModel
  export const snackbarBottom: string = "84px"

  let currentModel: ApprovePegModel
  let actionManager: ActionManager<ApprovePegActionWithId>
  let shakingElement: HTMLElement
  let openEnterPinDialog: boolean = false

  let approved: 'yes' | 'no' = 'no'

  function confirm(): void {
    if (approved === 'no') {
      actionManager.remove()
    } else {
      openEnterPinDialog = true
    }
  }

  function submit(pin: string): void {
    // TODO: implement
    pin
    app
  }

  $: if (currentModel !== model) {
    currentModel = model
    actionManager = app.createActionManager(model.action)
  }
</script>

<style>
  .fab-container {
    margin: 16px 16px;
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

<Page title="Approve display">
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
                Peg
              </Title>
              <Content>
                Blah-blah
              </Content>
            </Paper>
          </Cell>

          <Cell spanDevices={{ desktop: 6, tablet: 4, phone: 4 }}>
            <div class="radio-group" style="margin-bottom: 8px; word-break: break-word">
              <FormField>
                <Radio bind:group={approved} value="yes" touch />
                <span slot="label">This is OK</span>
              </FormField>
              <FormField>
                <Radio bind:group={approved} value="no" touch />
                <span slot="label">This is not OK</span>
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
