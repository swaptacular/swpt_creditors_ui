<script lang="ts">
  import { login, authorizePinReset } from "../operations"
  import Button, { Group, GroupItem, Label, Icon } from "@smui/button"
  import Menu from "@smui/menu"
  import List, { Item, Text } from "@smui/list"
  import Paper, { Title, Content } from "@smui/paper"

  export const snackbarBottom: string = "84px"

  function action(disablePin: boolean): void {
    if (disablePin) {
      authorizePinReset()
    } else {
      login()
    }
  }

  let menu: any
  let resetPin = false
</script>

<div class="paper-container">
  <div class="paper-height-limiter">
    <Paper style="margin: 36px 18px; max-width: 600px" elevation={8}>
      <Title>Welcome to {appConfig.siteTitle}!</Title>
      <Content>
        {appConfig.siteTitle} makes issuing and holding digital
        currencies possible for everyone. Currency issuers are also
        called <em>debtors</em>, and currency
        holders <em>creditors</em>. This app connects you to our
        creditors’ agent server, which sets up and manages your
        digital wallet.
      </Content>
    </Paper>
  </div>
</div>

<div class="logo-container">
  <img src="favicon.svg" alt="Logo" />
</div>

<div class="floating">
  <div class="button-container">
    <Group variant="raised">
      <Button on:click={() => action(resetPin)} variant="raised">
        <Label>{resetPin ? "Reset PIN" : "Login"}</Label>
      </Button>
      <div use:GroupItem>
        <Button
          on:click={() => menu.setOpen(true)}
          variant="raised"
          style="padding: 0; min-width: 36px;"
        >
          <Icon class="material-icons" style="margin: 0;">arrow_drop_down</Icon>
        </Button>
        <Menu bind:this={menu} anchorCorner="TOP_LEFT">
          <List>
            <Item on:SMUI:action={() => action(false)}>
              <Text>Login</Text>
            </Item>
            <Item on:SMUI:action={() => action(true)}>
              <Text>Reset&nbsp;PIN</Text>
            </Item>
          </List>
        </Menu>
      </div>
    </Group>
  </div>
</div>

<style>
  .floating,
  .logo-container,
  .paper-container {
    display: flex;
    position: fixed;
    left: 0;
    bottom: 0;
    width: 100%;
    justify-content: center;
  }
  .logo-container {
    height: 250px;
    z-index: 1;
  }
  .logo-container :global(img) {
    height: 100%;
  }
  .floating {
    z-index: 3;
  }
  .paper-container {
    z-index: 2;
    height: 100%;
  }
  .paper-height-limiter {
    height: auto;
  }
  .button-container {
    margin: 16px 16px;
  }
</style>
