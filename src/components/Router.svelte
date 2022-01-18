<script lang="ts">
  import { setContext, onMount } from 'svelte'
  import type { AppState } from '../app-state'
  import CreateAccountActionPage from './CreateAccountActionPage.svelte'
  import AckAccountInfoActionPage from './AckAccountInfoActionPage.svelte'
  import ActionsPage from './ActionsPage.svelte'
  import AccountsPage from './AccountsPage.svelte'

  export let app: AppState
  export let snackbarBottom: string = '0px'

  const { pageModel } = app
  const originalAppState = app
  let seqnum = typeof history.state === 'number' ? history.state : 0

  function enusreOriginalAppState(appState: AppState): void {
    if (appState !== originalAppState) throw new Error('unoriginal app state')
  }
  function getPageComponent(pageModelType: string) {
    switch (pageModelType) {
    case 'CreateAccountActionModel':
      return CreateAccountActionPage
    case 'AckAccountInfoActionModel':
      return AckAccountInfoActionPage
    case 'ActionsModel':
      return ActionsPage
    case 'AccountsModel':
      return AccountsPage
    default:
      throw new Error('unknown page model type')
    }
  }
  function hijackBackButton() {
    history.scrollRestoration = 'manual'
    history.pushState(++seqnum, '')
  }
  function goBack() {
    hijackBackButton()
    if (app.goBack) {
      app.goBack()
    } else {
      $pageModel.goBack?.()
    }
  }

  setContext('app', app)
  hijackBackButton()
  onMount(() => {
    addEventListener('popstate', goBack)
    return () => {
      removeEventListener("popstate", goBack)
    }
  })

  $: enusreOriginalAppState(app)
  $: pageComponent = getPageComponent($pageModel.type)
</script>

<svelte:component this={pageComponent} model={$pageModel} {app} bind:snackbarBottom />
