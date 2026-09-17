import test from 'node:test'
import assert from 'node:assert/strict'
import { readProjectSceneSource, resolveEditableImportedScene } from '../src/editor/projectSceneSource.js'

function scene(overrides = {}) {
  return { scene: {}, modelCores: [], nanjingRestore: { config: { sceneName: 'working' } },
    projectHistory: { mode: 'restored', sourceVersionId: 'source-1' }, ...overrides }
}

test('immutable URLs read the remote payload and never fall back to a local record', async () => {
  const remote = scene()
  let localReads = 0
  const result = await readProjectSceneSource({ sceneName: 'working', sceneUrl: '/fixed.json', immutable: true,
    readLocal: () => { localReads++; return scene() }, fetcher: async () => ({ ok: true, json: async () => remote }) })
  assert.equal(result, remote); assert.equal(localReads, 0)
  await assert.rejects(readProjectSceneSource({ sceneUrl: '/fixed.json', immutable: true,
    readLocal: () => { localReads++ }, fetcher: async () => ({ ok: false, status: 404 }) }), /404/)
  assert.equal(localReads, 0)
})

test('ordinary fixed previews do not read saved working copies', async () => {
  const remote = scene()
  assert.equal(await resolveEditableImportedScene({ remote, sceneName: 'working',
    readLocal: () => { throw new Error('unexpected local read') } }), remote)
})

test('explicit editable import resumes the matching saved scene, including water settings', async () => {
  const remote = scene(), local = scene({ nanjingRestore: { config: { sceneName: 'working', waterSurface: { version: 1, enabled: true } } } })
  assert.equal(await resolveEditableImportedScene({ remote, sceneName: 'working', editableImport: true,
    readLocal: async name => { assert.equal(name, 'working'); return local } }), local)
  assert.equal(remote.nanjingRestore.config.waterSurface, undefined)
})

test('unrelated same-name project, missing local scene and mismatched saved name preserve the fixed source', async () => {
  const remote = scene()
  for (const local of [null, scene({ projectHistory: { mode: 'restored', sourceVersionId: 'other' } }),
    scene({ projectHistory: { mode: 'restored' } }), scene({ nanjingRestore: { config: { sceneName: 'other-project' } } })]) {
    assert.equal(await resolveEditableImportedScene({ remote, sceneName: 'working', editableImport: true, readLocal: async () => local }), remote)
  }
})

test('editable resume does not conceal storage failure or damaged matching local content', async () => {
  const remote = scene()
  await assert.rejects(resolveEditableImportedScene({ remote, sceneName: 'working', editableImport: true,
    readLocal: async () => { throw new Error('storage unavailable') } }), /storage unavailable/)
  await assert.rejects(resolveEditableImportedScene({ remote, sceneName: 'working', editableImport: true,
    readLocal: async () => scene({ modelCores: null }) }), /完整工程/)
})

test('unversioned sources cannot authorize a local resume', async () => {
  const remote = scene({ projectHistory: { mode: 'restored' } })
  assert.equal(await resolveEditableImportedScene({ remote, sceneName: 'working', editableImport: true,
    readLocal: () => { throw new Error('unexpected local read') } }), remote)
})
