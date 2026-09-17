import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, PlaneGeometry, MeshStandardMaterial, MeshNormalMaterial,
  Texture, DataTexture, CubeTexture, RepeatWrapping, MirroredRepeatWrapping, SRGBColorSpace, NoColorSpace } from 'three'
import { collectProjectTextures, textureImageSize, drawTexturePreview, durableTextureUrl, createBaseColorTexture,
  baseColorFlipY, loadLocalBaseColorTexture, loadProjectBaseColorTexture, assignBaseColorTexture } from '../src/editor/materialTextures.js'

const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
function texture(name = '纹理', options = {}) {
  const result = new Texture({ width: 200, height: 100, sourceName: name })
  result.name = name
  Object.assign(result, options)
  return result
}
function addMaterial(scene, material, options = {}) {
  const mesh = new Mesh(new PlaneGeometry(), material)
  Object.assign(mesh, options); scene.add(mesh)
  return mesh
}
function canvas(options = {}) {
  const calls = []
  return { width: 0, height: 0, calls, getContext: () => ({ drawImage: (...args) => calls.push(args) }),
    toDataURL: () => DATA, ...options }
}

test('project choices deduplicate shared textures, include source maps and exclude display helpers', () => {
  const scene = new Scene(), shared = texture('A木纹'), second = texture('Z石材'), displayOnly = texture('不应列出')
  const a = new MeshStandardMaterial({ map: shared, normalMap: second }); a.name = '材质A'
  const b = new MeshStandardMaterial({ map: shared }); b.name = '材质B'
  addMaterial(scene, a); addMaterial(scene, a); addMaterial(scene, b)
  const helper = new Group(); helper.userData.nanjingUtility = true
  addMaterial(helper, new MeshStandardMaterial({ map: displayOnly })); scene.add(helper)
  addMaterial(scene, new MeshStandardMaterial({ map: new DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1) }))
  const runtime = new MeshStandardMaterial({ map: displayOnly }), source = new MeshStandardMaterial({ map: shared })
  source.name = '原始材质'; addMaterial(scene, runtime)
  const result = collectProjectTextures({ scene, getNanjingSourceMaterial: material => material === runtime ? source : material })
  assert.deepEqual(result.map(item => item.name), ['A木纹', 'Z石材'])
  assert.equal(result[0].usages.length, 3)
  assert.equal(result[1].usages[0], '材质A / 法线')
  assert.equal(scene.children[0].material, a)
})

test('project selection clones the texture and preserves target UV settings without mutating shared resources', () => {
  const candidate = texture('新砖纹', { textureUrl: DATA, colorSpace: NoColorSpace, flipY: true })
  const previous = texture('原图', { flipY: false, channel: 1, wrapS: RepeatWrapping, wrapT: MirroredRepeatWrapping,
    rotation: .4, anisotropy: 16, matrixAutoUpdate: false })
  previous.repeat.set(2.8, 7.4); previous.offset.set(.2, -.3); previous.center.set(.5, .5); previous.updateMatrix()
  const sourceBefore = { repeat: candidate.repeat.toArray(), colorSpace: candidate.colorSpace, flipY: candidate.flipY }
  const replacement = createBaseColorTexture(candidate, previous)
  assert.notEqual(replacement, candidate); assert.notEqual(replacement, previous)
  assert.equal(replacement.name, '新砖纹'); assert.equal(replacement.textureUrl, DATA); assert.equal(replacement.textureType, 'image')
  assert.equal(replacement.colorSpace, SRGBColorSpace)
  for (const key of ['flipY', 'channel', 'wrapS', 'wrapT', 'rotation', 'anisotropy', 'matrixAutoUpdate']) assert.equal(replacement[key], previous[key])
  for (const key of ['repeat', 'offset', 'center', 'matrix']) assert.deepEqual(replacement[key].toArray(), previous[key].toArray())
  replacement.repeat.set(9, 9)
  assert.deepEqual(previous.repeat.toArray(), [2.8, 7.4])
  assert.deepEqual({ repeat: candidate.repeat.toArray(), colorSpace: candidate.colorSpace, flipY: candidate.flipY }, sourceBefore)
})

