import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Mesh, MeshPhysicalMaterial, BufferGeometry, BufferAttribute } from 'three'
import { createNanjingWaterSurface } from '../src/editor/nanjingWaterSurface.js'
import { applyRequestedWaterUpdate, REQUESTED_WATER_UPDATE } from '../src/editor/nanjingRequestedWaterUpdate.js'

function fixture({ config = {}, missing = false } = {}) {
  const scene = new Scene(), geometry = new BufferGeometry(), material = new MeshPhysicalMaterial()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(409 * 3), 3))
  geometry.setIndex(new BufferAttribute(new Uint16Array(1023), 1))
  material.name = '远景_浅蓝水面'
  const mesh = new Mesh(geometry, material); mesh.name = '远景_休闲区域'
  if (!missing) scene.add(mesh)
  let water = createNanjingWaterSurface({ scene }, config)
  const saved = [], receipts = new Map()
  const args = { projectName: '南京数智城A地块 · 最新效果版1', sourceVersionId: '1789548475941-rfgiun6qq7', config,
    getWater: () => water, storage: { getItem: key => receipts.get(key) || null, setItem: (key, value) => receipts.set(key, value) },
    isCurrent: () => true, save: async () => { saved.push(structuredClone(config)) } }
  return { scene, mesh, config, saved, receipts, args, get water() { return water },
    replace() { water.dispose(); water = createNanjingWaterSurface({ scene }, config) },
    dispose() { water.dispose(); material.dispose(); geometry.dispose() } }
}

test('requested working copy stores before/after records only after water becomes active', async () => {
  const f = fixture()
  assert.equal(await applyRequestedWaterUpdate(f.args), true)
  assert.equal(f.saved.length, 2); assert.equal(f.saved[0].waterSurface, undefined)
  assert.equal(f.saved[1].waterSurface.enabled, true); assert.equal(f.water.getStatus().active, true)
  const receipt = JSON.parse(f.receipts.get(REQUESTED_WATER_UPDATE + ':' + f.args.projectName))
  assert.equal(receipt.active, true); assert.equal(receipt.sourceVersionId, f.args.sourceVersionId)
  f.dispose()
})

test('only the two audited working-project and history-source pairs qualify', async () => {
  for (const [projectName, sourceVersionId, qualifies] of [
    ['南京数智城A地块 · 最新效果版', '1789475850323-pw1ar8h49x', true],
    ['南京数智城A地块 · 历史版本', '1789548475941-rfgiun6qq7', false],
    ['南京数智城A地块 · 最新效果版1', 'another-version', false],
    ['南京数智城A地块 · 最新效果版', '1789548475941-rfgiun6qq7', false],
  ]) {
    const f = fixture()
    assert.equal(await applyRequestedWaterUpdate({ ...f.args, projectName, sourceVersionId }), qualifies)
    assert.equal(f.saved.length, qualifies ? 2 : 0); f.dispose()
  }
})

test('old false-positive v1 receipt and saved disabled defaults cannot suppress this requested repair', async () => {
  const f = fixture({ config: { waterSurface: { version: 1, enabled: false } } })
  f.receipts.set('natural-water-20260917-v1:' + f.args.projectName, 'applied')
  assert.equal(await applyRequestedWaterUpdate(f.args), true); assert.equal(f.water.getStatus().active, true)
  f.dispose()
})

test('verified receipt preserves a subsequent deliberate disable or old-history restore', async () => {
  const f = fixture()
  await applyRequestedWaterUpdate(f.args)
  f.water.update({ enabled: false }); delete f.config.waterSurface
  assert.equal(await applyRequestedWaterUpdate(f.args), false)
  assert.equal(f.saved.length, 2); assert.equal(f.water.getStatus().active, false); f.dispose()
})

test('live controller is reacquired after the asynchronous backup', async () => {
  const f = fixture()
  f.args.save = async () => { f.saved.push(structuredClone(f.config)); if (f.saved.length === 1) f.replace() }
  assert.equal(await applyRequestedWaterUpdate(f.args), true)
  assert.equal(f.water.getStatus().active, true); assert.equal(f.saved[1].waterSurface.enabled, true); f.dispose()
})

test('missing target never writes the completed version or success receipt and can retry after load', async () => {
  const f = fixture({ missing: true })
  await assert.rejects(applyRequestedWaterUpdate(f.args), /未找到可启用/)
  assert.equal(f.saved.length, 1); assert.equal(f.receipts.size, 0); assert.equal(f.config.waterSurface, undefined)
  f.scene.add(f.mesh); f.water.refresh()
  assert.equal(await applyRequestedWaterUpdate(f.args), true); f.dispose()
})

test('failed final save restores exact prior config and permits a retry', async () => {
  for (const config of [{}, { waterSurface: { version: 1, enabled: false, roughness: .43 } }]) {
    const before = structuredClone(config), f = fixture({ config })
    f.args.save = async () => { f.saved.push(structuredClone(config)); if (f.saved.length === 2) throw new Error('write failed') }
    await assert.rejects(applyRequestedWaterUpdate(f.args), /write failed/)
    assert.deepEqual(config, before); assert.equal(f.receipts.size, 0); assert.equal(f.water.getStatus().active, false)
    assert.equal(await applyRequestedWaterUpdate(f.args), true); f.dispose()
  }
})

test('loss of active water while final save resolves never writes a success receipt', async () => {
  const f = fixture()
  f.args.save = async () => { f.saved.push(structuredClone(f.config)); if (f.saved.length === 2) { f.scene.remove(f.mesh); f.water.refresh() } }
  await assert.rejects(applyRequestedWaterUpdate(f.args), /保存后水面未保持启用/)
  assert.equal(f.receipts.size, 0); assert.equal(f.config.waterSurface, undefined); f.dispose()
})
