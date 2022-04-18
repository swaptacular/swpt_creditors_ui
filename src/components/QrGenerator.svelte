<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import QRious from 'qrious'

  const QRcode = new QRious()

  export let background = "#fff"
  export let color = "#000"
  export let value = ""
  export let className = "qrcode"
  export let dataUrl: string | undefined = undefined

  const errorCorrection = "L"

  // NOTE: QRious requires an output size (in pixels) to be passed. It
  // also makes sure that a single QR element (a white/black dot)
  // takes a whole number of pixels. Therefore, to obey the passed
  // size, sometimes empty padding strips will be
  // added. Unfortunately, the padding strips are added always on the
  // right, and on the bottom. To avoid getting too wide strips, we
  // calculate the passed size so that each QR element is big enough
  // (about 32x32 pixels in size). This makes the generated QR code
  // image quite big (up to 2500x2500 pixels). On the plus side, if
  // the user wants to scale up/down the image, while preserving
  // image's sharpness, it will be easier to do so when starting from
  // a higher resolution.
  const bytes = new TextEncoder().encode(value).length
  const approxPixelCount = Math.sqrt(bytes * 12 + 21 * 21)
  const size = Math.ceil(32 * approxPixelCount)
  const padding = 4 * 32

  function generateQrCode() {
    QRcode.set({
      background,
      foreground: color,
      level: errorCorrection,
      padding,
      size,
      value,
    })
    dataUrl = QRcode.toDataURL('image/png')
  }

  $: {
    if (value) {
      generateQrCode()
    }
  }

  onMount(() => {
    if (dataUrl === undefined) {
      generateQrCode()
    }
  })

  onDestroy(() => {
    if (dataUrl !== undefined) {
      URL.revokeObjectURL(dataUrl)
    }
  })
</script>

<img src={dataUrl} alt={value} class={className}/>
