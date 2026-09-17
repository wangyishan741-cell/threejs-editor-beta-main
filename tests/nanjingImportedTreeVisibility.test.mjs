import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, MeshBasicMaterial, BoxGeometry, InstancedMesh, Matrix4, PerspectiveCamera } from 'three'
import { createNanjingInstancing } from '../src/editor/nanjingInstancing.js'
import { createNanjingTreeDensity } from '../src/editor/nanjingTreeDensity.js'
import { suppressNanjingImportedUtilities } from '../src/editor/nanjingImportedUtilities.js'
import { cloneSourceSceneForExport } from '../src/editor/sourceSceneExport.js'

function fixture({ originals = false, hidden = false, marker = false, extraInstance = false, sourceLayer = 1, sourceMaterialVisible = true,
  sourceTest, hideModel = false, hiddenTree = false, unknownSibling = false } = {}) {
  const scene = new Scene(), camera = new PerspectiveCamera(), model = new Group()
  model.editorType = 'isModelGroup'; model.name = 'saved model'; scene.add(model)
  const geometry = new BoxGeometry(.1, 3, .1)
  const trunkMaterial = new MeshBasicMaterial(); trunkMaterial.name = 'Material_24'
  const sourceMaterial = trunkMaterial.clone(); sourceMaterial.visible = sourceMaterialVisible
  const leafMaterial = new MeshBasicMaterial(); leafMaterial.name = 'Material_25'
  const roots = [], trunks = []
  for (let index = 0; index < 3; index++) {
    const root = new Group(); root.name = `周边乔木_${index}`; root.position.x = index + 1
    model.add(root); roots.push(root); root.add(new Mesh(geometry, leafMaterial))
    if (originals) {
      const trunk = new Mesh(geometry, sourceMaterial); trunk.layers.mask = sourceLayer
      if (sourceTest) trunk.layers.test = sourceTest
      root.add(trunk); trunks.push(trunk)
    }
  }
  if (hiddenTree) roots[0].visible = false
  const importedGroup = new Group(); importedGroup.name = '南京场景_GPU_实例渲染'
  importedGroup.userData = { nanjingUtility: true, nanjingInstancing: true }; model.add(importedGroup)
  const batch = new InstancedMesh(geometry, trunkMaterial, extraInstance ? 4 : 3)
  batch.userData = { nanjingUtility: true, nanjingInstancing: true }; importedGroup.add(batch)
  for (let index = 0; index < batch.count; index++) batch.setMatrixAt(index, new Matrix4().makeTranslation(index < 3 ? index + 1 : 1000, 0, 0))
  let sibling
  if (unknownSibling) {
    const material = new MeshBasicMaterial(); material.name = 'unrelated prop'
    sibling = new Mesh(geometry, material); importedGroup.add(sibling)
  }
  // This reproduces the old floating-object cleanup's parent.traverse hide.
  if (hidden) importedGroup.traverse(object => { object.visible = false })
  if (unknownSibling) sibling.visible = true // Still effectively hidden by its parent.
  if (marker) importedGroup.userData.nanjingImportedArtifact = 'instanced-duplicates'
  if (hideModel) model.visible = false
  const editor = { scene, camera }, originalMatrices = batch.instanceMatrix.array.slice()
  suppressNanjingImportedUtilities(editor)
  const live = createNanjingInstancing(editor); live.rebuild()
  const density = createNanjingTreeDensity(editor, { getInstancingGroup: () => live.group, onChange: () => live.sync({ force: true }) })
  editor.withNanjingSourceScene = callback => live.withOriginals(() => density.withOriginals(callback))
  const renderedTrunks = () => {
    let count = 0
    scene.traverseVisible(object => {
      if (object.isMesh && object.material?.name === 'Material_24' && object.layers.test(camera.layers) && object.material.visible) count += object.isInstancedMesh ? object.count : 1
    })
    return count
  }
  const dispose = () => { density.dispose(); live.dispose() }
  return { editor, model, importedGroup, batch, roots, trunks, sibling, live, density, originalMatrices, renderedTrunks, dispose }
}

