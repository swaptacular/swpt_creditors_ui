<script lang="ts">
  import type { AppState } from '../app-state'
  import { Title, Content } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import Dialog from '@smui/dialog'
  import Textfield from '@smui/textfield'
  import TextfieldIcon from '@smui/textfield/icon'
  import HelperText from '@smui/textfield/helper-text/index'
  import { logout } from '../operations'

  export let app: AppState
  export let pinRequired: boolean = false

  let shakingElement: HTMLElement
  let invalidPin: boolean
  let newPin: string = ''
  const pinPattern = "^[0-9]{4,10}$"

  function ignoreNonNumberKeys(evt: KeyboardEvent){
    if (evt.key.length === 1) {
      const charCode = evt.key.charCodeAt(0)
      if (charCode < 48 || charCode > 57) {
        evt.preventDefault()
      }
    }
  }

  function submit(): void {
    if (invalidPin) {
      const shakingSuffix = ' shaking-block'
      const origClassName = shakingElement.className
      if (!origClassName.endsWith(shakingSuffix)) {
        shakingElement.className += shakingSuffix
        setTimeout(() => { shakingElement.className = origClassName }, 1000)
      }
    } else {
      app.resetPin(newPin)
      pinRequired = true
      newPin = ''
    }
  }

  $: successfulPinReset = app.successfulPinReset
  $: open = !(pinRequired || $successfulPinReset)
</script>

<style>
  p {
    margin-bottom: 1em;
  }
  .submit {
    display: flex;
    justify-content: space-between;
    margin-top: 2em;
  }

  strong {
    font-weight: bold;
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

{#if open}
  <div class="shaking-container">
    <Dialog
      open
      scrimClickAction=""
      escapeKeyAction=""
      aria-labelledby="set-pin-dialog-title"
      aria-describedby="set-pin-dialog-content"
      >
      <Title id="set-pin-dialog-title">Choose a PIN</Title>
      <Content id="set-pin-dialog-content">
        <form noValidate autoComplete="off">
          <p>
            To improve the security of your wallet, you must choose a
            personal identification number (PIN). It will be required
            when performing potentially dangerous operations.
          </p>

          <p>
            <strong>Do not give your PIN to anyone!</strong>
          </p>

          <p bind:this={shakingElement}>
            <Textfield
              required
              variant="outlined"
              style="width: 100%"
              type="tel"
              input$minlength={4}
              input$maxlength={10}
              input$pattern={pinPattern}
              withTrailingIcon={invalidPin}
              bind:invalid={invalidPin}
              bind:value={newPin}
              on:keypress={ignoreNonNumberKeys}
              label="Your PIN"
              >
              <svelte:fragment slot="trailingIcon">
                {#if invalidPin}
                  <TextfieldIcon class="material-icons">error</TextfieldIcon>
                {/if}
              </svelte:fragment>
              <HelperText slot="helper" persistent>
                Must contain at least 4, and at most 10 digits.
              </HelperText>
            </Textfield>
          </p>

          <p class="submit">
            <!-- The type="button" is necessary to prevent form submitting.-->
            <Button type="button" on:click={submit} variant="raised">
              <Label>Save</Label>
            </Button>
            <Button type="button" on:click={() => logout()}>
              <Label>Log out</Label>
            </Button>
          </p>
        </form>
      </Content>
    </Dialog>
  </div>
{/if}