test('a mapless GLB keeps GLTF orientation and an ordinary mesh uses the normal image orientation', () => {
  const root = new Group(); root.modelInfo = { type: 'GLTF' }
  const material = new MeshStandardMaterial(), mesh = addMaterial(root, material), record = { material, mesh }
  assert.equal(baseColorFlipY(record), false)
  const chosen = createBaseColorTexture(texture('砖', { textureUrl: DATA }), null, { flipY: baseColorFlipY(record) })
  assert.equal(chosen.flipY, false)
  root.remove(mesh)
  assert.equal(baseColorFlipY(record), true)
  material.normalMap = texture('法线', { flipY: false })
  assert.equal(baseColorFlipY(record), false)
})

test('embedded images become durable pixel URLs and temporary blob URLs are never persisted', () => {
  const bitmap = texture('GLB内图'), target = canvas()
  bitmap.textureUrl = 'blob:session-only'; bitmap.image.src = 'blob:also-temporary'
  const url = durableTextureUrl(bitmap, { createCanvas: () => target })
  assert.equal(url, DATA); assert.equal(target.width, 200); assert.equal(target.height, 100)
  assert.equal(target.calls[0][0], bitmap.image)
  assert.equal(bitmap.textureUrl, 'blob:session-only')
  assert.equal(durableTextureUrl(texture('文件', { textureUrl: DATA }), { createCanvas: () => { throw new Error('no rasterization needed') } }), DATA)
})

test('unloaded or unreadable project images fail without returning a broken persistent URL', () => {
  const empty = new Texture()
  assert.throws(() => durableTextureUrl(empty), /尚未加载完成/)
  assert.throws(() => durableTextureUrl(texture(), { createCanvas: () => canvas({ getContext: () => ({ drawImage: () => { throw new Error('invalid image') } }) }) }), /暂不支持/)
  assert.throws(() => durableTextureUrl(texture(), { createCanvas: () => canvas({ toDataURL: () => { throw new Error('tainted') } }) }), /禁止读取/)
  assert.throws(() => durableTextureUrl(texture(), { createCanvas: () => canvas({ toDataURL: () => 'data:,' }) }), /禁止读取/)
  assert.throws(() => createBaseColorTexture(texture(), null, { url: 'javascript:alert(1)' }), /可保存/)
  assert.throws(() => createBaseColorTexture(new CubeTexture(), null, { url: DATA }), /二维图片/)
})

test('thumbnail preview respects image proportions and unavailable canvas/image inputs fail safely', () => {
  const image = texture(), target = canvas()
  assert.equal(drawTexturePreview(image, target, 128), true)
  assert.equal(target.width, 128); assert.equal(target.height, 64)
  assert.deepEqual(textureImageSize(image), { width: 200, height: 100 })
  assert.equal(drawTexturePreview(new Texture(), target), false)
  assert.equal(drawTexturePreview(image, canvas({ getContext: () => null })), false)
})

test('local files decode completely before a durable sRGB texture is returned', async () => {
  const file = { name: '路面.png', type: 'image/png', size: 1024 }, loaded = texture(), calls = []
  const result = await loadLocalBaseColorTexture(file, {
    read: async value => { assert.equal(value, file); calls.push('read'); return DATA },
    load: async url => { assert.equal(url, DATA); calls.push('load'); return loaded },
  })
  assert.equal(result, loaded); assert.deepEqual(calls, ['read', 'load'])
  assert.equal(result.name, '路面.png'); assert.equal(result.textureUrl, DATA); assert.equal(result.textureType, 'image')
  assert.equal(result.colorSpace, SRGBColorSpace)
})

