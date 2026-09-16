// three-edit-cores 0.0.20 assumes every non-null scene background has dispose().
// A THREE.Color is also a valid background. Keep this fix outside the dependency.
const installations = new WeakMap()

export function installNanjingLifecycle(editor, options = {}) {
  if (!editor || typeof editor.destroySceneRender !== 'function') return null
  if (installations.has(editor)) return installations.get(editor)

  const scene = editor.scene
  const coreDestroy = editor.destroySceneRender.bind(editor)
  let activeDestroy = null
  let result = null

  function recordError(report, phase, error) {
    report.errors.push({ phase, error })
  }

  function attempt(report, phase, action) {
    try { return action() }
    catch (error) { recordError(report, phase, error) }
  }

  function disposeResource(resource, report, phase, attempted) {
    if (!resource || typeof resource.dispose !== 'function' || attempted.has(resource)) return
    attempted.add(resource)
    attempt(report, phase, () => resource.dispose())
  }

  function notify(report) {
    if (!report.errors.length) return
    if (typeof options.onError === 'function') {
      try { options.onError(report) }
      catch (error) { console.error('[nanjing-lifecycle] Error reporter failed', error, report.errors) }
    } else {
      console.error('[nanjing-lifecycle] Editor cleanup encountered errors', report.errors)
    }
  }

  function resetEnvironment() {
    const report = activeDestroy || { errors: [], attempted: new Set() }
    const resources = new Set([scene?.envBackground, scene?.background, scene?.environment])
    // Match the core reset order: stop environment callbacks before clearing the
    // public envBackground setter. Direct scene.environment is used by our EXR.
    if (scene) {
      attempt(report, 'environment callbacks', () => { scene.envMapChangeUseList = [] })
      attempt(report, 'environment reference', () => { scene.envBackground = null })
      attempt(report, 'scene environment reference', () => { scene.environment = null })
      attempt(report, 'background reference', () => { scene.background = null })
    }
    for (const resource of resources) disposeResource(resource, report, 'environment texture', report.attempted)
    if (!activeDestroy) notify(report)
    return report
  }

  if (scene) scene.resetEnv = resetEnvironment

  function destroy(...args) {
    if (result) return result
    const report = result = { destroyed: false, coreCalled: false, coreFailed: false, errors: [], attempted: new Set() }
    activeDestroy = report
    // The core deletes editor fields. Capture ownership before calling it.
    const renderer = editor.renderer
    const composer = editor.effectComposer
    const controls = editor.controls
    const transformControls = editor.transformControls
    const handler = editor.handler
    const gui = editor.GUI
    const elements = new Set([renderer?.domElement, editor.css2DRender?.domElement,
      editor.css3DRender?.domElement, editor.stats?.dom, editor.stats?.domElement])
    const passes = new Set(composer?.passes || [])
    const geometry = new Set()
    const materials = new Set()
    const textures = new Set()
    const coreMaps = new Set()
    const shadows = new Set()

    attempt(report, 'resource inventory', () => scene?.traverse?.(object => {
      if (object.geometry) geometry.add(object.geometry)
      if (object.shadow) shadows.add(object.shadow)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue
        materials.add(material)
        if (material.map) coreMaps.add(material.map)
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
      }
    }))

    // These flags own document / DOM listeners in three-edit-cores. Its destroy
    // implementation does not clear them or dispose either control instance.
    attempt(report, 'keyboard listeners', () => { if (handler) handler.openKeyEnable = false })
    attempt(report, 'context menu listeners', () => { if (handler) handler.rightClickMenusEnable = false })

    try {
      report.coreCalled = true
      // The core cancels its private requestAnimationFrame before disposing the
      // scene. Always call it: stopping renderer.setAnimationLoop is insufficient.
      coreDestroy(...args)
    } catch (error) {
      report.coreFailed = true
      recordError(report, 'core destroy', error)
    } finally {
      attempt(report, 'environment reset', resetEnvironment)
      if (report.coreFailed) {
        for (const resource of geometry) disposeResource(resource, report, 'geometry fallback', report.attempted)
        for (const resource of materials) disposeResource(resource, report, 'material fallback', report.attempted)
      }
      // The core only disposes material.map. Normal/roughness/etc. textures and
      // light shadow targets also belong to this destroyed editor.
      for (const texture of textures) {
        if (report.coreFailed || !coreMaps.has(texture)) disposeResource(texture, report, 'material texture', report.attempted)
      }
      for (const shadow of shadows) disposeResource(shadow, report, 'light shadow', report.attempted)
      for (const pass of passes) {
        if (pass !== composer?.copyPass) disposeResource(pass, report, 'effect pass', report.attempted)
      }
      disposeResource(controls, report, 'orbit controls', report.attempted)
      disposeResource(transformControls, report, 'transform controls', report.attempted)
      if (report.coreFailed) {
        disposeResource(composer, report, 'composer fallback', report.attempted)
        disposeResource(renderer, report, 'renderer fallback', report.attempted)
        attempt(report, 'GUI fallback', () => gui?.destroy?.())
      }
      for (const element of elements) attempt(report, 'editor DOM', () => element?.remove?.())
      report.destroyed = true
      activeDestroy = null
      notify(report)
    }
    return report
  }

  const controller = {
    destroy,
    resetEnvironment,
    getStatus: () => result ? { destroyed: result.destroyed, coreCalled: result.coreCalled,
      coreFailed: result.coreFailed, errors: [...result.errors] } : { destroyed: false, coreCalled: false, coreFailed: false, errors: [] },
  }
  installations.set(editor, controller)
  editor.destroySceneRender = destroy
  return controller
}
