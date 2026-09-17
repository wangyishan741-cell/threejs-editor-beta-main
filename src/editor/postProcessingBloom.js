import { Color, FloatType, NearestFilter, NoBlending, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export const BLOOM_NAME = 'unrealBloomPass'
export const BLOOM_ORDER = 1000
export const BLOOM_MAX_AREA = 1
export const BLOOM_DEFAULTS = Object.freeze({ enabled: false, strength: 1.5, radius: .4, threshold: .85, haloSize: 1, maxAreaRatio: .10 })
const MAX_TILES = 512
const installations = new WeakMap()
const fields = { strength: [0, 3], radius: [0, 1], threshold: [0, 1], haloSize: [.1, 3] }
const vertexShader = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
// Integer-valued scores are exactly representable in a Float32 render target.
// The initial reduction and final blend use the same sampling and quantization.
const scoreGLSL = `float bloomScore(vec3 c) {
  return ceil(clamp(dot(max(c,vec3(0.0)),vec3(0.2126,0.7152,0.0722)),0.0,64.0)*65536.0);
}`

export function normalizeBloomSettings(value = {}) {
  const result = { enabled: value?.enabled === true, maxAreaRatio: normalizeAreaRatio(value?.maxAreaRatio) }
  for (const [key, [min, max]] of Object.entries(fields)) {
    const v = Number.isFinite(value?.[key]) ? value[key] : BLOOM_DEFAULTS[key]
    result[key] = Math.round(Math.max(min, Math.min(max, v)) * 100) / 100
  }
  return result
}

function normalizeAreaRatio(value) {
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(BLOOM_MAX_AREA, value)) * 10000) / 10000 : .10
}
function coveragePixels(width, height, ratio) {
  // Integer basis points avoid a 4.62% slider acquiring floating point noise.
  return Math.floor(width * height * Math.round(normalizeAreaRatio(ratio) * 10000) / 10000)
}
export function bloomCoverageLayout(width, height, maxAreaRatio = BLOOM_DEFAULTS.maxAreaRatio) {
  width = Math.max(1, Math.floor(width)); height = Math.max(1, Math.floor(height))
  let w = width, h = height, span = 1
  const levels = []
  do {
    w = Math.ceil(w / 2); h = Math.ceil(h / 2); span *= 2
    levels.push({ width: w, height: h })
  } while (w * h > MAX_TILES)
  const tileArea = Math.min(span, width) * Math.min(span, height)
  const pixelBudget = coveragePixels(width, height, maxAreaRatio)
  return { width, height, levels, span, tileArea, pixelBudget,
    allowedTiles: normalizeAreaRatio(maxAreaRatio) === 1 ? w * h : Math.floor(pixelBudget / tileArea) }
}

function shader(uniforms, fragmentShader) {
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false,
    blending: NoBlending, toneMapped: false })
}
function target(width, height) {
  const rt = new WebGLRenderTarget(width, height, { type: FloatType, minFilter: NearestFilter,
    magFilter: NearestFilter, depthBuffer: false, stencilBuffer: false })
  rt.texture.generateMipmaps = false
  return rt
}

/** Final display-space bloom. Limiting after every spatial filter prevents
 * downstream AA from spreading a capped halo outside its screen budget.
 * No CPU/GPU readback; a conservative maximum pyramid bounds every pixel. */
