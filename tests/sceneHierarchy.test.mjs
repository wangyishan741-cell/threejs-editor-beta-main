import assert from 'node:assert/strict'
import test from 'node:test'
import { AxesHelper, BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'
import { isSceneHierarchyObject, observeSceneHierarchy, sceneHierarchyChildren, sceneHierarchyRows } from '../src/editor/sceneHierarchy.js'

function fixture() {
  const scene = new Scene(), collection = new Group(), branch = new Group(), other = new Group()
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial()
  const first = new Mesh(geometry, material), second = new Mesh(geometry, material), third = new Mesh(geometry, material)
  collection.name = 'Imported GLB'; collection.editorType = 'isModelGroup'
  branch.name = 'Nested branch'; other.name = 'Other collection'
  first.name = second.name = third.name = 'Duplicate window'
  branch.add(first, second); collection.add(branch); other.add(third); scene.add(collection, other)
  return { scene, collection, branch, other, first, second, third, geometry, material }
}
const objects = rows => rows.map(row => row.object)

test('expansion reveals only the requested levels and preserves source order and parent identities', () => {
  const f = fixture(), expanded = new Set()
  assert.deepEqual(objects(sceneHierarchyRows(f.scene, expanded)), [f.collection, f.other])
  expanded.add(f.collection.uuid)
  let rows = sceneHierarchyRows(f.scene, expanded)
  assert.deepEqual(objects(rows), [f.collection, f.branch, f.other])
  assert.equal(rows[0].kind, '集合'); assert.equal(rows[0].childCount, 1)
  assert.equal(rows[1].parentId, f.collection.uuid); assert.equal(rows[1].depth, 1)
  assert.equal(rows[1].expanded, false); assert.equal(rows[1].childCount, 2)
  expanded.add(f.branch.uuid)
  rows = sceneHierarchyRows(f.scene, expanded)
  assert.deepEqual(objects(rows), [f.collection, f.branch, f.first, f.second, f.other])
  assert.equal(rows[2].kind, '模型'); assert.equal(rows[2].parentId, f.branch.uuid)
  assert.equal(rows[2].depth, 2); assert.equal(rows[2].hasChildren, false)
  assert.equal(rows[0].parentId, null)
  expanded.delete(f.collection.uuid)
  assert.deepEqual(objects(sceneHierarchyRows(f.scene, expanded)), [f.collection, f.other])
})

test('hierarchy inspection keeps original objects, children arrays, transforms and shared resource bindings intact', () => {
  const f = fixture(), nodes = [f.scene, f.collection, f.branch, f.other, f.first, f.second, f.third]
  f.first.position.set(1, 2, 3); f.second.rotation.set(0.1, 0.2, 0.3)
  const before = nodes.map(object => ({ object, parent: object.parent, children: object.children,
    childValues: [...object.children], position: object.position.toArray(), quaternion: object.quaternion.toArray(),
    geometry: object.geometry, material: object.material }))
  const expanded = new Set(nodes.map(object => object.uuid)), expansionBefore = [...expanded]
  for (const query of ['', 'duplicate', 'Imported GLB', 'unmatched']) sceneHierarchyRows(f.scene, expanded, query)
  assert.deepEqual([...expanded], expansionBefore, 'search must not overwrite saved expansion choices')
  for (const snapshot of before) {
    const { object } = snapshot
    assert.equal(object.parent, snapshot.parent); assert.equal(object.children, snapshot.children)
    assert.deepEqual(object.children, snapshot.childValues)
    assert.deepEqual(object.position.toArray(), snapshot.position); assert.deepEqual(object.quaternion.toArray(), snapshot.quaternion)
    assert.equal(object.geometry, snapshot.geometry); assert.equal(object.material, snapshot.material)
  }
  const childRow = sceneHierarchyRows(f.scene, expanded).find(row => row.id === f.second.uuid)
  assert.equal(childRow.object, f.second)
  childRow.object.position.x = 9
  assert.equal(f.second.position.x, 9, 'row actions target the actual imported child')
  assert.equal(f.first.geometry, f.second.geometry); assert.equal(f.first.material, f.second.material)
})

test('helpers, cameras, controls and render proxies are excluded with their descendants', () => {
  const f = fixture(), excluded = [new AxesHelper(), new PerspectiveCamera()]
  for (const flag of ['skipEditorTree', 'nanjingUtility', 'nanjingInstancing']) {
    const node = new Group(); node.userData[flag] = true; excluded.push(node)
  }
  for (const flag of ['isHelper', 'isTransformControls', 'isTransformControlsRoot']) {
    const node = new Group(); node[flag] = true; excluded.push(node)
  }
  const typedHelper = new Group(); typedHelper.type = 'CustomHelper'; excluded.push(typedHelper)
  for (const node of excluded) { node.add(new Mesh(f.geometry, f.material)); f.collection.add(node) }
  assert.equal(isSceneHierarchyObject(null), false)
  assert.ok(excluded.every(node => !isSceneHierarchyObject(node)))
  assert.deepEqual(sceneHierarchyChildren(f.collection), [f.branch])
  const rows = sceneHierarchyRows(f.scene, new Set([f.collection.uuid, f.branch.uuid]), 'mesh')
  assert.deepEqual(rows, [], 'hidden helper descendants cannot appear as search hits')
  assert.equal(sceneHierarchyRows(f.scene)[0].childCount, 1)
})

test('search reaches collapsed branches and includes every duplicate name with its ancestor path', () => {
  const f = fixture(), unrelated = new Mesh(f.geometry, f.material)
  unrelated.name = 'Unrelated door'; f.branch.add(unrelated)
  const expanded = new Set()
  const rows = sceneHierarchyRows(f.scene, expanded, '  DUPLICATE WINDOW  ')
  assert.deepEqual(objects(rows), [f.collection, f.branch, f.first, f.second, f.other, f.third])
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'duplicate labels still have independent row identities')
  assert.ok(rows.filter(row => row.hasChildren).every(row => row.expanded))
  assert.deepEqual(objects(sceneHierarchyRows(f.scene, expanded, 'imported glb')),
    [f.collection, f.branch, f.first, f.second, unrelated], 'matching a collection exposes all its descendants')
  assert.deepEqual(sceneHierarchyRows(f.scene, expanded, 'does not exist'), [])
  assert.deepEqual(objects(sceneHierarchyRows(f.scene, expanded, '   ')), [f.collection, f.other])
  assert.equal(expanded.size, 0)
})

