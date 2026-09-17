import { Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { prepareNanjingImportedBatchExport } from './nanjingImportedTreeInstances.js'
import { createNanjingPreviewMetadata, NANJING_PREVIEW_METADATA_KEY } from './previewWaterSurface.js'

const helperOrUtility = object => object.userData?.nanjingUtility || object.userData?.nanjingInstancing
  || object.isHelper || object.isTransformControls || object.isTransformControlsRoot
  || object.type === 'TransformControls' || object.type === 'TransformControlsPlane' || object.type?.includes('Helper')

const importedSourceBatch = object => {
  if (!object.isInstancedMesh) return false
  if (object.userData?.nanjingImportedSourceBatch === true) return true
  let model = false, utility = false
  for (let parent = object; parent; parent = parent.parent) {
    model ||= parent.editorType === 'isModelGroup'
    utility ||= !!(parent.userData?.nanjingUtility || parent.userData?.nanjingInstancing)
  }
  return model && utility
}

/** Clone while render policies expose their editable sources, then remove
 * helper/proxy descendants from the clone. No source nodes or buffers are
 * removed, disposed or modified. Runtime state can resume before image encoding. */
export function cloneSourceSceneForExport(editor) {
  const clone = () => {
    const scene = new Scene()
    const preview = createNanjingPreviewMetadata(editor.nanjingRestore?.getConfig?.())
    if (preview) scene.userData[NANJING_PREVIEW_METADATA_KEY] = preview
    const containsSourceBatch = object => importedSourceBatch(object) || object.children.some(containsSourceBatch)
    function removeUtilities(source, object) {
      if (importedSourceBatch(source)) {
        object.userData.nanjingImportedSourceBatch = true
        prepareNanjingImportedBatchExport(source, object)
      }
      for (let index = source.children.length - 1; index >= 0; index--) {
        const original = source.children[index], child = object.children[index]
        if (helperOrUtility(original) && !containsSourceBatch(original)) object.remove(child)
        else {
          removeUtilities(original, child)
          if (child.isInstancedMesh && child.count === 0) object.remove(child)
        }
      }
    }
    for (const object of editor.scene.children) {
      if (!object.visible || helperOrUtility(object) && !containsSourceBatch(object) || object.isLight || object.isPoints) continue
      if (!(object.isMesh || object.isGroup || object.isObject3D || object.isLine)) continue
      const copy = object.clone(true)
      removeUtilities(object, copy)
      if (copy.isInstancedMesh && copy.count === 0) continue
      scene.add(copy)
    }
    return scene
  }
  return typeof editor.withNanjingSourceScene === 'function' ? editor.withNanjingSourceScene(clone) : clone()
}

export async function exportSourceSceneGlb(editor, options = {}) {
  const scene = await cloneSourceSceneForExport(editor)
  const objectCount = scene.children.length
  if (!objectCount) return { data: null, objectCount: 0 }
  const data = await new GLTFExporter().parseAsync(scene, {
    binary: true, embedImages: true, includeCustomExtensions: true, ...options
  })
  return { data, objectCount }
}