test('a project bitmap is decoded into an independent ordinary image before target orientation is applied', async () => {
  const bitmap = texture('GLB内图', { flipY: false, colorSpace: NoColorSpace })
  bitmap.image.isBitmapFixture = true
  const originalImage = bitmap.image, originalSource = bitmap.source, decoded = texture('decoded HTML image')
  const calls = []
  const candidate = await loadProjectBaseColorTexture(bitmap, {
    getUrl: input => { assert.equal(input, bitmap); calls.push('persist pixels'); return DATA },
    load: async url => { assert.equal(url, DATA); calls.push('decode image'); return decoded },
  })
  assert.deepEqual(calls, ['persist pixels', 'decode image'])
  assert.equal(candidate, decoded); assert.notEqual(candidate.source, originalSource)
  assert.equal(candidate.name, 'GLB内图'); assert.equal(candidate.textureUrl, DATA)
  assert.equal(candidate.colorSpace, SRGBColorSpace); assert.equal(candidate.textureType, 'image')
  const replacement = createBaseColorTexture(candidate, null, { flipY: true })
  assert.equal(replacement.flipY, true); assert.equal(replacement.image.isBitmapFixture, undefined)
  assert.equal(bitmap.source, originalSource); assert.equal(bitmap.image, originalImage)
  assert.equal(bitmap.flipY, false); assert.equal(bitmap.colorSpace, NoColorSpace); assert.equal(bitmap.textureUrl, undefined)
})

test('failed project image encoding or decoding never changes the original bitmap', async () => {
  const bitmap = texture('GLB内图', { flipY: false }), source = bitmap.source
  let loads = 0
  await assert.rejects(loadProjectBaseColorTexture(bitmap, { getUrl: () => { throw new Error('tainted canvas') },
    load: async () => { loads++ } }), /tainted canvas/)
  assert.equal(loads, 0)
  await assert.rejects(loadProjectBaseColorTexture(bitmap, { getUrl: () => DATA,
    load: async () => { throw new Error('decode failed') } }), /decode failed/)
  assert.equal(bitmap.source, source); assert.equal(bitmap.textureUrl, undefined); assert.equal(bitmap.flipY, false)
})

test('unsupported, empty and oversized local files are rejected before any read or decode', async () => {
  for (const file of [null, { type: 'image/svg+xml', size: 10 }, { type: 'text/html', size: 10 },
    { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: 32 * 1024 * 1024 + 1 }]) {
    let calls = 0
    await assert.rejects(loadLocalBaseColorTexture(file, { read: async () => { calls++ }, load: async () => { calls++ } }))
    assert.equal(calls, 0)
  }
})

test('local read and decode failures leave the current material map unchanged', async () => {
  const material = new MeshStandardMaterial({ map: texture('原图') }), previous = material.map
  const file = { name: '坏图.png', type: 'image/png', size: 512 }
  await assert.rejects(loadLocalBaseColorTexture(file, { read: async () => { throw new Error('read failed') } }), /read failed/)
  await assert.rejects(loadLocalBaseColorTexture(file, { read: async () => DATA, load: async () => { throw new Error('decode failed') } }), /decode failed/)
  assert.equal(material.map, previous)
})

test('assignment synchronizes editable source and live derived material without changing other shared-image users', () => {
  const scene = new Scene(), old = texture('共用旧图')
  const source = new MeshStandardMaterial({ map: old }), runtime = source.clone(), other = source.clone()
  const mesh = addMaterial(scene, runtime); addMaterial(scene, runtime); addMaterial(scene, other)
  const editor = { scene, getNanjingSourceMaterial: material => material === runtime ? source : material }
  const replacement = createBaseColorTexture(texture('新图', { textureUrl: DATA }), old)
  assert.equal(assignBaseColorTexture(editor, { material: runtime, mesh }, replacement), source)
  assert.equal(source.map, replacement); assert.equal(runtime.map, replacement); assert.equal(other.map, old)
  assert.equal(old.name, '共用旧图')
  assert.ok(source.version > 0); assert.ok(runtime.version > 0)
})

test('removed and unsupported materials reject replacement before mutating the old map', () => {
  const scene = new Scene(), old = texture('原图'), material = new MeshStandardMaterial({ map: old })
  const mesh = addMaterial(scene, material), replacement = texture('新图', { textureUrl: DATA })
  scene.remove(mesh)
  assert.throws(() => assignBaseColorTexture({ scene }, { material, mesh }, replacement), /已不在当前场景/)
  assert.equal(material.map, old)
  const unsupported = new MeshNormalMaterial(), other = addMaterial(scene, unsupported)
  assert.throws(() => assignBaseColorTexture({ scene }, { material: unsupported, mesh: other }, replacement), /不支持基础色贴图/)
})