test('a child keeps its own visibility toggle while reporting invisibility inherited from its collection', () => {
  const f = fixture(), expanded = new Set([f.collection.uuid, f.branch.uuid, f.other.uuid])
  f.collection.visible = false; f.second.visible = false
  let rows = sceneHierarchyRows(f.scene, expanded), byObject = new Map(rows.map(row => [row.object, row]))
  assert.equal(byObject.get(f.first).visible, true); assert.equal(byObject.get(f.first).effectiveVisible, false)
  assert.equal(byObject.get(f.second).visible, false); assert.equal(byObject.get(f.second).effectiveVisible, false)
  assert.equal(byObject.get(f.third).effectiveVisible, true)
  f.collection.visible = true
  byObject = new Map(sceneHierarchyRows(f.scene, expanded).map(row => [row.object, row]))
  assert.equal(byObject.get(f.first).effectiveVisible, true)
  assert.equal(byObject.get(f.second).visible, false); assert.equal(byObject.get(f.second).effectiveVisible, false)
})

test('observer batches nested additions/removals and resumes observation when undo reattaches a subtree', async () => {
  const f = fixture(), snapshots = [], expanded = new Set([f.collection.uuid, f.branch.uuid])
  const stop = observeSceneHierarchy(f.scene, () => snapshots.push(objects(sceneHierarchyRows(f.scene, expanded))))
  const addedBranch = new Group(), leaf = new Mesh(f.geometry, f.material)
  expanded.add(addedBranch.uuid); addedBranch.add(leaf)
  f.branch.add(addedBranch)
  f.branch.remove(f.first)
  assert.equal(snapshots.length, 0, 'events are deferred until the complete edit has finished')
  await Promise.resolve()
  assert.equal(snapshots.length, 1)
  assert.ok(snapshots[0].includes(leaf)); assert.ok(!snapshots[0].includes(f.first))
  const anotherLeaf = new Mesh(f.geometry, f.material)
  addedBranch.add(anotherLeaf)
  await Promise.resolve()
  assert.equal(snapshots.length, 2, 'new subtrees are observed recursively')
  f.branch.remove(addedBranch)
  await Promise.resolve()
  assert.equal(snapshots.length, 3)
  addedBranch.remove(leaf)
  await Promise.resolve()
  assert.equal(snapshots.length, 3, 'detached subtree edits do not refresh the scene tree')
  // Undo restores the original Object3D. The observer must subscribe again.
  f.branch.add(addedBranch)
  await Promise.resolve()
  assert.equal(snapshots.length, 4)
  addedBranch.add(leaf)
  await Promise.resolve()
  assert.equal(snapshots.length, 5); assert.ok(snapshots.at(-1).includes(leaf))
  f.first.name = 'Restored window'; f.branch.add(f.first)
  f.scene.dispatchEvent({ type: 'collection-changed' })
  await Promise.resolve()
  assert.equal(snapshots.length, 6, 'undo and its collection notification coalesce')
  assert.ok(snapshots.at(-1).includes(f.first))
  stop()
})

test('observer ignores utility edits, refreshes nonstructural collection edits, and disposes queued work/listeners', async () => {
  const f = fixture(), utility = new Group(); utility.userData.nanjingUtility = true
  f.scene.add(utility)
  let changes = 0, externalEvents = 0
  const external = () => externalEvents++
  f.branch.addEventListener('childadded', external)
  const stop = observeSceneHierarchy(f.scene, () => changes++)
  utility.add(new Group())
  const laterUtility = new Group(); laterUtility.userData.nanjingInstancing = true
  f.scene.add(laterUtility); laterUtility.add(new Group()); laterUtility.removeFromParent()
  await Promise.resolve()
  assert.equal(changes, 0)
  f.first.name = 'Changed name'; f.first.visible = false
  f.scene.dispatchEvent({ type: 'collection-changed', structure: false })
  await Promise.resolve()
  assert.equal(changes, 1)
  f.branch.add(new Group())
  stop(); stop()
  await Promise.resolve()
  assert.equal(changes, 1, 'dispose cancels an already queued refresh')
  f.branch.add(new Group()); f.scene.add(new Group())
  f.scene.dispatchEvent({ type: 'collection-changed' })
  await Promise.resolve()
  assert.equal(changes, 1); assert.equal(externalEvents, 2, 'unrelated listeners survive disposal')
  f.branch.removeEventListener('childadded', external)
})
