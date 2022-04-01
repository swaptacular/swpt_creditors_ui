<script lang="ts">
  import type { AppState } from '../app-state'
  import { setContext, onMount } from 'svelte'
  import CreateAccountPage from './CreateAccountPage.svelte'
  import AckAccountInfoPage from './AckAccountInfoPage.svelte'
  import ApproveDebtorNamePage from './ApproveDebtorNamePage.svelte'
  import ApproveAmountDisplayPage from './ApproveAmountDisplayPage.svelte'
  import OverrideCoinPage from './OverrideCoinPage.svelte'
  import ApprovePegPage from './ApprovePegPage.svelte'
  import ConfigAccountPage from './ConfigAccountPage.svelte'
  import ActionsPage from './ActionsPage.svelte'
  import AccountsPage from './AccountsPage.svelte'
  import AccountPage from './AccountPage.svelte'

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
    case 'CreateAccountModel':
      return CreateAccountPage
    case 'AckAccountInfoModel':
      return AckAccountInfoPage
    case 'ApproveDebtorNameModel':
      return ApproveDebtorNamePage
    case 'ApproveAmountDisplayModel':
      return ApproveAmountDisplayPage
    case 'OverrideCoinModel':
      return OverrideCoinPage
    case 'ApprovePegModel':
      return ApprovePegPage
    case 'ConfigAccountModel':
      return ConfigAccountPage
    case 'ActionsModel':
      return ActionsPage
    case 'AccountsModel':
      return AccountsPage
    case 'AccountModel':
      return AccountPage
    default:
      throw new Error('unknown page model type')
    }
  }
  function getUniquePageComponent(pageModelType: string) {
    const PageComponent = getPageComponent(pageModelType)

    // Here we create a unique copy of the component,
    // because <svelte:component> will destroy the old component and
    // create a new one only when a different component has been
    // passed (to the `this` property).
    return class extends PageComponent {}
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
  $: pageComponent = getUniquePageComponent($pageModel.type)
</script>

<svelte:component this={pageComponent} model={$pageModel} {app} bind:snackbarBottom />
