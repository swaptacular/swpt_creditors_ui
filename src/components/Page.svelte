<script lang="ts">
  import type { AppState } from '../app-state'
  import type { Writable } from 'svelte/store'
  import { onMount, getContext, tick } from 'svelte'
  import { fly, fade } from 'svelte/transition'
  import TopAppBar, { Row, Section, Title, AutoAdjust } from '@smui/top-app-bar'
  import IconButton from '@smui/icon-button'
  import Alerts from './Alerts.svelte'
  import Hourglass from './Hourglass.svelte'
  import ResetPinDialog from './ResetPinDialog.svelte'

  export let title: string
  export let hideFloating: boolean = false
  export let scrollTop: number | undefined = undefined
  export let scrollLeft: number | undefined = undefined

  const app: AppState = getContext('app')
  const { waitingInteractions, alerts, pageModel } = app
  const authenticated: Writable<boolean> = getContext('authenticated')
  let topAppBar: any

  function confirmLogout() {
    app.startInteraction()
    if (confirm('You will be logged out. To use the application again, you will have to log in.')) {
      app.logout()
    }
  }

  function goBack(): void {
    app.startInteraction()
    $pageModel.goBack?.()
  }

  function update(): void {
    app.startInteraction()
    app.fetchDataFromServer(() => $pageModel.reload())
  }

  onMount(async () => {
    await tick()
    document.documentElement.scrollTop = scrollTop ?? 0
    document.documentElement.scrollLeft = scrollLeft ?? 0
  })
</script>

<style>
  /* Hide everything above this component. */
  :global(body, html) {
    display: block !important;
    height: auto !important;
    width: auto !important;
    position: static !important;
  }
  .floating {
    display: flex;
    position: fixed;
    left: 0;
    bottom: 0;
    width: 100%;
    justify-content: center;
    pointer-events: none;
  }
  .floating :global(*) {
    pointer-events: auto;
  }
</style>

<div in:fly="{{ x: 250, duration: 200 }}">
  <TopAppBar variant="fixed" dense bind:this={topAppBar}>
    <Row>
      <Section>
        {#if $pageModel.goBack}
          <IconButton class="material-icons" on:click={goBack}>
            arrow_back
          </IconButton>
        {/if}
        <Title>{title}</Title>
      </Section>

      <Section align="end" toolbar>
        <IconButton class="material-icons" aria-label="Reload" on:click={update}>
          {#if $authenticated}
            sync
          {:else}
            sync_problem
          {/if}
        </IconButton>

        <IconButton class="material-icons" aria-label="Logout" on:click={confirmLogout}>
          logout
        </IconButton>
      </Section>
    </Row>
    <slot name="app-bar"></slot>
  </TopAppBar>

  <AutoAdjust {topAppBar}>
    <ResetPinDialog {app} />

    {#if $alerts.length > 0}
      <Alerts alerts={$alerts} {app} />
    {:else if $waitingInteractions.size > 0 }
      <Hourglass />
    {/if}
    <slot name="content"></slot>

    {#if !hideFloating}
      <div class="floating" in:fade="{{ duration: 300, delay: 210 }}">
        <slot name="floating"></slot>
      </div>
    {/if}
  </AutoAdjust>
</div>
