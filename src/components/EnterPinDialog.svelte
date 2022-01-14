<script lang="ts">
  import { Title, Content, Actions } from '@smui/dialog'
  import Button, { Label } from '@smui/button'
  import Textfield from '@smui/textfield'
  import Dialog from './Dialog.svelte'

  export let open: boolean = false
  export let performAction: (pin: string) => void

  let pin: string = ''

  function ignoreNonNumberKeys(evt: KeyboardEvent){
    if (evt.key.length === 1) {
      const charCode = evt.key.charCodeAt(0)
      if (charCode < 48 || charCode > 57) {
        evt.preventDefault()
      }
    }
  }

  function close(): void {
    pin = ''
    open = false
  }

  function submit(e: Event): void {
    e.preventDefault()
    const enteredPin = pin
    close()
    performAction(enteredPin)
  }
</script>

<style>
  .pin-explain {
    margin-bottom: 1.5em;
  }
</style>

{#if open}
  <div class="shaking-container">
    <Dialog
      open
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
          <p>
            <Textfield
              variant="outlined"
              style="width: 100%"
              type="tel"
              input$maxlength={10}
              bind:value={pin}
              on:keypress={ignoreNonNumberKeys}
              label="Your PIN"
              >
            </Textfield>
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
