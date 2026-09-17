import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, PlaneGeometry, MeshStandardMaterial, Texture, RepeatWrapping, SRGBColorSpace } from 'three'
import { captureNanjingProjectSnapshot, restoreNanjingProjectSnapshot } from '../src/editor/nanjingProjectSnapshot.js'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
function editorWithTexture(texture) {
  const scene = new Scene(), root = new Group()
  root.editorType = 'isModelGroup'; root.name = '模型集合'; root.modelInfo = { url: '/test.glb' }
  const material = new MeshStandardMaterial({ map: texture }); material.name = '建筑_外墙'
  root.add(new Mesh(new PlaneGeometry(), material)); root.RootMaterials = [material]; scene.add(root)
  return { scene, root, material }
}
function selectedTexture() {
  const texture = new Texture({ width: 2, height: 2, source: 'selected-image' })
  texture.name = '新墙面.png'; texture.textureUrl = DATA_URL; texture.textureType = 'image'
  texture.flipY = false; texture.channel = 1; texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping; texture.wrapT = RepeatWrapping
  texture.repeat.set(2.8, 7.4); texture.offset.set(.2, -.3); texture.center.set(.5, .5)
  texture.rotation = .4; texture.updateMatrix()
  return texture
}

test('data URI base-color replacements retain name, orientation and UV transforms after JSON save/reload', async () => {
  const chosen = selectedTexture(), first = editorWithTexture(chosen)
  const saved = JSON.parse(JSON.stringify(captureNanjingProjectSnapshot(first)))
  const descriptor = saved.models[0].materials[0].textures.map
  assert.equal(descriptor.name, '新墙面.png'); assert.equal(descriptor.url, DATA_URL)
  assert.equal(descriptor.flipY, false); assert.equal(descriptor.channel, 1)
  const original = new Texture({ source: 'original-glb-image' }); original.name = 'image5'
  const second = editorWithTexture(original)
  const loaded = new Texture({ source: 'loaded-data-uri' }), calls = []
  const result = await restoreNanjingProjectSnapshot(second, saved, { loader: async url => { calls.push(url); return loaded } })
  assert.equal(result.restored, true); assert.deepEqual(calls, [DATA_URL])
  const restored = second.material.map
  assert.notEqual(restored, original); assert.equal(restored.source, loaded.source)
  assert.equal(restored.name, '新墙面.png'); assert.equal(restored.textureUrl, DATA_URL); assert.equal(restored.textureType, 'image')
  assert.equal(restored.flipY, false); assert.equal(restored.channel, 1); assert.equal(restored.colorSpace, SRGBColorSpace)
  for (const field of ['repeat', 'offset', 'center', 'matrix']) assert.deepEqual(restored[field].toArray(), chosen[field].toArray())
  assert.equal(original.name, 'image5'); assert.equal(original.image.source, 'original-glb-image')
  assert.deepEqual(captureNanjingProjectSnapshot(second).models[0].materials[0].textures.map, descriptor)
})

test('untouched embedded GLB images remain source references without duplicating their pixels', async () => {
  const texture = new Texture({ source: 'embedded-image-bitmap' }); texture.name = '木纹贴图'
  const editor = editorWithTexture(texture), snapshot = captureNanjingProjectSnapshot(editor)
  assert.equal(snapshot.models[0].materials[0].textures.map.url, undefined)
  await restoreNanjingProjectSnapshot(editor, snapshot, { loader: async () => { throw new Error('embedded image must not fetch') } })
  assert.equal(editor.material.map.name, '木纹贴图'); assert.equal(editor.material.map.source, texture.source)
})

test('old snapshots without texture names keep their existing GLB texture name', async () => {
  const texture = new Texture({ source: 'embedded' }); texture.name = '原图'
  const editor = editorWithTexture(texture), snapshot = captureNanjingProjectSnapshot(editor)
  delete snapshot.models[0].materials[0].textures.map.name
  await restoreNanjingProjectSnapshot(editor, snapshot)
  assert.equal(editor.material.map.name, '原图')
})

test('a saved empty texture name and explicit removal are restored distinctly', async () => {
  const texture = new Texture({ source: 'embedded' }); texture.name = ''
  const editor = editorWithTexture(texture), snapshot = captureNanjingProjectSnapshot(editor)
  texture.name = 'later name'
  await restoreNanjingProjectSnapshot(editor, snapshot)
  assert.equal(editor.material.map.name, '')
  snapshot.models[0].materials[0].textures.map = null
  await restoreNanjingProjectSnapshot(editor, snapshot)
  assert.equal(editor.material.map, null)
})
