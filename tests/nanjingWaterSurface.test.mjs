import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, MeshPhysicalMaterial, BufferGeometry, BufferAttribute, Texture, ShaderLib, RepeatWrapping, LinearMipmapLinearFilter, NoColorSpace } from 'three'
import { createNanjingWaterSurface, createNanjingWaterRippleTexture, normalizeNanjingWaterSurface, patchNanjingWaterShader,
  NANJING_WATER_SURFACE_DEFAULTS, NANJING_NATURAL_WATER_DEFAULTS, NANJING_WATER_SURFACE_TARGET } from '../src/editor/nanjingWaterSurface.js'

function fixture({ shared = false, enabled = true } = {}) {
  const scene = new Scene(), root = new Group(), geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(409 * 3), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(409 * 3), 3))
  geometry.setIndex(new BufferAttribute(new Uint16Array(1023), 1))
  const source = new MeshPhysicalMaterial({ color: 0x49626c, metalness: .8, roughness: .355, specularColor: 0, ior: 1.5 })
  source.name = NANJING_WATER_SURFACE_TARGET.material
  const mesh = new Mesh(geometry, source); mesh.name = NANJING_WATER_SURFACE_TARGET.name
  root.add(mesh); root.RootMaterials = [source]; scene.add(root)
  let other
  if (shared) { other = new Mesh(geometry, source); other.name = 'unrelated'; root.add(other) }
  const config = enabled ? { waterSurface: { version: 1, enabled: true } } : {}
  const controller = createNanjingWaterSurface({ scene }, config)
  return { scene, root, geometry, source, mesh, other, config, controller }
}
function shader() { return { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader } }

test('old/unknown histories stay unchanged; config is bounded and explicitly versioned', () => {
  assert.deepEqual(normalizeNanjingWaterSurface(), NANJING_WATER_SURFACE_DEFAULTS)
  assert.equal(normalizeNanjingWaterSurface({ version: 2, enabled: true }).enabled, false)
  assert.throws(() => normalizeNanjingWaterSurface({ version: 1, rippleStrength: NaN }))
  assert.throws(() => normalizeNanjingWaterSurface({ version: 1, rippleScale: 0 }))
  assert.throws(() => normalizeNanjingWaterSurface({ version: 1, materialOverrides: { arbitrary: 1 } }))
  const f = fixture({ enabled: false })
  assert.equal(f.mesh.material, f.source); assert.equal(f.controller.getStatus().textureBytes, 0)
  assert.deepEqual(f.config, {})
  f.controller.update({ enabled: true }); assert.equal(f.controller.getStatus().active, true)
  f.controller.dispose()
})

test('exact target scope changes neither geometry, unrelated materials nor source values', () => {
  const f = fixture({ shared: true }), rendered = f.mesh.material, positions = f.geometry.attributes.position, index = f.geometry.index
  assert.notEqual(rendered, f.source); assert.equal(f.other.material, f.source)
  assert.equal(f.source.metalness, .8); assert.equal(f.source.roughness, .355)
  assert.deepEqual(f.source.specularColor.toArray(), [0, 0, 0])
  assert.equal(rendered.metalness, 0); assert.equal(rendered.ior, 1.333)
  assert.deepEqual(rendered.specularColor.toArray(), [1, 1, 1])
  assert.ok(rendered.color.equals(f.source.color)); assert.equal(rendered.normalMap, null)
  assert.equal(rendered.transparent, false); assert.equal(rendered.transmission, 0)
  assert.equal(f.mesh.geometry, f.geometry); assert.equal(f.geometry.attributes.position, positions); assert.equal(f.geometry.index, index)
  assert.equal(f.controller.getOriginalMaterial(rendered), f.source)
  assert.deepEqual(new Set(f.root.RootMaterials), new Set([rendered, f.source]))
  f.controller.refresh(); assert.equal(f.mesh.material, rendered)
  assert.equal(f.controller.getStatus().extraDrawCalls, 0); assert.equal(f.controller.getStatus().extraRenderPasses, 0)
  f.controller.dispose(); assert.equal(f.mesh.material, f.source); assert.deepEqual(f.root.RootMaterials, [f.source])
})

test('mismatched counts, duplicate names and helper subtrees are refused', () => {
  for (const kind of ['counts', 'duplicate', 'helper']) {
    const f = fixture({ enabled: false })
    if (kind === 'counts') f.mesh.geometry.setIndex([0, 1, 2])
    if (kind === 'duplicate') { const copy = f.mesh.clone(); f.root.add(copy) }
    if (kind === 'helper') f.root.userData.nanjingUtility = true
    f.controller.update({ enabled: true })
    assert.equal(f.controller.getStatus().active, false, kind)
    assert.equal(f.mesh.material, f.source, kind); assert.equal(f.controller.getStatus().skipped.length, 1)
    f.controller.dispose()
  }
})

