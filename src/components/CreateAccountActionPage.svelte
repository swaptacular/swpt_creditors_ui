<script lang="ts">
  import type { AppState, CreateAccountActionModel } from '../app-state'
  import type { CreateAccountActionWithId } from '../operations'
  import Fab, { Label } from '@smui/fab'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  // import Button, { Label as ButtonLabel } from '@smui/button'
  // import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  // import Dialog from './Dialog.svelte'
  // import PaymentInfo from './PaymentInfo.svelte'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: CreateAccountActionModel
  export const snackbarBottom: string = "84px"

  let currentAction: CreateAccountActionWithId
  let shakingElement: HTMLElement

  let debtorName: string
  let negligibleAmount: number

  let invalidDebtorName: boolean
  let invalidNegligibleAmount: boolean

  let unit: string = 'EUR'

  function shakeForm(): void {
    const shakingSuffix = ' shaking-block'
    const origClassName = shakingElement.className
    if (!origClassName.endsWith(shakingSuffix)) {
      shakingElement.className += shakingSuffix
      setTimeout(() => { shakingElement.className = origClassName }, 1000)
    }
  }

  function reject() {
    // TODO: Add real implementation
    app
  }

  function confirm() {
    if (invalid) {
      shakeForm()
    } else {
      // TODO
    }
  }

  $: if (currentAction !== action) {
    currentAction = action
    debtorName = ''
    negligibleAmount = 0
  }
  $: action = model.action
  $: invalid = invalidDebtorName || invalidNegligibleAmount
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
  <Page title="Create account">
    <svelte:fragment slot="content">
      <div bind:this={shakingElement} slot="content">
        <form
          noValidate
          autoComplete="off"
          on:input={() => undefined}
          on:change={() => undefined}
          >

          <LayoutGrid>
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
                input$step="any"
                style="width: 100%"
                withTrailingIcon={invalidNegligibleAmount}
                bind:value={negligibleAmount}
                bind:invalid={invalidNegligibleAmount}
                label="Negligible amount"
                suffix="{unit}"
                >
                <svelte:fragment slot="trailingIcon">
                  {#if invalidNegligibleAmount}
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
        <Fab on:click={reject} extended>
          <Label>Reject</Label>
        </Fab>
      </div>
      <div class="fab-container">
        <Fab color="primary" on:click={confirm} extended>
          <Label>Confirm</Label>
        </Fab>
      </div>
    </svelte:fragment>
  </Page>
  </div>
