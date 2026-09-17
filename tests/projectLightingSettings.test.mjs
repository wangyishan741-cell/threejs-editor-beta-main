import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, DirectionalLight, AmbientLight } from 'three'
import {
  SUN_LIGHT_NAME, SKY_FILL_NAME, REALISTIC_LIGHTING_STORAGE_KEY,
  installProjectLightingSettings, getRealisticLightingSettings,
  setRealisticLightingSettings, setProjectLightingBackground,
  restoreProjectLightingBackgrounds, applyRealisticLightingDefaults,
  scheduleRealisticLightingRefresh,
} from '../src/editor/lightingDefaults.js'

function editorFor(params = {}) {
  const scene = new Scene()
  const editor = {
    scene, renderer: { shadowMap: {}, toneMappingExposure: 0.5 },
    saveSceneEdit: () => ({ scene: {}, modelCores: [{ preserved: true }] }),
    destroySceneRender() {},
    resetEditorStorage(value) {
      scene.clear()
      editor.renderer.toneMappingExposure = value?.webglRenderer?.toneMappingExposure ?? 0.5
      for (const entry of value?.lightCores || []) {
        const light = entry.name === SKY_FILL_NAME ? new AmbientLight() : new DirectionalLight()
        Object.assign(light, entry); scene.add(light)
      }
    },
  }
  scene.setSceneBackground = urls => { scene.backgroundUrls = [...urls]; scene.background = { urls } }
  scene.setEnvBackground = urls => { scene.envBackgroundUrls = [...urls]; scene.envBackground = { urls }; scene.environment = scene.envBackground }
  editor.resetEditorStorage(params)
  return editor
}

test('light panel values live in project JSON and survive save/reopen instead of global preferences', () => {
  const oldWindow = globalThis.window
  globalThis.window = { localStorage: { getItem: () => JSON.stringify({ version: 7, exposure: 9 }), setItem: () => assert.fail('project edits must not change global preferences') } }
  try {
    const editor = editorFor()
    installProjectLightingSettings(editor, {})
    const wanted = { sunIntensity: .45, ambientIntensity: 1.25, exposure: 1.6, skyEnabled: true, shadowFloorEnabled: false, ambientOcclusionEnabled: false }
    setRealisticLightingSettings(wanted, editor)
    const data = JSON.parse(JSON.stringify(editor.saveSceneEdit()))
    for (const [key, value] of Object.entries(wanted)) assert.equal(data.realisticLighting[key], value)
    assert.deepEqual(data.modelCores, [{ preserved: true }])
    const reopened = editorFor(data)
    installProjectLightingSettings(reopened, data)
    applyRealisticLightingDefaults(reopened)
    assert.equal(reopened.renderer.toneMappingExposure, 1.6)
    assert.equal(reopened.scene.getObjectByName(SUN_LIGHT_NAME).intensity, .45)
    assert.equal(reopened.scene.getObjectByName(SKY_FILL_NAME).intensity, 1.25)
    assert.equal(getRealisticLightingSettings(reopened).skyEnabled, true)
  } finally { globalThis.window = oldWindow }
})

test('old projects recover their actual saved lights and exposure without global overwrite', () => {
  const params = { webglRenderer: { toneMappingExposure: 1.2 }, lightCores: [
    { name: SUN_LIGHT_NAME, intensity: .6 }, { name: SKY_FILL_NAME, intensity: 1.8 },
  ], scene: { backgroundUrls: ['1', '2', '3', '4', '5', '6'] } }
  const editor = editorFor(params)
  installProjectLightingSettings(editor, params)
  const values = getRealisticLightingSettings(editor)
  assert.equal(values.exposure, 1.2)
  assert.equal(values.sunIntensity, .6)
  assert.equal(values.ambientIntensity, 1.8)
  assert.equal(values.skyEnabled, false)
})

test('switching projects restores each setting and stale scheduled refresh cannot leak', () => {
  const oldWindow = globalThis.window, oldRAF = globalThis.requestAnimationFrame, callbacks = []
  globalThis.window = { setTimeout: callback => callbacks.push(callback) }
  globalThis.requestAnimationFrame = callback => callbacks.push(callback)
  try {
    const a = { realisticLighting: { exposure: 1.6, skyEnabled: false } }
    const b = { realisticLighting: { exposure: .75, sunIntensity: 2.3, skyEnabled: false } }
    const editor = editorFor(a)
    installProjectLightingSettings(editor, a)
    scheduleRealisticLightingRefresh(editor)
    editor.resetEditorStorage(b)
    callbacks.forEach(callback => callback())
    assert.equal(editor.scene.getObjectByName(SUN_LIGHT_NAME), undefined)
    assert.equal(getRealisticLightingSettings(editor).exposure, .75)
    applyRealisticLightingDefaults(editor)
    assert.equal(editor.renderer.toneMappingExposure, .75)
    assert.equal(editor.scene.getObjectByName(SUN_LIGHT_NAME).intensity, 2.3)
  } finally { globalThis.window = oldWindow; globalThis.requestAnimationFrame = oldRAF }
})