test('restores sole imported trunks hidden with their GPU parent, including an old parent-only marker', () => {
  for (const marker of [false, true]) {
    const f = fixture({ hidden: true, marker })
    assert.equal(f.renderedTrunks(), 3)
    assert.equal(f.importedGroup.visible, true); assert.equal(f.batch.visible, true)
    assert.deepEqual(f.batch.instanceMatrix.array, f.originalMatrices)
    assert.equal(f.density.getStatus().importedInstances.recoveredBatches, 1)
    assert.equal(f.density.getStatus().importedInstances.recoveredGroups, marker ? 0 : 1)
    f.dispose()
    assert.equal(f.batch.visible, true, 'the repaired source survives controller recreation')
  }
})

test('repaired trunks follow whole-tree density and export the complete repaired source', () => {
  const f = fixture({ hidden: true })
  f.density.setRatio(0); assert.equal(f.renderedTrunks(), 0); assert.equal(f.batch.count, 0)
  const copy = cloneSourceSceneForExport(f.editor), exported = []
  copy.traverseVisible(object => { if (object.isInstancedMesh) exported.push(object) })
  assert.equal(exported.length, 1); assert.equal(exported[0].count, 3)
  assert.deepEqual(exported[0].instanceMatrix.array, f.originalMatrices)
  assert.equal(f.renderedTrunks(), 0, 'export restores current density afterward')
  f.density.setRatio(100); assert.equal(f.renderedTrunks(), 3)
  f.dispose()
})

test('a hidden batch arriving while density is zero recovers after the retained roots become visible', () => {
  const f = fixture()
  f.density.setRatio(0)
  f.importedGroup.traverse(object => { object.visible = false })
  f.density.refresh()
  assert.equal(f.renderedTrunks(), 0)
  f.density.setRatio(100)
  assert.equal(f.batch.visible, true); assert.equal(f.importedGroup.visible, true)
  assert.equal(f.renderedTrunks(), 3)
  f.dispose()
})

test('hidden ordinary roots and unrelated GPU sibling props stay hidden', () => {
  const f = fixture({ hidden: true, hiddenTree: true, unknownSibling: true })
  assert.equal(f.renderedTrunks(), 2); assert.equal(f.roots[0].visible, false)
  assert.equal(f.sibling.visible, false)
  f.density.setRatio(100); assert.equal(f.renderedTrunks(), 2)
  f.dispose()
  const hiddenModel = fixture({ hidden: true, hideModel: true })
  assert.equal(hiddenModel.renderedTrunks(), 0); assert.equal(hiddenModel.importedGroup.visible, false)
  assert.equal(hiddenModel.density.getStatus().importedInstances.recoveredBatches, 0)
  hiddenModel.dispose()
})

test('mixed unknown batches retain all instance data without automatically revealing unmatched props', () => {
  const f = fixture({ hidden: true, extraInstance: true })
  assert.equal(f.batch.count, 4); assert.equal(f.renderedTrunks(), 0)
  assert.deepEqual(f.batch.instanceMatrix.array, f.originalMatrices)
  assert.equal(f.density.getStatus().importedInstances.recoveredBatches, 0)
  f.dispose()
})

test('visible originals represented by live GPU batches deduplicate and remain correct when selected or GPU is disabled', () => {
  const f = fixture({ originals: true })
  assert.equal(f.batch.count, 0); assert.equal(f.renderedTrunks(), 3)
  f.live.sync({ force: true, selected: f.roots }); f.density.refresh()
  assert.equal(f.batch.count, 0); assert.equal(f.renderedTrunks(), 3)
  f.live.setEnabled(false); f.density.refresh()
  assert.equal(f.batch.count, 0); assert.equal(f.renderedTrunks(), 3)
  const copy = cloneSourceSceneForExport(f.editor); let importedBatches = 0
  copy.traverse(object => { if (object.isInstancedMesh) importedBatches++ })
  assert.equal(importedBatches, 0)
  f.dispose()
})

test('invisible source layers, materials, or custom draw suppression do not suppress the sole visible imported trunks', () => {
  for (const options of [{ sourceLayer: 0 }, { sourceMaterialVisible: false }, { sourceTest: () => false }]) {
    const f = fixture({ originals: true, ...options })
    assert.equal(f.batch.count, 3); assert.equal(f.renderedTrunks(), 3)
    const copy = cloneSourceSceneForExport(f.editor); let importedBatches = 0
    copy.traverse(object => { if (object.isInstancedMesh) importedBatches++ })
    assert.equal(importedBatches, 0, 'GLTF ignores render layers and serializes the visible source originals')
    f.dispose()
  }
})
