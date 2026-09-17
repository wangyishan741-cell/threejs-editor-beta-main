import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { BoxGeometry, EventDispatcher, Group, Mesh, MeshBasicMaterial, Scene } from 'three'
import { createModelCollectionEdits } from '../src/editor/modelCollectionEdits.js'

// The core imports browser-only packages at module scope. Exercise its actual
// installed undo/redo implementation in isolation, without replacing it with a
// test reimplementation or modifying the dependency.
const coreSource = readFileSync(new URL('../node_modules/three-edit-cores/dist/index.js', import.meta.url), 'utf8')
function nativeFunction(name) {
  const found = coreSource.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))
  assert.ok(found, `native history helper ${name} still exists`)
  return found[0]
}
function nativeInitializer(table, lookup) {
  const marker = coreSource.indexOf(`let e = ${lookup}, t = ${table}();`)
  assert.ok(marker >= 0)
  const start = coreSource.lastIndexOf('function()', marker), body = coreSource.indexOf('{', start)
  let depth = 1, end = body + 1
  while (depth && end < coreSource.length) { if (coreSource[end] === '{') depth++; if (coreSource[end] === '}') depth--; end++ }
  return `(${coreSource.slice(start, end)})();`
}
const native = vm.runInNewContext(['Nn', 'Fn', 'In', 'Pn', 'Jn', 'qn', 'Kn'].map(nativeFunction).join('\n')
  + '\n' + nativeInitializer('Nn', 'Fn') + '\n' + nativeInitializer('Jn', 'qn') + '\n({ restore: Kn, transform: Pn })')

function setup(params = {}) {
  const scene = new Scene(), controls = new EventDispatcher(), history = { list: [], reList: [], index: -1 }
  controls.detach = () => { controls.object = null }
  controls.drag_change_callback = start => {
    history.index = -1
    history[start ? 'list' : 'reList'].push({ object: controls.object, transform: native.transform(controls.object) })
  }
  const editor = { scene, transformControls: controls, handler: { handlerHistory: history } }
  const edits = createModelCollectionEdits(editor, params)
  let changes = 0
  scene.addEventListener('collection-changed', () => changes++)
  return { editor, edits, history, changes: () => changes }
}
function model(info = { url: '/source.glb', type: 'GLB' }) {
  const root = new Group(), branch = new Group(), geometry = new BoxGeometry(), material = new MeshBasicMaterial()
  root.name = 'Imported GLB'; root.editorType = 'isModelGroup'; root.modelInfo = info
  branch.name = 'duplicated-group'
  const first = new Mesh(geometry, material), second = new Mesh(geometry, material), third = new Mesh(geometry, material)
  first.name = second.name = third.name = 'duplicate-name'
  second.position.set(3, 0, 0); third.position.set(6, 0, 0)
  branch.add(first, second); root.add(branch, third)
  return { root, branch, first, second, third, geometry, material }
}
function load(harness, info) {
  const objects = model(info)
  harness.editor.scene.add(objects.root)
  harness.edits.registerRoot(objects.root)
  return objects
}
function serialize(harness) {
  const modelCores = harness.editor.scene.children.filter(root => root.editorType === 'isModelGroup').map(root => ({
    modelInfo: { ...root.modelInfo }, group: { uuid: root.uuid, name: root.name }
  }))
  return JSON.parse(JSON.stringify(harness.edits.annotateSave({ modelCores })))
}

test('duplicate names, nested deletion, rename and transforms survive two GLB reloads without copying buffers', () => {
  const h = setup(), a = load(h)
  h.edits.remove(a.first)
  h.edits.setTransform(a.second, { position: [4, 5, 6], scale: [2, 1, 1] })
  h.edits.rename(a.second, 'renamed-child'); h.edits.setVisible(a.third, false)
  const data = serialize(h), descriptor = data.modelCores[0].group.collectionEdits
  assert.deepEqual(descriptor.deleted.map(item => item.path), [[0, 0]])
  assert.deepEqual(descriptor.nodes.find(item => item.state.name)?.path, [0, 1])
  assert.ok(!JSON.stringify(data).includes('geometries'))
  const h2 = setup(data), b = load(h2, data.modelCores[0].modelInfo)
  assert.deepEqual(h2.edits.restoreRoot(b.root), { restored: true, skipped: [] })
  assert.equal(b.first.parent, null); assert.equal(b.branch.children[0], b.second)
  assert.deepEqual(b.second.position.toArray(), [4, 5, 6]); assert.equal(b.second.name, 'renamed-child')
  assert.equal(b.third.visible, false); assert.equal(b.second.geometry, b.geometry); assert.equal(b.third.material, b.material)
  const data2 = serialize(h2), h3 = setup(data2), c = load(h3, data2.modelCores[0].modelInfo)
  h3.edits.restoreAll()
  assert.equal(c.first.parent, null); assert.deepEqual(c.second.position.toArray(), [4, 5, 6])
  assert.equal(c.third.visible, false); assert.equal(data2.modelCores[0].modelInfo.collectionId, data.modelCores[0].modelInfo.collectionId)
})

