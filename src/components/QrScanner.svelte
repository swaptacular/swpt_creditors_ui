<script lang="ts">
  import { onMount } from 'svelte'
  import QrScanner from 'qr-scanner'
  import { Icon } from '@smui/common'

  export let result: string | undefined = undefined
  export let hasFlash: boolean = false
  export let flashlightOn: boolean = false

  let qrScanner: QrScanner | undefined
  let videoElement: HTMLVideoElement
  let noCamera = false
  let windowHeight: number
  let videoHeight: number

  // QrScanner.WORKER_PATH = 'path/to/qr-scanner-worker.min.js'

  function onScannedValue(v: string | { data: string }): void {
    const value = typeof(v) === 'string'? v : v.data
    if (value !== result) {
      result = value
    }
  }

  async function setFlashlightState(qrScanner: QrScanner | undefined, flashlightIsOn: boolean): Promise<void> {
    if (qrScanner) {
      hasFlash = await qrScanner.hasFlash()
      if (hasFlash) {
        if (flashlightIsOn) {
          await qrScanner?.turnFlashOn()
        } else {
          await qrScanner?.turnFlashOff()
        }
      }
    }
  }

  onMount(() => {
    QrScanner.hasCamera().then(ok => { noCamera = !ok })
    qrScanner = new QrScanner(
      videoElement,
      onScannedValue,
      { returnDetailedScanResult: true } as any,  // This is passed only to silence a deprecation warning.
    )
    qrScanner.start()
    return () => {
      qrScanner?.destroy()
      qrScanner = undefined
    }
  })

  $: maxVideoHeight = windowHeight - 205
  $: height = videoHeight > maxVideoHeight ? maxVideoHeight : undefined
  $: setFlashlightState(qrScanner, flashlightOn)
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
