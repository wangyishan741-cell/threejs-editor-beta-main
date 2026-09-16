import * as THREE from 'three'

// Capture the ordinary editor pipeline at its current resolution. Do not use
// getSceneEditorImage: that switches to the editor's full-detail export policy.
export function compareNanjingShadows(editor, controller, draw, view) {
  const { renderer, camera } = editor
  const settings = controller.getStatus().layers
  const previous = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov }
  const copyCanvas = () => {
    draw()
    const canvas = document.createElement('canvas')
    canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(renderer.domElement, 0, 0)
    return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data }
  }
  try {
    if (view) {
      camera.position.fromArray(view.position); camera.lookAt(new THREE.Vector3().fromArray(view.target)); camera.fov = view.fov ?? 45
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    }
    controller.updateLayers({ enabled: false })
    const off = copyCanvas()
    // The right-hand capture must show what the user actually has enabled.
    // Forcing true or replacing zero here can make a broken/off editor appear
    // correct only inside this diagnostic dialog.
    controller.updateLayers({ enabled: settings.enabled, strength: settings.strength })
    const on = copyCanvas()
    if (off.canvas.width !== on.canvas.width || off.canvas.height !== on.canvas.height) throw new Error('对比期间窗口尺寸变化，请重新对比')
    let changed = 0, darker = 0, unchanged = 0, totalDifference = 0
    for (let i = 0; i < off.pixels.length; i += 4) {
      const difference = (off.pixels[i] - on.pixels[i] + off.pixels[i + 1] - on.pixels[i + 1] + off.pixels[i + 2] - on.pixels[i + 2]) / 3
      totalDifference += difference
      if (Math.abs(difference) >= 2) changed++
      else unchanged++
      if (difference >= 2) darker++
    }
    const projected = view ? new THREE.Vector3().fromArray(view.target).project(camera) : new THREE.Vector3(0, 0, 0)
    const cx = Math.round((projected.x * .5 + .5) * off.canvas.width), cy = Math.round((.5 - projected.y * .5) * off.canvas.height)
    const sample = pixels => {
      const sum = [0, 0, 0]; let count = 0
      for (let y = Math.max(0, cy - 2); y <= Math.min(off.canvas.height - 1, cy + 2); y++) {
        for (let x = Math.max(0, cx - 2); x <= Math.min(off.canvas.width - 1, cx + 2); x++) {
          const offset = (y * off.canvas.width + x) * 4
          sum.forEach((_, index) => { sum[index] += pixels[offset + index] }); count++
        }
      }
      return sum.map(value => +(value / count).toFixed(2))
    }
    return { off: off.canvas.toDataURL('image/png'), on: on.canvas.toDataURL('image/png'),
      result: { pipeline: 'ordinary editor, no export quality switch', view: view?.name || '当前视角',
        width: off.canvas.width, height: off.canvas.height, enabled: settings.enabled, strength: settings.strength,
        changedPixels: changed, darkerPixels: darker, unchangedPixels: unchanged,
        meanDarkening: totalDifference / (off.canvas.width * off.canvas.height),
        targetPixel: [cx, cy], targetOffRgb: sample(off.pixels), targetOnRgb: sample(on.pixels),
        exposure: renderer.toneMappingExposure, layers: controller.getStatus().layers } }
  } finally {
    controller.updateLayers({ enabled: settings.enabled, strength: settings.strength })
    camera.position.copy(previous.position); camera.quaternion.copy(previous.quaternion); camera.fov = previous.fov
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    draw()
  }
}