test('native undo/redo restores exact parent ordering and interoperates with native drag history', async () => {
  const h = setup(), a = load(h), controls = h.editor.transformControls
  controls.object = a.second; controls.drag_change_callback(true)
  a.second.position.x = 8; controls.drag_change_callback(false)
  h.edits.remove(a.first); h.edits.rename(a.second, 'new-name'); h.edits.setVisible(a.third, false)
  for (let i = 0; i < 4; i++) native.restore(h.history, 'z')
  assert.equal(a.third.visible, true); assert.equal(a.second.name, 'duplicate-name')
  assert.deepEqual(a.branch.children, [a.first, a.second]); assert.equal(a.second.position.x, 3)
  for (let i = 0; i < 4; i++) native.restore(h.history, 'y')
  assert.equal(a.third.visible, false); assert.equal(a.second.name, 'new-name')
  assert.equal(a.first.parent, null); assert.equal(a.second.position.x, 8)
  native.restore(h.history, 'z'); native.restore(h.history, 'z')
  controls.object = a.third; controls.drag_change_callback(true)
  a.third.position.z = 9; controls.drag_change_callback(false)
  assert.equal(h.history.list.length, 3, 'a new drag truncates the undone rename/visibility branch')
  native.restore(h.history, 'z'); assert.equal(a.third.position.z, 0)
  native.restore(h.history, 'y'); assert.equal(a.third.position.z, 9)
  await Promise.resolve(); assert.ok(h.changes() > 0, 'history invalidates the source-object renderer')
})

test('deleting a collection is reversible and no shared geometry or material is disposed', () => {
  const h = setup(), a = load(h), extra = load(h)
  let disposed = 0
  a.geometry.addEventListener('dispose', () => disposed++); a.material.addEventListener('dispose', () => disposed++)
  h.edits.remove(a.root)
  assert.equal(serialize(h).modelCores.length, 1)
  native.restore(h.history, 'z')
  assert.deepEqual(h.editor.scene.children, [a.root, extra.root])
  assert.equal(a.root.children[0], a.branch); assert.equal(disposed, 0)
  native.restore(h.history, 'y'); assert.equal(a.root.parent, null); assert.equal(disposed, 0)
  h.edits.remove(extra.root)
  const empty = serialize(h)
  assert.equal(empty.modelCores.length, 0); assert.equal(empty.modelCollections.version, 1)
})

test('two imports of the same URL get independent persistent identities', () => {
  const h = setup(), sharedInfo = { url: '/same.glb', type: 'GLB' }, a = load(h, sharedInfo), b = load(h, sharedInfo)
  h.edits.setTransform(a.second, { position: [10, 0, 0] }); h.edits.setTransform(b.second, { position: [20, 0, 0] })
  const data = serialize(h)
  assert.notEqual(data.modelCores[0].modelInfo.collectionId, data.modelCores[1].modelInfo.collectionId)
  const h2 = setup(data), second = load(h2, data.modelCores[1].modelInfo), first = load(h2, data.modelCores[0].modelInfo)
  h2.edits.restoreAll()
  assert.equal(first.second.position.x, 10); assert.equal(second.second.position.x, 20)
})

test('removing an inner collection persists one subtree tombstone and leaves its sibling independently editable', () => {
  const h = setup(), a = load(h)
  h.edits.remove(a.branch); h.edits.setTransform(a.third, { position: [12, 2, 1] })
  const data = serialize(h)
  assert.deepEqual(data.modelCores[0].group.collectionEdits.deleted.map(entry => entry.path), [[0]])
  const h2 = setup(data), b = load(h2, data.modelCores[0].modelInfo)
  h2.edits.restoreAll()
  assert.deepEqual(b.root.children, [b.third]); assert.deepEqual(b.third.position.toArray(), [12, 2, 1])
  assert.equal(b.first.parent, b.branch); assert.equal(b.second.parent, b.branch)
})

test('save in source wrapper preserves a moved object without doubling display-only offsets', () => {
  const h = setup(), a = load(h)
  const displayOffset = 7
  a.second.position.y += displayOffset
  h.edits.setTransform(a.second, { position: [3, 11, 0] }) // User moved it another four units.
  a.second.position.y -= displayOffset // Equivalent to roadLevels.withOriginals.
  const data = serialize(h)
  a.second.position.y += displayOffset
  const h2 = setup(data), b = load(h2, data.modelCores[0].modelInfo)
  h2.edits.restoreAll(); b.second.position.y += displayOffset
  assert.equal(b.second.position.y, 11)
})

