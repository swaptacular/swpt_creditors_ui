<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { qrcodegen } from '../qrcodegen'

  export let value: string = ''
  export let className = 'qrcode'
  export let dataUrl: string | undefined = undefined

  let canvasElement: HTMLCanvasElement | undefined

  function drawCanvas(
    qr: qrcodegen.QrCode,
    scale: number,
    border: number,
    lightColor: string,
    darkColor: string,
    canvas: HTMLCanvasElement,
  ): void {
    if (scale <= 0 || border < 0) {
      throw new RangeError("Value out of range")
    }
    const width: number = (qr.size + border * 2) * scale
    canvas.width = width
    canvas.height = width
    let ctx = canvas.getContext("2d") as CanvasRenderingContext2D
    ctx.fillStyle = lightColor
    ctx.fillRect(0, 0, width, width)
    for (let y = -border; y < qr.size + border; y++) {
      for (let x = -border; x < qr.size + border; x++) {
	ctx.fillStyle = qr.getModule(x, y) ? darkColor : lightColor
	ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale)
      }
    }
  }

  function revokeDataUrl(): void {
    if (dataUrl !== undefined) {
      URL.revokeObjectURL(dataUrl)
    }
    dataUrl = undefined
  }

  function generateQrCode(s: string, canvas: HTMLCanvasElement) {
    const errCorLvl: qrcodegen.QrCode.Ecc = qrcodegen.QrCode.Ecc.LOW
    const qrCode: qrcodegen.QrCode = qrcodegen.QrCode.encodeText(s, errCorLvl)
    drawCanvas(qrCode, 20, 4, "#FFFFFF", "#000000", canvas)
    revokeDataUrl()
    dataUrl = canvas.toDataURL('image/png')
  }

  $: {
    if (value && canvasElement) {
      generateQrCode(value, canvasElement)
    }
  }

  onMount(() => {
    if (dataUrl === undefined) {
      assert(canvasElement)
      generateQrCode(value, canvasElement)
    }
  })

  onDestroy(revokeDataUrl)
</script>

<canvas bind:this={canvasElement} class={className} />
