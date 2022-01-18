<script lang="ts">
  import type { AppState, AckAccountInfoActionModel } from '../app-state'
  // import type { AckAccountInfoActionWithId } from '../operations'
  import Fab, { Label } from '@smui/fab'
  import Paper, { Title, Content } from '@smui/paper'
  import LayoutGrid, { Cell } from '@smui/layout-grid'
  import Page from './Page.svelte'

  export let app: AppState
  export let model: AckAccountInfoActionModel
  export const snackbarBottom: string = "84px"

  let currentModel: AckAccountInfoActionModel

  function acknowlege(): void {
    // TODO: implement
    app
    action
  }
  
  $: if (currentModel !== model) {
    currentModel = model
  }
  $: action = model.action
</script>

<style>
  .fab-container {
    margin: 16px 16px;
  }
</style>

<Page title="Changed currency">
  <svelte:fragment slot="content">
    <LayoutGrid>
      <Cell spanDevices={{ desktop: 12, tablet: 8, phone: 4 }}>
        <Paper style="margin-top: 12px; margin-bottom: 24px; word-wrap: break-word" elevation={6}>
          <Title style="font-size: 1.25em; font-weight: bold; line-height: 1.3; color: #444">
            Account with ...
          </Title>
          <Content style="clear: both">
            <ul>
              <li>
                Something have changed...
              </li>
            </ul>
          </Content>
        </Paper>
      </Cell>
    </LayoutGrid>
  </svelte:fragment>

  <svelte:fragment slot="floating">
    <div class="fab-container">
      <Fab color="primary" on:click={acknowlege} extended>
        <Label>Acknowlege</Label>
      </Fab>
    </div>
  </svelte:fragment>
</Page>
