<script lang="ts">
  import { onMount } from 'svelte'
  import QrScanner from 'qr-scanner'
  import { Icon } from '@smui/common'

  export let result: string | undefined = undefined
  let videoElement: HTMLVideoElement
  let noCamera = false
  let windowHeight: number
  let videoHeight: number

  // QrScanner.WORKER_PATH = 'path/to/qr-scanner-worker.min.js'

  function onScannedValue(value: string): void {
    if (value !== result) {
      result = value
    }
  }

  onMount(() => {
    QrScanner.hasCamera().then(ok => { noCamera = !ok })
    const qrScanner = new QrScanner(videoElement, onScannedValue)
    qrScanner.start()
    return () => qrScanner.destroy()
  })

  $: maxVideoHeight = windowHeight - 205
  $: height = videoHeight > maxVideoHeight ? maxVideoHeight : undefined
</script>

<style>
  video {
    width: 100%;
    max-width: 640px;
  }
  .no-camera {
    width: 98%;
    text-align: center;
    color: #c4c4c4;
    padding: 20px 0 10px 0;
    border: 4px dotted;
  }
  .no-camera :global(i) {
    font-size: 150px;
  }
</style>

<svelte:window bind:innerHeight={windowHeight} />

{#if noCamera}
  <div class="no-camera">
    <Icon class="material-icons">videocam_off</Icon>
    <!-- No camera -->
  </div>
{:else}
  <div bind:clientHeight={videoHeight}>
    <!-- svelte-ignore a11y-media-has-caption -->
    <video bind:this={videoElement} {height}></video>
  </div>
{/if}