test('source and rendered material edits survive refresh and serialization', () => {
  const f = fixture(), rendered = f.mesh.material, userNormal = new Texture()
  rendered.roughness = .44; rendered.color.setHex(0x416966); rendered.normalMap = userNormal
  rendered.specularColor.setRGB(.9, .8, .7)
  f.controller.syncMaterialEdits()
  assert.equal(f.source.roughness, .44); assert.equal(f.source.normalMap, userNormal)
  assert.ok(f.source.color.equals(rendered.color))
  assert.deepEqual(f.config.waterSurface.materialOverrides.specularColor, [.9, .8, .7])
  f.source.roughness = .38; rendered.roughness = .18
  f.controller.refresh(); assert.equal(rendered.roughness, .38)
  const saved = f.controller.withOriginals(() => {
    assert.equal(f.mesh.material, f.source); assert.deepEqual(f.root.RootMaterials, [f.source])
    assert.equal(f.mesh.material.normalMap, userNormal)
    return JSON.parse(JSON.stringify(f.config.waterSurface))
  })
  assert.equal(f.mesh.material, rendered); assert.deepEqual(f.root.RootMaterials, [rendered])
  f.controller.dispose()
  const reopened = createNanjingWaterSurface({ scene: f.scene }, { waterSurface: saved })
  assert.equal(f.mesh.material.roughness, .38); assert.equal(f.mesh.material.normalMap, userNormal)
  assert.deepEqual(f.mesh.material.specularColor.toArray(), [.9, .8, .7])
  reopened.dispose()
})

test('sync and async save failures restore displayed material; pending updates are applied once', async () => {
  const f = fixture(), rendered = f.mesh.material
  assert.throws(() => f.controller.withOriginals(() => { throw new Error('save failed') }), /save failed/)
  assert.equal(f.mesh.material, rendered)
  await assert.rejects(f.controller.withOriginals(async () => {
    assert.equal(f.mesh.material, f.source)
    await f.controller.withOriginals(async () => { assert.equal(f.mesh.material, f.source) })
    f.controller.update({ roughness: .31 })
    assert.equal(f.mesh.material, f.source)
    throw new Error('async failed')
  }), /async failed/)
  assert.equal(f.mesh.material, rendered); assert.equal(rendered.roughness, .31)
  f.controller.dispose()
})

test('a source edit inside save persists and disable restores original references', () => {
  const f = fixture()
  f.controller.withOriginals(() => { f.source.envMapIntensity = .48 })
  assert.equal(f.mesh.material.envMapIntensity, .48)
  f.controller.update({ enabled: false })
  assert.equal(f.mesh.material, f.source); assert.deepEqual(f.root.RootMaterials, [f.source])
  assert.equal(f.source.metalness, .8); assert.equal(f.source.envMapIntensity, .48)
  f.controller.dispose()
})

