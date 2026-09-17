import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, MeshPhysicalMaterial, BufferGeometry, BufferAttribute, ShaderLib } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createNanjingWaterSurface } from '../src/editor/nanjingWaterSurface.js'
import { createNanjingPreviewMetadata, createPreviewWaterSurface, NANJING_PREVIEW_METADATA_KEY } from '../src/editor/previewWaterSurface.js'
import { cloneSourceSceneForExport, exportSourceSceneGlb } from '../src/editor/sourceSceneExport.js'

function fixture() {
  const model = new Group(), geometry = new BufferGeometry()
  const position = new Float32Array(409 * 3), normal = new Float32Array(409 * 3)
  for (let i = 0; i < 409; i++) { position[i * 3] = i % 20; position[i * 3 + 2] = Math.floor(i / 20); normal[i * 3 + 1] = 1 }
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  geometry.setIndex(new BufferAttribute(Uint16Array.from({ length: 1023 }, (_, i) => i % 409), 1))
  const source = new MeshPhysicalMaterial({ color: 0x49626c, metalness: .8, roughness: .355, specularColor: 0 })
  source.name = '远景_浅蓝水面'
  const mesh = new Mesh(geometry, source); mesh.name = '远景_休闲区域'
  model.add(mesh)
  return { model, mesh, source, geometry }
}
const enabled = { version: 1, enabled: true, rippleStrength: .31 }
const json = waterSurface => ({ nanjingRestore: { config: { waterSurface } } })

test('natural-v2 water survives export metadata and the separate preview', () => {
  const root = new Group(), f = fixture(), preview = createPreviewWaterSurface(root)
  f.model.userData[NANJING_PREVIEW_METADATA_KEY] = createNanjingPreviewMetadata({ waterSurface: { version: 1, enabled: true, style: 'natural-v2' } })
  root.add(f.model); preview.addModel(f.model)
  assert.equal(preview.getStatus().active, true)
  assert.equal(f.mesh.material.roughness, .34)
  assert.equal(f.mesh.material.envMapIntensity, .45)
  const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader }
  f.mesh.material.onBeforeCompile(shader)
  assert.equal(shader.uniforms.nanjingWaterRipples.value.name, '南京水面_自然细涟漪_v2')
  preview.dispose()
})
function attachMetadata(model, settings = enabled) {
  model.userData[NANJING_PREVIEW_METADATA_KEY] = { version: 1, waterSurface: settings }
}

test('unversioned archives remain unchanged; export metadata requires explicitly enabled known settings', () => {
  for (const config of [undefined, {}, { waterSurface: { enabled: true } }, { waterSurface: { version: 2, enabled: true } }, { waterSurface: { version: 1, enabled: false } }, { waterSurface: { ...enabled, rippleScale: -1 } }]) {
    assert.equal(createNanjingPreviewMetadata(config), null)
  }
  const root = new Group(), f = fixture(), preview = createPreviewWaterSurface(root)
  root.add(f.model); preview.addModel(f.model)
  assert.equal(preview.getStatus().active, false); assert.equal(f.mesh.material, f.source)
  attachMetadata(f.model); f.model.userData[NANJING_PREVIEW_METADATA_KEY].version = 2
  preview.refresh(); assert.equal(f.mesh.material, f.source)
  preview.dispose()
})

test('JSON water settings activate deferred models after attachment and preserve exact mesh scope', () => {
  const root = new Group(), f = fixture(), unrelated = new Mesh(f.geometry, f.source)
  unrelated.name = '另一块面'; f.model.add(unrelated)
  const preview = createPreviewWaterSurface(root)
  preview.setJsonConfig(json(enabled)); preview.addModel(f.model)
  assert.equal(preview.getStatus().active, false)
  root.add(f.model); preview.refresh()
  assert.equal(preview.getStatus().materials, 1)
  assert.notEqual(f.mesh.material, f.source); assert.equal(unrelated.material, f.source)
  assert.equal(f.mesh.material.roughness, .27); assert.equal(f.source.roughness, .355)
  assert.equal(f.mesh.geometry, f.geometry)
  preview.dispose(); assert.equal(f.mesh.material, f.source)
})

test('explicit JSON disabled/unknown settings win over GLB metadata and do not mutate it', () => {
  const root = new Group(), f = fixture(), preview = createPreviewWaterSurface(root)
  attachMetadata(f.model); const metadata = structuredClone(f.model.userData)
  root.add(f.model); preview.addModel(f.model)
  assert.equal(preview.getStatus().active, true)
  for (const settings of [{ version: 1, enabled: false }, { version: 2, enabled: true }, null, { ...enabled, rippleStrength: NaN }]) {
    preview.setJsonConfig(json(settings))
    assert.equal(preview.getStatus().active, false); assert.equal(f.mesh.material, f.source)
  }
  preview.setJsonConfig({ nanjingRestore: { config: {} } })
  assert.equal(preview.getStatus().active, true)
  assert.deepEqual(f.model.userData, metadata)
  preview.dispose()
})

