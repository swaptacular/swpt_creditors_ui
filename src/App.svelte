<script lang="ts">
  import { setContext, onMount } from 'svelte'
  import { writable } from 'svelte/store'
  import { createAppState } from './app-state'
  import type { AppState } from  './app-state'
  import Paper, { Title, Content } from '@smui/paper'
  import Snackbar, { Actions, Label } from '@smui/snackbar'
  import IconButton from '@smui/icon-button'
  import Button from '@smui/button'
  import LoginScreen from './components/LoginScreen.svelte'
  import Router from './components/Router.svelte'
  import Hourglass from './components/Hourglass.svelte'
  import ResetPinDialog from './components/ResetPinDialog.svelte'

  const unauthenticated = writable(false)
  setContext('unauthenticated', unauthenticated)

  let snackbarBottom: string = '0px'
  let authenticationErrorSnackbar: any
  let networkErrorSnackbar: any
  let httpErrorSnackbar: any
  let resolveAppStatePromise: (appState?: AppState) => void
  let rejectAppStatePromise: (error: unknown) => void
  let showResetPinDialog: boolean = false

  const appStatePromise = new Promise<AppState | undefined>((resolve, reject) => {
    resolveAppStatePromise = resolve
    rejectAppStatePromise = reject
  })

  function logError(e: unknown): string {
    console.error(e)
    return 'Oops, an unexpected error has occurred which prevents the applcication from running.'
  }

  async function handleClosedAuthenticationErrorSnackbar(event: any) {
    if (event.detail.reason === 'action') {
      const appState = await appStatePromise
      appState?.fetchDataFromServer()
    }
  }

  onMount(() => {
    addEventListener('update-authentication-error', (event) => {
      unauthenticated.set(true)
      if (!authenticationErrorSnackbar.isOpen()) {
        authenticationErrorSnackbar.open()
      }
      event.preventDefault()
    })
    addEventListener('update-network-error', (event) => {
      if (!networkErrorSnackbar.isOpen()) {
        networkErrorSnackbar.open()
      }
      event.preventDefault()
    })
    addEventListener('update-http-error', (event) => {
      if (!httpErrorSnackbar.isOpen()) {
        httpErrorSnackbar.open()
      }
      event.preventDefault()
    })
    addEventListener('pin-not-required', (event) => {
      showResetPinDialog = true
      event.preventDefault()
    })

    // Note that we call `createAppState` after all update-event
    // listeners have been registered. Thus, update problems occurring
    // during the creation of the app state will be properly reported.
    createAppState().then(
      appState => resolveAppStatePromise(appState),
      error => rejectAppStatePromise(error),
    )
  })
</script>

<style>
  .container {
    padding-bottom: var(--snackbar-bottom);
  }
  .container :global(.mdc-snackbar) {
    bottom: var(--snackbar-bottom);
  }
</style>

<div class="container" style="--snackbar-bottom: {snackbarBottom}">
  {#await appStatePromise}
    <Hourglass />
  {:then appState}
    {#if appState === undefined }
      <LoginScreen bind:snackbarBottom  />
    {:else}
      <Router app={appState} bind:snackbarBottom />
      <ResetPinDialog app={appState} bind:open={showResetPinDialog} />
    {/if}
  {:catch error}
    <Paper style="margin: 36px 18px" elevation={8}>
      <Title>Application error</Title>
      <Content>
        {logError(error)}
      </Content>
    </Paper>
  {/await}

  <Snackbar bind:this={authenticationErrorSnackbar} on:MDCSnackbar:closed={handleClosedAuthenticationErrorSnackbar}>
    <Label>An authentication error has occured.</Label>
    <Actions>
      <Button>Login</Button>
      <IconButton class="material-icons" title="Dismiss">close</IconButton>
    </Actions>
  </Snackbar>

  <Snackbar bind:this={networkErrorSnackbar}>
    <Label>A network error has occured.</Label>
    <Actions>
      <IconButton class="material-icons" title="Dismiss">close</IconButton>
    </Actions>
  </Snackbar>

  <Snackbar bind:this={httpErrorSnackbar}>
    <Label>A server error has occured.</Label>
    <Actions>
      <IconButton class="material-icons" title="Dismiss">close</IconButton>
    </Actions>
  </Snackbar>
</div>
