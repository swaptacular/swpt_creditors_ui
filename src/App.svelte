<script lang="ts">
  import LoginScreen from './components/LoginScreen.svelte'

  let snackbarBottom: string
</script>

<main>
  <LoginScreen bind:snackbarBottom  />
</main>