export class ScreenBudgetBloomPass extends UnrealBloomPass {
  constructor({ DOM } = {}) {
    super(new Vector2(Math.max(1, DOM?.clientWidth || 1), Math.max(1, DOM?.clientHeight || 1)), 1.5, .4, .85)
    this.name = BLOOM_NAME; this.order = BLOOM_ORDER; this.enabled = false; this.needsSwap = true
    this.haloSize = 1; this.DOM = DOM; this.coverageTargets = []; this.disposed = false
    let areaRatio = BLOOM_DEFAULTS.maxAreaRatio
    Object.defineProperty(this, 'maxAreaRatio', { get: () => areaRatio, set: value => { areaRatio = normalizeAreaRatio(value) } })
    this.cutoffTarget = target(1, 1)
    this.reductionMaterial = shader({ source: { value: null }, sourceSize: { value: new Vector2() },
      firstLevel: { value: false } }, `uniform sampler2D source;
uniform vec2 sourceSize; uniform bool firstLevel; ${scoreGLSL}
void main(){
  vec2 base=floor(gl_FragCoord.xy)*2.0; float maximum=0.0;
  for(int y=0;y<2;y++) for(int x=0;x<2;x++) {
    vec2 pixel=min(base+vec2(float(x),float(y)),sourceSize-1.0);
    vec4 value=texture2D(source,(pixel+0.5)/sourceSize);
    maximum=max(maximum,firstLevel ? bloomScore(value.rgb) : value.r);
  }
  gl_FragColor=vec4(maximum,0.0,0.0,1.0);
}`)
    this.cutoffMaterial = shader({ source: { value: null }, gridSize: { value: new Vector2() },
      allowedTiles: { value: 0 } }, `uniform sampler2D source;
uniform vec2 gridSize; uniform float allowedTiles;
float sampleTile(int i){return texture2D(source,(vec2(mod(float(i),gridSize.x),floor(float(i)/gridSize.x))+0.5)/gridSize).r;}
void main(){
  int count=int(gridSize.x*gridSize.y); float hi=0.0;
  for(int i=0;i<${MAX_TILES};i++){if(i>=count)break;hi=max(hi,sampleTile(i));}
  float lo=0.0;
  // hi always has an admissible count (initially zero); returning ceil(hi)
  // can only exclude more pixels. Equal scores are never arbitrarily split.
  for(int j=0;j<16;j++){
    float mid=(lo+hi)*0.5; float litTiles=0.0;
    for(int i=0;i<${MAX_TILES};i++){if(i>=count)break;if(sampleTile(i)>mid)litTiles+=1.0;}
    if(litTiles<=allowedTiles)hi=mid;else lo=mid;
  }
  gl_FragColor=vec4(ceil(hi),0.0,0.0,1.0);
}`)
    this.finalMaterial = shader({ sceneTexture: { value: null }, bloomTexture: { value: null },
      cutoff: { value: this.cutoffTarget.texture }, outputSize: { value: new Vector2() },
      bloomAvailable: { value: false } }, `uniform sampler2D sceneTexture,bloomTexture,cutoff;
uniform vec2 outputSize; uniform bool bloomAvailable; ${scoreGLSL}
void main(){
  vec2 uv=gl_FragCoord.xy/outputSize;
  vec4 base=texture2D(sceneTexture,uv);
  if(!bloomAvailable){gl_FragColor=base;return;}
  vec3 glow=max(texture2D(bloomTexture,uv).rgb,vec3(0.0));
  float threshold=texture2D(cutoff,vec2(0.5)).r;
  float score=bloomScore(glow);
  float mask=score>threshold ? smoothstep(threshold,threshold+max(1.0,threshold*0.08),score) : 0.0;
  gl_FragColor=vec4(base.rgb+glow*mask,base.a);
}`)
    this._savedClear = new Color(); this._outputSize = new Vector2()
    this.setSize(DOM?.clientWidth || 1, DOM?.clientHeight || 1)
  }

