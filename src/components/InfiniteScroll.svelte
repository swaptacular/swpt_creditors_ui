<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte"

  export let threshold = 0
  export let hasMore = true
  export const scrollElement = document.documentElement

  const dispatch = createEventDispatcher()
  let waitsForMore = false

  const onScroll = () => {
    const offset = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop
    if (offset <= threshold) {
      if (!waitsForMore && hasMore) {
        dispatch("loadMore")
        waitsForMore = true
      }
    } else {
      waitsForMore = false
    }
  }

  onMount(() => {
    window.addEventListener("scroll", onScroll)
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  })
</script>
