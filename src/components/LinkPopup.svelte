<script lang="ts">
  export let show: boolean
</script>

<a href="." target="_blank" on:click|preventDefault={() => show = true}>
  <slot></slot>
</a>