  setSize(width, height) {
    if (this.layout?.width === Math.max(1, Math.floor(width)) && this.layout?.height === Math.max(1, Math.floor(height))) {
      this.layout.pixelBudget = coveragePixels(this.layout.width, this.layout.height, this.maxAreaRatio)
      const grid = this.layout.levels.at(-1)
      this.layout.allowedTiles = this.maxAreaRatio === 1 ? grid.width * grid.height : Math.floor(this.layout.pixelBudget / this.layout.tileArea)
      return
    }
    const layout = bloomCoverageLayout(width, height, this.maxAreaRatio)
    if (this.layout?.width === layout.width && this.layout?.height === layout.height) return
    this.layout = layout
    super.setSize(layout.width, layout.height)
    // UnrealBloom's 5-mip chain rounds tiny levels down to zero; keep all valid.
    for (const rt of [...this.renderTargetsHorizontal, ...this.renderTargetsVertical, this.renderTargetBright]) {
      rt.setSize(Math.max(1, rt.width), Math.max(1, rt.height))
    }
    for (const rt of this.coverageTargets || []) rt.dispose()
    this.coverageTargets = layout.levels.map(level => target(level.width, level.height))
    this.finalMaterial?.uniforms.outputSize.value.set(layout.width, layout.height)
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    if (this.disposed) return
    const size = this.renderToScreen ? renderer.getDrawingBufferSize(this._outputSize)
      : this._outputSize.set(writeBuffer.width, writeBuffer.height)
    this.setSize(size.x, size.y)
    const oldTarget = renderer.getRenderTarget(), autoClear = renderer.autoClear
    renderer.getClearColor(this._savedClear); const alpha = renderer.getClearAlpha()
    const canBloom = renderer.capabilities.isWebGL2 !== false && renderer.extensions.has('EXT_color_buffer_float')
      && this.layout.allowedTiles > 0 && this.strength > 0
    const draw = (material, destination) => {
      this._fsQuad.material = material; renderer.setRenderTarget(destination); this._fsQuad.render(renderer)
    }
    try {
      renderer.autoClear = false
      if (maskActive) renderer.state.buffers.stencil.setTest(false)
      if (canBloom) {
        this.highPassUniforms.tDiffuse.value = readBuffer.texture
        this.highPassUniforms.luminosityThreshold.value = this.threshold
        draw(this.materialHighPassFilter, this.renderTargetBright)
        let input = this.renderTargetBright
        for (let i = 0; i < this.nMips; i++) {
          const material = this.separableBlurMaterials[i], horizontal = this.renderTargetsHorizontal[i], vertical = this.renderTargetsVertical[i]
          material.uniforms.invSize.value.set(this.haloSize / horizontal.width, this.haloSize / horizontal.height)
          material.uniforms.colorTexture.value = input.texture
          material.uniforms.direction.value = UnrealBloomPass.BlurDirectionX
          draw(material, horizontal)
          material.uniforms.colorTexture.value = horizontal.texture
          material.uniforms.direction.value = UnrealBloomPass.BlurDirectionY
          draw(material, vertical); input = vertical
        }
        this.compositeMaterial.uniforms.bloomStrength.value = this.strength
        this.compositeMaterial.uniforms.bloomRadius.value = this.radius
        this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors
        draw(this.compositeMaterial, this.renderTargetsHorizontal[0])
        let source = this.renderTargetsHorizontal[0].texture
        let width = this.layout.width, height = this.layout.height
        for (let i = 0; i < this.coverageTargets.length; i++) {
          const rt = this.coverageTargets[i], u = this.reductionMaterial.uniforms
          u.source.value = source; u.sourceSize.value.set(width, height); u.firstLevel.value = i === 0
          draw(this.reductionMaterial, rt)
          source = rt.texture; width = rt.width; height = rt.height
        }
        const u = this.cutoffMaterial.uniforms
        u.source.value = source; u.gridSize.value.set(width, height); u.allowedTiles.value = this.layout.allowedTiles
        draw(this.cutoffMaterial, this.cutoffTarget)
      }
      if (maskActive) renderer.state.buffers.stencil.setTest(true)
      this.finalMaterial.uniforms.sceneTexture.value = readBuffer.texture
      this.finalMaterial.uniforms.bloomTexture.value = this.renderTargetsHorizontal[0].texture
      this.finalMaterial.uniforms.bloomAvailable.value = canBloom
      draw(this.finalMaterial, this.renderToScreen ? null : writeBuffer)
    } finally {
      renderer.setRenderTarget(oldTarget); renderer.setClearColor(this._savedClear, alpha); renderer.autoClear = autoClear
      if (maskActive) renderer.state.buffers.stencil.setTest(true)
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const rt of this.coverageTargets) rt.dispose()
    this.coverageTargets = []; this.cutoffTarget.dispose()
    this.reductionMaterial.dispose(); this.cutoffMaterial.dispose(); this.finalMaterial.dispose()
    super.dispose()
  }
}

