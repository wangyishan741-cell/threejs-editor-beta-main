import * as THREE from 'three'
import { NANJING_FACADE_GLAZING_TARGETS } from './nanjingFacadeGlazing.js'

export function compareNanjingGlass(editor, reflections, draw, view) {
  const { camera, renderer } = editor
  const previous = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov }
  const records = []
  for (const target of NANJING_FACADE_GLAZING_TARGETS) {
    const object = editor.scene.getObjectByName(target.objectName)
    for (const material of Array.isArray(object?.material) ? object.material : [object?.material]) {
      const source = material?.userData?.nanjingFacadeGlazingSource
      if (!source || material.name !== target.materialName) continue
      records.push({ material, source, color: material.color.clone(),
        values: Object.fromEntries(Object.keys(source).filter(key => key in material && typeof source[key] !== 'object')
          .filter(key => !['name', 'version'].includes(key)).map(key => [key, material[key]])) })
    }
  }
  const capture = () => {
    draw()
    const canvas = document.createElement('canvas')
    canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height
    canvas.getContext('2d').drawImage(renderer.domElement, 0, 0)
    return canvas.toDataURL('image/png')
  }
  const restore = () => records.forEach(({ material, values, color }) => {
    Object.assign(material, values); material.color.copy(color); material.needsUpdate = true
  })
  try {
    if (view) {
      camera.position.fromArray(view.position); camera.lookAt(new THREE.Vector3().fromArray(view.target)); camera.fov = view.fov ?? 45
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    }
    let before
    const sourceCapture = () => {
      for (const { material, values, source } of records) {
        for (const key of Object.keys(values)) material[key] = source[key]
        material.color.fromArray(source.color); material.needsUpdate = true
      }
      try { return capture() } finally { restore() }
    }
    before = reflections?.withFacadeOriginals ? reflections.withFacadeOriginals(sourceCapture) : sourceCapture()
    const after = capture()
    return { before, after, result: { view: view?.name || '当前视角', changedObjects: records.length,
      drawingBuffer: [renderer.domElement.width, renderer.domElement.height], highestTowerUnchanged: true,
      reflections: reflections?.getStatus() } }
  } finally {
    restore()
    camera.position.copy(previous.position); camera.quaternion.copy(previous.quaternion); camera.fov = previous.fov
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); draw()
  }
}
