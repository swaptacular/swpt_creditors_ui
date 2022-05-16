<script lang="ts">
  import { Title, Content, Actions, InitialFocus } from '@smui/dialog'
  import { tick } from 'svelte'
  import Button, { Label } from '@smui/button'
  import Textfield from '@smui/textfield'
  import Dialog from './Dialog.svelte'

  export let open: boolean = false
  export let performAction: (pin: string) => void

  let pin: string = ''
  let pinInput: HTMLInputElement
  let pinDisplay: HTMLElement

  function ignoreNonNumberKeys(evt: KeyboardEvent){
    if (evt.key.length === 1) {
      const charCode = evt.key.charCodeAt(0)
      if (charCode < 48 || charCode > 57) {
        evt.preventDefault()
      }
    }
  }

  function onPinInputFocus() {
    pin = ''
    pinDisplay.className += ' focused'
  }

  function onPinInputBlur() {
    if (pinDisplay.className.endsWith(' focused')) {
      pinDisplay.className = pinDisplay.className.slice(0, -8)
    }
  }

  function close(): void {
    pin = ''
    open = false
  }

  async function focusPinInput() {
    await tick()
    pinInput?.focus()
  }

  function submit(e: Event): void {
    e.preventDefault()
    const enteredPin = pin
    close()
    performAction(enteredPin)
  }

  $: pinMask = '\u2022'.repeat(pin.length)
  $: if (open) {
    focusPinInput()
  }
</script>

<style>
  .pin-explain {
    margin-bottom: 1.5em;
  }

  .pin-hide {
    position: absolute;
    height: 1px;
    top: -1000vh;
  }

  .pin-mask {
    display: flex;
    align-items: center;
    color: rgba(0, 0, 0, 0.6);
    font-size: 2.3em;
    padding-bottom:6px;
    border-bottom: dashed 1px#ddd;
  }

  .pin-mask .caret {
    display: block;
    height: 2ex;
  }

  :global(.focused) .caret {
    border-right: solid 1px black;
    will-change: opacity;
    animation: blinker 1s linear infinite;
  }

  @keyframes blinker {
    50% {
      opacity: 0;
    }
  }
</style>

{#if open}
  <div class="shaking-container">
    <Dialog
      open
      scrimClickAction=""
      aria-labelledby="enter-pin-dialog-title"
      aria-describedby="enter-pin-dialog-content"
      on:MDCDialog:closed={close}
      >
      <Title id="enter-pin-dialog-title">Enter your PIN</Title>
      <Content id="enter-pin-dialog-content">
        <form noValidate autoComplete="off">
          <p class="pin-explain">
            To guarantee the security of your wallet, you must enter
            your personal identification number.
          </p>
          <p class="pin-hide">
            <Textfield
              variant="outlined"
              style="width: 100%"
              type="tel"
              input$maxlength={10}
              use={[InitialFocus]}
              bind:value={pin}
              bind:this={pinInput}
              on:keypress={ignoreNonNumberKeys}
              on:focus={onPinInputFocus}
              on:blur={onPinInputBlur}
              label="Your PIN"
              >
            </Textfield>
          </p>
          <p
            class="pin-mask"
            bind:this={pinDisplay}
            on:click={() => pinInput.focus()}
            >
            {pinMask}<span class="caret"></span>
          </p>
        </form>
      </Content>
      <Actions>
        <Button>
          <Label>Cancel</Label>
        </Button>
        <Button default on:click={submit}>
          <Label>OK</Label>
        </Button>
      </Actions>
    </Dialog>
  </div>
{/if}