test('legacy name-based flags cannot leak from one duplicate onto its unchanged siblings', () => {
  const h = setup(), a = load(h)
  h.edits.setVisible(a.first, false)
  const data = serialize(h), h2 = setup(data), b = load(h2, data.modelCores[0].modelInfo)
  b.first.visible = b.second.visible = b.third.visible = false // Legacy config.objects[name].
  h2.edits.restoreAll()
  assert.equal(b.first.visible, false); assert.equal(b.second.visible, true); assert.equal(b.third.visible, true)
})

test('later model loads and appearance reapplication preserve live visibility and transform edits on restored roots', () => {
  const h = setup(), a = load(h)
  const applyLegacyRules = () => h.editor.scene.traverse(object => {
    if (!object.isMesh || h.edits.shouldPreserveObjectState(object)) return
    object.visible = true; object.castShadow = true; object.position.y = 1
  })
  assert.equal(h.edits.shouldPreserveObjectState(a.first), false)
  applyLegacyRules(); h.edits.restoreRoot(a.root)
  assert.equal(h.edits.shouldPreserveObjectState(a.first), true, 'a legacy root without a descriptor is marked restored')
  h.edits.setVisible(a.first, false); h.edits.setTransform(a.second, { position: [3, 9, 0] })
  const b = load(h)
  assert.equal(h.edits.shouldPreserveObjectState(b.first), false)
  applyLegacyRules(); h.edits.restoreRoot(b.root)
  assert.equal(a.first.visible, false); assert.equal(a.second.visible, true); assert.equal(a.second.position.y, 9)
  assert.equal(b.first.visible, true); assert.equal(b.first.position.y, 1)
  h.edits.remove(a.root); native.restore(h.history, 'z'); applyLegacyRules()
  assert.equal(a.first.visible, false); assert.equal(a.second.position.y, 9)
})

test('changed source structure fails closed and reset clears history targets from the old project', () => {
  const h = setup(), a = load(h)
  h.edits.setTransform(a.second, { position: [9, 0, 0] }); h.edits.remove(a.first)
  const data = serialize(h), h2 = setup(data), b = model(data.modelCores[0].modelInfo)
  b.first.name = 'new-source-first'; b.second.name = 'new-source-second'
  h2.editor.scene.add(b.root); h2.edits.registerRoot(b.root)
  assert.equal(h2.edits.restoreRoot(b.root).skipped.length, 2)
  assert.equal(b.first.parent, b.branch); assert.equal(b.second.position.x, 3)
  h.edits.setParams({}); assert.equal(h.history.list.length, 0); assert.equal(h.history.reList.length, 0)
})

test('static matrix transforms are editable, reversible and persistent', () => {
  const h = setup(), a = load(h)
  a.second.matrixAutoUpdate = false; a.second.updateMatrix()
  const originalMatrix = a.second.matrix.toArray()
  h.edits.setTransform(a.second, { position: [4, 5, 6] })
  assert.deepEqual(a.second.matrix.elements.slice(12, 15), [4, 5, 6])
  native.restore(h.history, 'z'); assert.deepEqual(a.second.matrix.toArray(), originalMatrix)
  native.restore(h.history, 'y'); assert.deepEqual(a.second.matrix.elements.slice(12, 15), [4, 5, 6])
  const data = serialize(h), h2 = setup(data), b = load(h2, data.modelCores[0].modelInfo)
  h2.edits.restoreAll(); assert.equal(b.second.matrixAutoUpdate, false)
  assert.deepEqual(b.second.matrix.elements.slice(12, 15), [4, 5, 6])
})

test('Delete captures source-object removal, skips text input and removes its listener on dispose', () => {
  const previousDocument = globalThis.document, listeners = new Map()
  globalThis.document = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) }
  try {
    const h = setup(), a = load(h)
    h.editor.transformControls.object = a.second
    let prevented = false, stopped = false
    const event = { key: 'Delete', target: { closest: () => true }, preventDefault() { prevented = true }, stopImmediatePropagation() { stopped = true } }
    listeners.get('keydown')(event); assert.equal(a.second.parent, a.branch); assert.equal(prevented, false)
    event.target.closest = () => null
    listeners.get('keydown')(event); assert.equal(a.second.parent, null); assert.equal(prevented && stopped, true)
    native.restore(h.history, 'z'); assert.equal(a.second.parent, a.branch)
    const foreign = new Mesh(); h.editor.scene.add(foreign); h.editor.transformControls.object = foreign
    prevented = stopped = false; listeners.get('keydown')(event); assert.equal(prevented || stopped, false)
    h.edits.dispose(); assert.equal(listeners.size, 0)
  } finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument }
})