test('shader chains original hook; no UV dependency; two filtered samples and no geometry displacement', () => {
  const f = fixture(); let sourceCalls = 0
  f.source.onBeforeCompile = s => { sourceCalls++; s.uniforms.externalHook = { value: 1 } }
  const s = shader(); f.mesh.material.onBeforeCompile(s)
  assert.equal(sourceCalls, 1); assert.equal(s.uniforms.externalHook.value, 1)
  assert.ok(s.vertexShader.includes('modelMatrix * vec4( transformed, 1.0 )'))
  assert.ok(s.vertexShader.includes('#include <project_vertex>'))
  assert.equal((s.fragmentShader.match(/texture2D\( nanjingWaterRipples/g) || []).length, 2)
  assert.ok(s.fragmentShader.includes('#include <normal_fragment_maps>'))
  assert.ok(!s.fragmentShader.includes('vUv')); assert.ok(!s.vertexShader.includes('transformed +='))
  const texture = s.uniforms.nanjingWaterRipples.value
  f.controller.update({ rippleScale: 1.1, rippleStrength: .12 })
  assert.equal(s.uniforms.nanjingWaterRippleScale.value, 1.1)
  assert.equal(s.uniforms.nanjingWaterRippleStrength.value, .12)
  const second = shader(); f.mesh.material.onBeforeCompile(second)
  assert.equal(second.uniforms.nanjingWaterRipples.value, texture)
  let disposed = 0; texture.addEventListener('dispose', () => disposed++)
  f.controller.dispose(); f.controller.dispose(); assert.equal(disposed, 1)
})

test('shader patch is idempotent and unsupported shaders fail without partial changes', () => {
  const s = shader(), uniforms = { nanjingWaterRipples: { value: null } }
  assert.equal(patchNanjingWaterShader(s, uniforms), true)
  const fragment = s.fragmentShader
  assert.equal(patchNanjingWaterShader(s, uniforms), true); assert.equal(s.fragmentShader, fragment)
  const bad = { uniforms: {}, vertexShader: '#include <common>', fragmentShader: '#include <common>' }
  assert.equal(patchNanjingWaterShader(bad, uniforms), false)
  assert.equal(bad.vertexShader, '#include <common>'); assert.deepEqual(bad.uniforms, {})
})

test('ripple texture is deterministic, compact, filterable and directionally varied', () => {
  const a = createNanjingWaterRippleTexture(), b = createNanjingWaterRippleTexture()
  assert.equal(a.image.data.byteLength, 256 * 256 * 4); assert.deepEqual(a.image.data, b.image.data)
  assert.equal(a.wrapS, RepeatWrapping); assert.equal(a.wrapT, RepeatWrapping)
  assert.equal(a.minFilter, LinearMipmapLinearFilter); assert.equal(a.generateMipmaps, true); assert.equal(a.colorSpace, NoColorSpace)
  let xMin = 255, xMax = 0, yMin = 255, yMax = 0
  for (let i = 0; i < a.image.data.length; i += 4) {
    xMin = Math.min(xMin, a.image.data[i]); xMax = Math.max(xMax, a.image.data[i])
    yMin = Math.min(yMin, a.image.data[i + 1]); yMax = Math.max(yMax, a.image.data[i + 1])
    assert.equal(a.image.data[i + 3], 255)
  }
  assert.ok(xMin < 100 && xMax > 155 && yMin < 110 && yMax > 145)
  assert.throws(() => createNanjingWaterRippleTexture(300))
  a.dispose(); b.dispose()
})

test('disposing during an async save leaves editable originals attached', async () => {
  const f = fixture()
  await f.controller.withOriginals(async () => {
    f.controller.dispose()
    await Promise.resolve()
  })
  assert.equal(f.mesh.material, f.source); assert.deepEqual(f.root.RootMaterials, [f.source])
  assert.equal(f.controller.getStatus().active, false)
})

test('natural water is opt-in, survives a save/reopen and replaces its texture without leaks', () => {
  assert.deepEqual(normalizeNanjingWaterSurface({ version: 1, style: 'natural-v2' }), NANJING_NATURAL_WATER_DEFAULTS)
  assert.throws(() => normalizeNanjingWaterSurface({ version: 1, style: 'unknown' }))
  const f = fixture(), oldShader = shader()
  f.mesh.material.onBeforeCompile(oldShader)
  const oldTexture = oldShader.uniforms.nanjingWaterRipples.value
  let oldDisposals = 0; oldTexture.addEventListener('dispose', () => oldDisposals++)
  f.controller.update({ ...NANJING_NATURAL_WATER_DEFAULTS, enabled: true })
  const naturalShader = shader(); f.mesh.material.onBeforeCompile(naturalShader)
  const newTexture = naturalShader.uniforms.nanjingWaterRipples.value
  assert.notEqual(newTexture, oldTexture); assert.equal(oldDisposals, 1)
  assert.equal(newTexture.name, '南京水面_自然细涟漪_v2')
  assert.equal(f.mesh.material.roughness, .34); assert.equal(f.mesh.material.envMapIntensity, .45)
  const saved = f.controller.withOriginals(() => structuredClone(f.config))
  f.controller.dispose()
  const reopened = createNanjingWaterSurface({ scene: f.scene }, saved)
  assert.equal(reopened.getStatus().active, true)
  assert.equal(reopened.getStatus().settings.style, 'natural-v2')
  assert.equal(reopened.getStatus().settings.rippleStrength, .12)
  assert.equal(f.mesh.material.roughness, .34)
  reopened.dispose()
})

test('natural ripple field is repeatable with wrap boundaries comparable to interior gradients', () => {
  const a = createNanjingWaterRippleTexture(256, 'natural-v2'), b = createNanjingWaterRippleTexture(256, 'natural-v2')
  assert.deepEqual(a.image.data, b.image.data)
  const data = a.image.data, size = a.image.width
  let interior = 0, seam = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let channel = 0; channel < 2; channel++) {
    const i = (y * size + x) * 4 + channel
    const dx = Math.abs(data[i] - data[(y * size + (x + 1) % size) * 4 + channel])
    const dy = Math.abs(data[i] - data[(((y + 1) % size) * size + x) * 4 + channel])
    if (x === size - 1) seam += dx; else interior += dx
    if (y === size - 1) seam += dy; else interior += dy
  }
  const interiorMean = interior / (size * (size - 1) * 4), seamMean = seam / (size * 4)
  assert.ok(interiorMean > .5, 'water normals contain visible variations')
  assert.ok(seamMean < interiorMean * 1.5, 'wrapping does not create a repeating seam')
  assert.equal(a.generateMipmaps, true); assert.equal(a.colorSpace, NoColorSpace)
  a.dispose(); b.dispose()
})