test('Nanjing reads existing source values and only forwards an explicit changed field', () => {
  const editor = editorFor(), received = []
  editor.__nanjingRestoreActive = true
  const live = { sunIntensity: 13.6, ambientIntensity: .85, exposure: .7 }
  editor.nanjingRestore = {
    getLightingSettings: () => ({ ...live }),
    setLightingSettings: patch => { received.push({ ...patch }); Object.assign(live, patch) },
  }
  installProjectLightingSettings(editor, { realisticLighting: { exposure: 8 } })
  assert.deepEqual(received, [])
  assert.equal(getRealisticLightingSettings(editor).sunIntensity, 13.6)
  assert.equal(getRealisticLightingSettings(editor).exposure, .7)
  setRealisticLightingSettings({ exposure: 1.6 }, editor)
  assert.deepEqual(received, [{ exposure: 1.6 }])
  const saved = editor.saveSceneEdit().realisticLighting
  assert.equal(saved.exposure, 1.6)
  assert.equal(saved.sunIntensity, 13.6)
  assert.equal(editor.scene.children.length, 0)
})

test('explicit sky/environment selections and clearing roundtrip independently from HDR defaults', () => {
  const editor = editorFor(), urls = ['1', '2', '3', '4', '5', '6']
  installProjectLightingSettings(editor, {})
  setProjectLightingBackground(editor, 'backgroundUrls', urls)
  setProjectLightingBackground(editor, 'environmentUrls', urls)
  assert.equal(getRealisticLightingSettings(editor).skyEnabled, false)
  const saved = JSON.parse(JSON.stringify(editor.saveSceneEdit()))
  editor.scene.background = { originalHDR: true }
  restoreProjectLightingBackgrounds(editor)
  assert.deepEqual(editor.scene.background.urls, urls)
  editor.resetEditorStorage(saved)
  assert.deepEqual(editor.scene.envBackgroundUrls, urls)
  setProjectLightingBackground(editor, 'backgroundUrls', null)
  setProjectLightingBackground(editor, 'environmentUrls', null)
  const cleared = editor.saveSceneEdit()
  assert.equal(editor.scene.backgroundUrls, null)
  assert.equal(editor.scene.envBackgroundUrls, null)
  assert.equal(editor.scene.environment, null)
  assert.equal(editor.scene.environmentEnabled, false)
  assert.equal(cleared.realisticLighting.backgroundUrls, null)
  assert.equal(cleared.realisticLighting.environmentUrls, null)
  editor.resetEditorStorage({})
  editor.scene.background = { differentProjectHDR: true }
  restoreProjectLightingBackgrounds(editor)
  assert.deepEqual(editor.scene.background, { differentProjectHDR: true })
})

test('unavailable source sun remains disabled and rejected source edits do not persist', () => {
  const editor = editorFor()
  editor.__nanjingRestoreActive = true
  editor.nanjingRestore = {
    getLightingSettings: () => ({ sunAvailable: false, sunIntensity: 0, ambientIntensity: .85, exposure: .7 }),
    setLightingSettings: () => { throw new Error('没有主日光') },
  }
  installProjectLightingSettings(editor, {})
  assert.equal(getRealisticLightingSettings(editor).sunAvailable, false)
  assert.throws(() => setRealisticLightingSettings({ sunIntensity: 20 }, editor), /没有主日光/)
  assert.equal(editor.saveSceneEdit().realisticLighting.sunIntensity, 0)
  assert.equal(getRealisticLightingSettings(editor).exposure, .7)
})

test('save captures native renderer/light edits and malformed values do not corrupt project controls', () => {
  const editor = editorFor()
  installProjectLightingSettings(editor, {})
  setRealisticLightingSettings({ skyEnabled: false }, editor)
  editor.renderer.toneMappingExposure = 1.1
  editor.scene.getObjectByName(SUN_LIGHT_NAME).intensity = 2.2
  assert.equal(editor.saveSceneEdit().realisticLighting.exposure, 1.1)
  assert.equal(editor.saveSceneEdit().realisticLighting.sunIntensity, 2.2)
  setRealisticLightingSettings({ ambientIntensity: .7 }, editor)
  assert.equal(editor.renderer.toneMappingExposure, 1.1)
  assert.equal(editor.scene.getObjectByName(SUN_LIGHT_NAME).intensity, 2.2)
  setRealisticLightingSettings({ exposure: NaN, sunIntensity: -4, ambientIntensity: '3' }, editor)
  assert.ok(Number.isFinite(getRealisticLightingSettings(editor).exposure))
  assert.notEqual(getRealisticLightingSettings(editor).sunIntensity, -4)
  assert.throws(() => setProjectLightingBackground(editor, 'backgroundUrls', ['one']), /六张/)
})
