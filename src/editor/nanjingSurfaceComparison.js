import * as THREE from 'three'
import { auditNanjingDrawColors } from './nanjingDrawColorAudit.js'

// Compare actual light/material values through the ordinary renderer. The
// camera, source configuration and current enhancement amount are restored.
export function compareNanjingSurfaceLighting(editor, controller, draw, view) {
  if (view?.motionPositions?.length) {
    const frames = view.motionPositions.map((position, index) => compareNanjingSurfaceLighting(editor, controller, draw,
      { ...view, motionPositions: undefined, position, name: `${view.name} ${index + 1}` }))
    // Keep each actual camera frame independently inspectable. The ordinary
    // comparison below restores the scene/camera even if a frame fails.
    return { ...frames[0], frames, result: { view: view.name, frames: frames.map(frame => frame.result) } }
  }
  const { renderer, camera } = editor
  const previous = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov }
  let comparisonFailed = false
  const copy = () => {
    const actualGPU = auditNanjingDrawColors(editor, draw)
    const canvas = document.createElement('canvas')
    canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(renderer.domElement, 0, 0)
    return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, actualGPU }
  }
  const levels = pixels => {
    const histogram = new Uint32Array(256)
    for (let i = 0; i < pixels.length; i += 4) histogram[Math.round(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2])]++
    const count = pixels.length / 4
    const percentile = fraction => {
      let total = 0
      for (let i = 0; i < 256; i++) { total += histogram[i]; if (total >= count * fraction) return i }
      return 255
    }
    return { p10: percentile(.1), p50: percentile(.5), p90: percentile(.9),
      blackFraction: histogram.slice(0, 5).reduce((a, b) => a + b, 0) / count,
      whiteFraction: histogram.slice(251).reduce((a, b) => a + b, 0) / count }
  }
  try {
    if (view) {
      camera.position.fromArray(view.position); camera.lookAt(new THREE.Vector3().fromArray(view.target)); camera.fov = view.fov ?? 45
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    }
    const before = controller.withBaseline(copy), after = controller.withCurrent ? controller.withCurrent(copy) : copy()
    if (before.canvas.width !== after.canvas.width || before.canvas.height !== after.canvas.height) throw new Error('窗口尺寸改变，请重新对比')
    let changedPixels = 0, maximumChannelDifference = 0, totalChannelDifference = 0
    for (let index = 0; index < before.pixels.length; index += 4) {
      let changed = false
      for (let channel = 0; channel < 3; channel++) {
        const difference = Math.abs(before.pixels[index + channel] - after.pixels[index + channel])
        changed ||= difference !== 0; maximumChannelDifference = Math.max(maximumChannelDifference, difference); totalChannelDifference += difference
      }
      if (changed) changedPixels++
    }
    return { before: before.canvas.toDataURL('image/png'), after: after.canvas.toDataURL('image/png'), result: {
      pipeline: controller.pipeline || 'ordinary editor, current quality and unchanged shadow settings', view: view?.name || '当前视角',
      width: before.canvas.width, height: before.canvas.height, lighting: controller.getStatus(),
      before: levels(before.pixels), after: levels(after.pixels),
      difference: { changedPixels, maximumChannelDifference, meanChannelDifference: totalChannelDifference / (before.pixels.length / 4 * 3) },
      actualGPU: { before: before.actualGPU, after: after.actualGPU },
      reflection: 'same static local reflection capture; current intensity/exposure applied to each image'
    } }
  } catch (error) {
    comparisonFailed = true
    throw error
  } finally {
    camera.position.copy(previous.position); camera.quaternion.copy(previous.quaternion); camera.fov = previous.fov
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    // A failing renderer may also reject the recovery frame. Preserve the
    // first capture/export error after restoring the actual scene state.
    try { draw() } catch (error) { if (!comparisonFailed) throw error }
  }
}
