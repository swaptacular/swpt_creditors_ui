<script lang="ts">
  import { onMount } from 'svelte'
  import QRious from 'qrious'

  const QRcode = new QRious()

  export let errorCorrection = "L"
  export let background = "#fff"
  export let color = "#000"
  export let value = ""
  export let size = 200
  export let padding = 0
  export let className = "qrcode"
  export let dataUrl: string | undefined = undefined

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
    if(value) {
      generateQrCode()
    }
  }

  onMount(() => {
    generateQrCode()
  })

</script>

<img src={dataUrl} alt={value} class={className}/>
