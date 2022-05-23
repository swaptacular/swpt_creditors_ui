<script lang="ts">
  import type { AppState } from '../app-state'
  import { setContext, onMount } from 'svelte'
  import { fade } from 'svelte/transition'
  import CreateAccountPage from './CreateAccountPage.svelte'
  import AckAccountInfoPage from './AckAccountInfoPage.svelte'
  import ApproveDebtorNamePage from './ApproveDebtorNamePage.svelte'
  import ApproveAmountDisplayPage from './ApproveAmountDisplayPage.svelte'
  import OverrideCoinPage from './OverrideCoinPage.svelte'
  import ApprovePegPage from './ApprovePegPage.svelte'
  import ConfigAccountPage from './ConfigAccountPage.svelte'
  import UpdatePolicyPage from './UpdatePolicyPage.svelte'
  import PaymentRequestPage from './PaymentRequestPage.svelte'
  import SealedPaymentRequestPage from './SealedPaymentRequestPage.svelte'
  import ActionsPage from './ActionsPage.svelte'
  import AccountsPage from './AccountsPage.svelte'
  import AccountPage from './AccountPage.svelte'
  import LedgerEntryPage from './LedgerEntryPage.svelte'
  import CreateTransferPage from './CreateTransferPage.svelte'
  import TransfersPage from './TransfersPage.svelte'
  import TransferPage from './TransferPage.svelte'
  import AbortTransferPage from './AbortTransferPage.svelte'

  export let app: AppState
  export let snackbarBottom: string = '0px'

  const { pageModel } = app
  const originalAppState = app
  let seqnum = typeof history.state === 'number' ? history.state : 0
  let exiting = false

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
    case 'UpdatePolicyModel':
      return UpdatePolicyPage
    case 'PaymentRequestModel':
      return PaymentRequestPage
    case 'SealedPaymentRequestModel':
      return SealedPaymentRequestPage
    case 'ActionsModel':
      return ActionsPage
    case 'AccountsModel':
      return AccountsPage
    case 'AccountModel':
      return AccountPage
    case 'LedgerEntryModel':
      return LedgerEntryPage
    case 'CreateTransferModel':
      return CreateTransferPage
    case 'TransfersModel':
      return TransfersPage
    case 'TransferModel':
      return TransferPage
    case 'AbortTransferModel':
      return AbortTransferPage
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
    if (app.goBack) {
      hijackBackButton()
      app.goBack()
    } else if ($pageModel.goBack) {
      hijackBackButton()
      $pageModel.goBack()
    } else {
      history.back()

      // Shows a "Tap again to exit" overlay before exiting. This
      // should be visible only on Android devices, which for some
      // bizarre reason require additional back button tap before
      // `history.back()` takes effect.
      exiting = true
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

<style>
  #overlay {
    position: fixed;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0,0,0,0.1);
    cursor: not-allowed;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #text {
    font-size: 24px;
    padding: 8px;
    background-color: rgb(229,229,229);
    color: black;
    user-select: none;
  }
</style>

{#if exiting}
  <div id="overlay">
    <div id="text" in:fade="{{ duration: 300, delay: 200 }}">Tap again to exit</div>
  </div>
{/if}

<svelte:component this={pageComponent} model={$pageModel} {app} bind:snackbarBottom />
