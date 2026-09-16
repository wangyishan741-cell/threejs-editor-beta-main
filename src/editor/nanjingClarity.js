import { Vector2 } from 'three'

// The core FXAA multiplier setter remembers its installation-time DPR. Keep its
// texel size tied to the input render target after resolution/settings changes.
export function createNanjingClarity(editor) {
  const renderer = editor.renderer
  const composer = editor.effectComposer
  const fxaa = composer?.effectPass?.fxaaPass
  const logicalSize = new Vector2()
  const drawingSize = new Vector2()
  const renderDescriptor = fxaa && Object.getOwnPropertyDescriptor(fxaa, 'render')
  const originalRender = fxaa?.render
  let disposed = false

  function updateFxaa(input = composer?.readBuffer) {
    const value = fxaa?.material?.uniforms?.resolution?.value
    if (!value) return false
    let width = input?.width
    let height = input?.height
    if (!(width > 0 && height > 0)) {
      renderer.getDrawingBufferSize(drawingSize)
      width = drawingSize.x
      height = drawingSize.y
    }
    // WebGL allocates integer pixel dimensions even when CSS size * DPR is fractional.
    width = Math.max(1, Math.floor(width))
    height = Math.max(1, Math.floor(height))
    const configuredMultiplier = Number(fxaa.multPixel)
    const multiplier = Number.isFinite(configuredMultiplier) && configuredMultiplier >= 0 ? configuredMultiplier : 1
    const x = multiplier / width
    const y = multiplier / height
    if (value.x === x && value.y === y) return false
    value.set(x, y)
    return true
  }

  function wrappedRender(renderer, writeBuffer, readBuffer, ...args) {
    // This also covers scaled screenshot renders and parameter restoration that
    // happens after sync(). Do not resize any render target from inside a pass.
    if (!disposed) updateFxaa(readBuffer)
    return originalRender.call(this, renderer, writeBuffer, readBuffer, ...args)
  }
  if (typeof originalRender === 'function') fxaa.render = wrappedRender

  // Call after quality changes or editor resize, including when DPR is unchanged.
  // Resolution policy remains with the caller; this never changes renderer DPR.
  function sync() {
    if (disposed || !composer) return false
    renderer.getSize(logicalSize)
    const ratio = renderer.getPixelRatio()
    if (!(logicalSize.x > 0 && logicalSize.y > 0 && ratio > 0)) return false
    let changed = false
    if (composer._pixelRatio !== ratio) {
      composer.setPixelRatio(ratio)
      changed = true
    }
    if (composer._width !== logicalSize.x || composer._height !== logicalSize.y) {
      composer.setSize(logicalSize.x, logicalSize.y)
      changed = true
    }
    return updateFxaa() || changed
  }

  function getStats() {
    const resolution = fxaa?.material?.uniforms?.resolution?.value
    return {
      rendererPixelRatio: renderer.getPixelRatio(),
      composerPixelRatio: composer?._pixelRatio,
      canvasSize: [renderer.domElement.width, renderer.domElement.height],
      renderTargetSize: composer?.readBuffer ? [composer.readBuffer.width, composer.readBuffer.height] : null,
      fxaaEnabled: !!fxaa?.enabled,
      fxaaResolution: resolution ? [resolution.x, resolution.y] : null,
      enabledPasses: Object.entries(composer?.effectPass || {}).filter(([, pass]) => pass.enabled).map(([name]) => name),
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (fxaa?.render === wrappedRender) {
      if (renderDescriptor) Object.defineProperty(fxaa, 'render', renderDescriptor)
      else delete fxaa.render
    }
  }

  sync()
  return { sync, getStats, dispose }
}