function wake(pass) {
  const EventClass = pass.DOM?.ownerDocument?.defaultView?.Event
  if (EventClass) pass.DOM.dispatchEvent(new EventClass('change', { bubbles: true }))
}
export const BLOOM_EFFECT = {
  name: BLOOM_NAME, label: '泛光', order: BLOOM_ORDER,
  install: options => new ScreenBudgetBloomPass(options),
  getStorage: pass => normalizeBloomSettings(pass),
  setStorage(pass, value) { Object.assign(pass, normalizeBloomSettings(value)); pass.order = BLOOM_ORDER },
  createPanel(pass, folder) {
    for (const control of folder.controllers || []) if (control.property === 'order') control.disable?.()
    const labels = { strength: '泛光强度', radius: '泛光半径', threshold: '泛光阈值', haloSize: '光晕尺寸' }
    for (const [key, [min, max]] of Object.entries(fields)) {
      const control = folder.add(pass, key, min, max, .01).step(.01).name(labels[key])
      control.decimals?.(2)
      control.onChange(value => {
        pass[key] = normalizeBloomSettings({ [key]: value })[key]; control.updateDisplay?.(); wake(pass)
      })
    }
    const area = { get percent() { return pass.maxAreaRatio * 100 }, set percent(value) { pass.maxAreaRatio = value / 100 } }
    const areaControl = folder.add(area, 'percent', 0, BLOOM_MAX_AREA * 100, .01).step(.01).name('泛光面积上限（%）')
    areaControl.decimals?.(2)
    areaControl.onChange(() => { areaControl.updateDisplay?.(); wake(pass) })
  },
}

export function registerPostProcessingBloom(ThreeEditor) {
  if (!Array.isArray(ThreeEditor?.__EFFECTS__)) throw new TypeError('Effect registry is required')
  const index = ThreeEditor.__EFFECTS__.findIndex(effect => effect.name === BLOOM_NAME)
  if (index < 0) ThreeEditor.__EFFECTS__.push(BLOOM_EFFECT)
  else ThreeEditor.__EFFECTS__[index] = BLOOM_EFFECT
}

export function installPostProcessingBloom(editor) {
  if (installations.has(editor)) return installations.get(editor)
  const composer = editor.effectComposer, pass = composer?.effectPass?.[BLOOM_NAME]
  if (!pass || pass.name !== BLOOM_NAME || !pass.finalMaterial) throw new TypeError('Budget bloom must be registered before creating the editor')
  function last() {
    const index = composer.passes.indexOf(pass)
    if (index >= 0 && index !== composer.passes.length - 1) { composer.passes.splice(index, 1); composer.passes.push(pass) }
  }
  // Include later pass additions and every explicit reorder. The core's bound
  // effectUpdate refers to render, so do not depend on replacing render itself.
  for (const key of ['refreshPassSort', 'addPass', 'insertPass']) {
    const original = composer[key]
    if (typeof original === 'function') composer[key] = function (...args) { const result = original.apply(this, args); last(); return result }
  }
  const originalReset = editor.resetEditorStorage
  editor.resetEditorStorage = function (params, ...args) {
    const owner = pass.originInfo || BLOOM_EFFECT, previous = owner.getStorage(pass)
    owner.setStorage(pass, params?.effectComposer?.[BLOOM_NAME])
    try { const result = originalReset.call(this, params, ...args); last(); return result }
    catch (error) { owner.setStorage(pass, previous); last(); throw error }
  }
  last()
  const installation = { pass }; installations.set(editor, installation)
  return installation
}
