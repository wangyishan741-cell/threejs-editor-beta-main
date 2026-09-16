import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { Vector3 } from 'three'

export const COLOR_GRADE_PASS_NAME = 'colorGradePass'
export const COLOR_GRADE_DEFAULTS = Object.freeze({ version: 1, enabled: false, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 })
const FIELDS = ['brightness', 'contrast', 'saturation', 'temperature', 'tint']
const labels = { brightness: '亮度', contrast: '对比度', saturation: '饱和度', temperature: '色温（冷 / 暖）', tint: '色调（绿 / 洋红）' }
const ORDER = 49
const resetInstallations = new WeakMap()
const stateOf = new WeakMap()

export function normalizeColorGradeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) && (value.version == null || value.version === 1) ? value : {}
  const settings = { ...COLOR_GRADE_DEFAULTS, enabled: source.enabled === true }
  for (const field of FIELDS) settings[field] = Number.isFinite(source[field]) ? Math.max(-100, Math.min(100, source[field])) : 0
  return settings
}

export const COLOR_GRADE_SHADER = {
  name: 'OverallColorGrade',
  uniforms: {
    tDiffuse: { value: null }, colorGradeActive: { value: 0 }, colorGradeBrightness: { value: 1 },
    colorGradeContrast: { value: 1 }, colorGradeSaturation: { value: 1 }, colorGradeWhiteBalance: { value: new Vector3(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
uniform float colorGradeActive;
uniform float colorGradeBrightness;
uniform float colorGradeContrast;
uniform float colorGradeSaturation;
uniform vec3 colorGradeWhiteBalance;
varying vec2 vUv;
void main() {
  vec4 source = texture2D(tDiffuse, vUv);
  if (colorGradeActive < 0.5) { gl_FragColor = source; return; }
  vec3 color = source.rgb * colorGradeBrightness;
  color = (color - vec3(0.18)) * colorGradeContrast + vec3(0.18);
  color *= colorGradeWhiteBalance;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, colorGradeSaturation);
  gl_FragColor = vec4(max(color, vec3(0.0)), source.a);
}`,
}

function uniformsFor(settings) {
  const temperature = settings.temperature / 100, tint = settings.tint / 100
  const balance = [1 + temperature * .2 + tint * .1, 1 - tint * .2, 1 - temperature * .2 + tint * .1]
  const whiteLuminance = balance[0] * .2126 + balance[1] * .7152 + balance[2] * .0722
  return { active: FIELDS.some(field => settings[field] !== 0), brightness: 1 + settings.brightness / 100,
    contrast: 1 + settings.contrast / 100, saturation: 1 + settings.saturation / 100, whiteBalance: balance.map(channel => channel / whiteLuminance) }
}

function notify(pass) {
  const state = stateOf.get(pass), dom = state?.DOM, EventConstructor = dom?.ownerDocument?.defaultView?.Event
  // Nanjing's idle renderer already listens for document input/change events.
  // A reset button or programmatic update must wake that same normal path.
  if (EventConstructor && dom?.dispatchEvent) dom.dispatchEvent(new EventConstructor('change', { bubbles: true }))
  for (const reference of state?.panels || []) {
    const panel = reference.deref()
    if (!panel) state.panels.delete(reference)
    else for (const control of panel.controllers || []) control.updateDisplay?.()
  }
}

export function setColorGradeSettings(pass, patch = {}, { replace = false, autoEnable = false, silent = false } = {}) {
  if (!stateOf.has(pass)) throw new TypeError('An installed color grading pass is required')
  const next = normalizeColorGradeSettings(replace ? patch : { ...pass.colorAdjustments, enabled: pass.enabled, ...patch })
  if (autoEnable && !Object.hasOwn(patch, 'enabled')) next.enabled = FIELDS.some(field => next[field] !== 0)
  Object.assign(pass.colorAdjustments, next)
  pass.enabled = next.enabled
  const values = uniformsFor(next)
  pass.uniforms.colorGradeActive.value = values.active ? 1 : 0
  pass.uniforms.colorGradeBrightness.value = values.brightness
  pass.uniforms.colorGradeContrast.value = values.contrast
  pass.uniforms.colorGradeSaturation.value = values.saturation
  pass.uniforms.colorGradeWhiteBalance.value.fromArray(values.whiteBalance)
  // Editing an effect should show its result even when this ordinary project
  // previously used the direct-renderer option. Loading storage leaves that
  // saved rendering choice alone.
  const composer = stateOf.get(pass).composer
  if (autoEnable && pass.enabled && composer && composer.renderWay !== 'effectComposer') composer.renderWay = 'effectComposer'
  if (!silent) notify(pass)
  return getColorGradeSettings(pass)
}

export function getColorGradeSettings(pass) {
  return normalizeColorGradeSettings({ ...pass.colorAdjustments, enabled: pass.enabled })
}

export function createColorGradePass({ DOM } = {}) {
  const pass = new ShaderPass(COLOR_GRADE_SHADER)
  pass.name = COLOR_GRADE_PASS_NAME
  pass.order = ORDER
  pass.material.depthTest = false; pass.material.depthWrite = false; pass.material.toneMapped = false
  pass.colorAdjustments = { ...COLOR_GRADE_DEFAULTS }
  stateOf.set(pass, { DOM, panels: new Set() })
  setColorGradeSettings(pass, COLOR_GRADE_DEFAULTS, { replace: true, silent: true })
  const dispose = pass.dispose.bind(pass)
  pass.dispose = () => { if (!stateOf.has(pass)) return; stateOf.get(pass).panels.clear(); stateOf.delete(pass); dispose() }
  return pass
}

export const COLOR_GRADE_EFFECT = {
  name: COLOR_GRADE_PASS_NAME,
  label: '整体调色与亮度',
  order: ORDER,
  install: createColorGradePass,
  getStorage: getColorGradeSettings,
  setStorage(pass, stored) {
    // Keep linear grading ahead of the core OutputPass (50), including old
    // storage and the generic panel's editable pass-order field.
    pass.order = ORDER
    return setColorGradeSettings(pass, stored, { replace: true, silent: true })
  },
  createPanel(pass, folder) {
    const state = stateOf.get(pass)
    state.panels.add(new WeakRef(folder))
    for (const control of folder.controllers || []) if (control.property === 'order') control.disable?.()
    for (const field of FIELDS) folder.add(pass.colorAdjustments, field, -100, 100, 1).name(labels[field])
      .onChange(value => setColorGradeSettings(pass, { [field]: value }, { autoEnable: true }))
    const reset = () => setColorGradeSettings(pass, COLOR_GRADE_DEFAULTS, { replace: true })
    if (typeof folder.addFn === 'function') folder.addFn(reset).name('恢复默认')
    else folder.add({ reset }, 'reset').name('恢复默认')
  },
}

export function registerPostProcessingColor(ThreeEditor) {
  if (!Array.isArray(ThreeEditor?.__EFFECTS__)) throw new TypeError('The editor must expose its effect descriptor registry')
  // Vite retains the core class and its registry across module reloads. Keep
  // the same registry slot, but new editors must install this module's pass.
  const index = ThreeEditor.__EFFECTS__.findIndex(effect => effect.name === COLOR_GRADE_PASS_NAME)
  if (index < 0) ThreeEditor.__EFFECTS__.push(COLOR_GRADE_EFFECT)
  else ThreeEditor.__EFFECTS__[index] = COLOR_GRADE_EFFECT
  return COLOR_GRADE_EFFECT
}

/** Install after new ThreeEditor(), before installNanjingRestore(). The core
 * skips missing pass fields on reset, so explicitly neutralize old snapshots.
 * Do not inject effectComposer into old params: that could change renderWay. */
export function installPostProcessingColorReset(editor) {
  if (resetInstallations.has(editor)) return resetInstallations.get(editor)
  if (!editor || typeof editor.resetEditorStorage !== 'function') throw new TypeError('A scene editor is required')
  const installedPass = editor.effectComposer?.effectPass?.[COLOR_GRADE_PASS_NAME]
  if (stateOf.has(installedPass)) stateOf.get(installedPass).composer = editor.effectComposer
  const originalReset = editor.resetEditorStorage
  function reset(params, ...args) {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return originalReset.call(this, params, ...args)
    const pass = this.effectComposer?.effectPass?.[COLOR_GRADE_PASS_NAME]
    // A still-live editor can own a pass from the preceding module generation.
    // Core records its owning descriptor on originInfo: let that descriptor
    // access its own WeakMap instead of adopting foreign instance state.
    const owner = stateOf.has(pass) ? COLOR_GRADE_EFFECT : pass?.originInfo
    const compatible = owner?.name === COLOR_GRADE_PASS_NAME && typeof owner.getStorage === 'function' && typeof owner.setStorage === 'function'
    const previous = compatible ? owner.getStorage(pass) : null
    if (compatible) owner.setStorage(pass, params.effectComposer?.[COLOR_GRADE_PASS_NAME])
    try { return originalReset.call(this, params, ...args) }
    catch (error) { if (compatible) owner.setStorage(pass, previous); throw error }
  }
  editor.resetEditorStorage = reset
  const installation = { reset }
  resetInstallations.set(editor, installation)
  return installation
}

// A matching CPU reference supports numeric tests and small interactive
// previews without needing to create a renderer or edit source materials.
export function gradeLinearRgba(rgba, settings) {
  const normalized = normalizeColorGradeSettings(settings), values = uniformsFor(normalized)
  if (!normalized.enabled || !values.active) return rgba.slice()
  let color = rgba.slice(0, 3).map((value, i) => ((value * values.brightness - .18) * values.contrast + .18) * values.whiteBalance[i])
  const luminance = color[0] * .2126 + color[1] * .7152 + color[2] * .0722
  color = color.map(value => Math.max(0, luminance + (value - luminance) * values.saturation))
  return [...color, rgba[3]]
}