test('metadata stays scoped to each imported model; unrelated archival models are not upgraded', () => {
  const root = new Group(), a = fixture(), b = fixture(), preview = createPreviewWaterSurface(root)
  attachMetadata(a.model); root.add(a.model, b.model)
  preview.addModel(a.model); preview.addModel(b.model)
  assert.notEqual(a.mesh.material, a.source); assert.equal(b.mesh.material, b.source)
  root.remove(a.model); preview.refresh()
  assert.equal(a.mesh.material, a.source); assert.equal(preview.getStatus().active, false)
  preview.dispose()
})

test('clear releases water material/texture before source disposal and resets JSON precedence', () => {
  const root = new Group(), f = fixture(), preview = createPreviewWaterSurface(root)
  root.add(f.model); preview.setJsonConfig(json(enabled)); preview.addModel(f.model)
  const display = f.mesh.material, shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader }
  display.onBeforeCompile(shader)
  let materialDisposals = 0, textureDisposals = 0, sourceDisposals = 0
  display.addEventListener('dispose', () => materialDisposals++)
  shader.uniforms.nanjingWaterRipples.value.addEventListener('dispose', () => textureDisposals++)
  f.source.addEventListener('dispose', () => sourceDisposals++)
  preview.clear()
  assert.equal(f.model.parent, root); assert.equal(f.mesh.material, f.source)
  assert.equal(materialDisposals, 1); assert.equal(textureDisposals, 1); assert.equal(sourceDisposals, 0)
  preview.clear(); assert.equal(materialDisposals, 1)
  root.remove(f.model)
  const next = fixture(); root.add(next.model); preview.addModel(next.model)
  assert.equal(preview.getStatus().active, false); assert.equal(next.mesh.material, next.source)
  preview.dispose()
})

test('source clone adds only enabled preview settings without mutating the source scene', () => {
  const scene = new Scene(), f = fixture(), config = { waterSurface: { ...enabled } }
  scene.userData.original = true; scene.add(f.model)
  const editor = { scene, nanjingRestore: { getConfig: () => config } }
  const water = createNanjingWaterSurface(editor, config)
  editor.withNanjingSourceScene = callback => water.withOriginals(callback)
  const cloned = cloneSourceSceneForExport(editor), copied = cloned.getObjectByName(f.mesh.name)
  assert.equal(copied.material, f.source); assert.equal(copied.geometry, f.geometry)
  assert.equal(cloned.userData[NANJING_PREVIEW_METADATA_KEY].waterSurface.rippleStrength, .31)
  assert.deepEqual(scene.userData, { original: true }); assert.notEqual(f.mesh.material, f.source)
  cloned.userData[NANJING_PREVIEW_METADATA_KEY].waterSurface.rippleStrength = .7
  assert.equal(config.waterSurface.rippleStrength, .31)
  water.update({ enabled: false })
  assert.equal(cloneSourceSceneForExport(editor).userData[NANJING_PREVIEW_METADATA_KEY], undefined)
  water.dispose()
})

test('real GLB roundtrip carries scene extras and reconstructs water on the original source material', async () => {
  const previousReader = globalThis.FileReader
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() }) }
  }
  const scene = new Scene(), f = fixture(), config = { waterSurface: { ...enabled } }
  scene.add(f.model)
  const editor = { scene, nanjingRestore: { getConfig: () => config } }, water = createNanjingWaterSurface(editor, config)
  editor.withNanjingSourceScene = callback => water.withOriginals(callback)
  let preview
  try {
    const { data } = await exportSourceSceneGlb(editor)
    const loaded = await new GLTFLoader().parseAsync(data, '')
    const imported = loaded.scene.getObjectByName(f.mesh.name), original = imported.material
    assert.equal(original.metalness, .8); assert.deepEqual(original.specularColor.toArray(), [0, 0, 0])
    assert.equal(imported.geometry.attributes.position.count, 409); assert.equal(imported.geometry.index.count, 1023)
    assert.equal(loaded.scene.userData[NANJING_PREVIEW_METADATA_KEY].version, 1)
    const root = new Group(); root.add(loaded.scene); preview = createPreviewWaterSurface(root)
    preview.addModel(loaded.scene)
    assert.equal(preview.getStatus().active, true); assert.equal(imported.material.metalness, 0)
    const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader }
    imported.material.onBeforeCompile(shader)
    assert.equal(shader.uniforms.nanjingWaterRippleStrength.value, .31)
    assert.equal(shader.uniforms.nanjingWaterRipples.value.image.width, 256)
    preview.clear(); assert.equal(imported.material, original)
  } finally {
    preview?.dispose(); water.dispose()
    if (previousReader === undefined) delete globalThis.FileReader
    else globalThis.FileReader = previousReader
  }
})
