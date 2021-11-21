<script lang="ts">
  import { onMount } from "svelte"
  import type { ActionsModel } from '../app-state'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Paper, { Title, Content } from '@smui/paper'
  import Page from './Page.svelte'

  export let model: ActionsModel
  export const snackbarBottom: string = '84px'

  const scrollElement = document.documentElement

  onMount(() => {
    scrollElement.scrollTop = model.scrollTop ?? scrollElement.scrollTop
    scrollElement.scrollLeft = model.scrollLeft ?? scrollElement.scrollLeft
  })
</script>

<Page title="Actions" {...$$props}>
  <svelte:fragment slot="content">
    <LayoutGrid>
      <Cell>
        <Paper elevation={8} style="margin-bottom: 16px">
          <Title>Are you new to Swaptacular?</Title>
          <Content>
            Every time this app starts, you will see the "Actions"
            screen first. It shows things that require your
            attention &ndash; like actions that have been started,
            but have not been finalized.
          </Content>
        </Paper>
      </Cell>
    </LayoutGrid>
  </svelte:fragment>
</Page>
