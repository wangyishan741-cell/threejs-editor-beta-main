import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture, RepeatWrapping, SRGBColorSpace } from 'three'
import { installMaterialTexturePersistence, captureBaseColorTexture } from '../src/editor/materialTexturePersistence.js'
import { createProjectLoadState } from '../src/editor/projectLoadState.js'

const url = 'data:image/png;base64,dGVzdA=='
function imageTexture() {
    const texture = new Texture({ width: 2, height: 2 })
    texture.textureUrl = url; texture.name = '自定义墙面'; texture.colorSpace = SRGBColorSpace
    texture.flipY = false; texture.channel = 1; texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(2.8, 7.4); texture.offset.set(.2, -.8); texture.center.set(.3, .4); texture.rotation = .6
    texture.anisotropy = 8; texture.updateMatrix(); texture.matrixAutoUpdate = false
    return texture
}
function fixture(params = { modelCores: [] }) {
    const scene = new Scene(), root = new Group(), a = new Mesh(new BoxGeometry(), new MeshStandardMaterial()), b = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    root.name = 'model'; root.editorType = 'isModelGroup'; root.modelInfo = { url: '/model.glb', type: 'GLTF', collectionId: 'collection-1' }
    a.name = 'same-name'; a.material.name = '材质'; b.name = 'same-name'; b.material.name = '材质'
    root.add(a, b)
    let rendered = 0
    const service = { complete() {} }
    const editor = { scene, renderer: { shadowMap: {} }, modelCores: { progressList: [{ loaderService: service }] },
        renderScene() { rendered++ },
        saveSceneEdit() { return { modelCores: scene.children.filter(o => o.editorType === 'isModelGroup').map(o => ({ modelInfo: { ...o.modelInfo }, group: { name: o.name } })) } },
        resetEditorStorage() { scene.clear(); this.modelCores.progressList = [{ loaderService: { complete() {} } }] },
    }
    return { scene, root, a, b, editor, service, params, rendered: () => rendered,
        add() { scene.add(root); scene.ADDCALL?.(root) } }
}
const entry = (map, extra = {}) => ({ group: { name: 'model', baseColorTextures: { version: 1, entries: [{ path: [0], name: 'same-name', type: 'Mesh', vertices: 24, indices: 36, slot: 0, materialName: '材质', map, ...extra }] } },
    modelInfo: { url: '/model.glb', collectionId: 'collection-1' } })

test('only explicitly edited materials are saved, with complete GLB sampler metadata and stable original paths', () => {
    const f = fixture(), controller = installMaterialTexturePersistence(f.editor, f.params)
    f.add(); f.b.material.map = imageTexture(); f.b.material.userData.baseColorTextureEdited = true
    f.root.remove(f.a)
    const data = f.editor.saveSceneEdit(), edits = data.modelCores[0].group.baseColorTextures.entries
    assert.equal(edits.length, 1); assert.deepEqual(edits[0].path, [1])
    assert.equal(edits[0].map.name, '自定义墙面'); assert.equal(edits[0].map.flipY, false); assert.equal(edits[0].map.channel, 1)
    assert.deepEqual(edits[0].map.matrix, f.b.material.map.matrix.toArray())
    assert.deepEqual(edits[0].map.repeat, [2.8, 7.4]); controller.dispose()
})

test('native completion applies after core material restoration, restores fields, and keeps same-name independent slots intact', async () => {
    const descriptor = captureBaseColorTexture(imageTexture()), params = { modelCores: [entry(descriptor)] }
    const f = fixture(params), unchanged = f.b.material.map = new Texture()
    const controller = installMaterialTexturePersistence(f.editor, params, { load: async () => new Texture() })
    f.add()
    const coreMap = f.a.material.map = new Texture()
    assert.equal(f.a.material.map, coreMap)
    f.service.complete(); await controller.whenReady()
    assert.notEqual(f.a.material.map, coreMap); assert.equal(f.b.material.map, unchanged)
    assert.deepEqual(captureBaseColorTexture(f.a.material.map), descriptor)
    assert.equal(f.a.material.userData.baseColorTextureEdited, true); assert.ok(f.rendered() > 0)
    const resaved = f.editor.saveSceneEdit(); assert.deepEqual(resaved.modelCores[0].group.baseColorTextures.entries[0].map, descriptor)
    controller.dispose()
})

test('explicit null survives a saved GLB that still has its original map', async () => {
    const params = { modelCores: [entry(null)] }, f = fixture(params)
    const original = f.a.material.map = new Texture()
    const controller = installMaterialTexturePersistence(f.editor, params)
    f.add(); f.service.complete(); await controller.whenReady()
    assert.equal(f.a.material.map, null); assert.equal(original.version, 0)
    assert.equal(f.editor.saveSceneEdit().modelCores[0].group.baseColorTextures.entries[0].map, null)
    controller.dispose()
})

test('legacy unedited slots are untouched; mismatched geometry never edits an adjacent same-name object', async () => {
    const params = { modelCores: [entry(null, { vertices: 25 })] }, f = fixture(params)
    const original = f.a.material.map = new Texture()
    const controller = installMaterialTexturePersistence(f.editor, params)
    f.add(); f.service.complete(); await controller.whenReady()
    assert.equal(f.a.material.map, original); assert.equal(f.a.material.userData.baseColorTextureEdited, undefined)
    assert.equal(f.editor.saveSceneEdit().modelCores[0].group.baseColorTextures, undefined)
    controller.dispose()
})

test('Nanjing non-history waits for the explicit material-rule completion point; history remains authoritative', async () => {
    const params = { modelCores: [entry(null)], nanjingRestore: { config: {} } }, f = fixture(params)
    const original = f.a.material.map = new Texture()
    const controller = installMaterialTexturePersistence(f.editor, params)
    f.add(); f.service.complete(); await controller.whenReady(); assert.equal(f.a.material.map, original)
    await controller.restoreAll(); assert.equal(f.a.material.map, null)
    assert.equal(f.editor.saveSceneEdit().modelCores[0].group.baseColorTextures.entries[0].map, null)
    controller.dispose()
    const historyParams = { ...params, projectHistory: { mode: 'restored' }, nanjingRestore: { historySnapshot: { version: 1 } } }
    const h = fixture(historyParams), historyMap = h.a.material.map = new Texture()
    const second = installMaterialTexturePersistence(h.editor, historyParams); h.add(); await second.restoreAll()
    assert.equal(h.a.material.map, historyMap); assert.equal(h.editor.saveSceneEdit().modelCores[0].group.baseColorTextures, undefined)
    second.dispose()
})

test('reset cancels stale asynchronous image loads and preserves user edits made while loading', async () => {
    const params = { modelCores: [entry(captureBaseColorTexture(imageTexture()))] }, f = fixture(params)
    let resolve
    const controller = installMaterialTexturePersistence(f.editor, params, { load: () => new Promise(done => { resolve = done }) })
    f.add(); f.service.complete(); const pending = controller.whenReady()
    f.editor.resetEditorStorage({ modelCores: [] }); const stale = new Texture(); let disposed = false; stale.addEventListener('dispose', () => { disposed = true }); resolve(stale)
    await pending; assert.equal(f.a.material.map, null); assert.equal(disposed, true)
    controller.dispose()
    const g = fixture(params); let finish
    const next = installMaterialTexturePersistence(g.editor, params, { load: () => new Promise(done => { finish = done }) })
    g.add(); g.service.complete(); const userMap = g.a.material.map = new Texture(); finish(new Texture()); await next.whenReady()
    assert.equal(g.a.material.map, userMap); next.dispose()
})

test('failed image load prevents saving partial restoration and retains the original map', async () => {
    const params = { modelCores: [entry(captureBaseColorTexture(imageTexture()))] }, f = fixture(params), original = f.a.material.map = new Texture()
    const controller = installMaterialTexturePersistence(f.editor, params, { load: async () => { throw new Error('image missing') }, onError() {} })
    f.add(); f.service.complete(); await assert.rejects(controller.whenReady(), /image missing/)
    assert.equal(f.a.material.map, original); assert.throws(() => f.editor.saveSceneEdit(), /尚未恢复|恢复失败/)
    controller.dispose()
})

test('completion composes with project load-state subscribers in either installation order', async () => {
    for (const stateFirst of [false, true]) {
        const params = { modelCores: [entry(null)] }, f = fixture(params)
        f.a.material.map = new Texture()
        const state = createProjectLoadState({ manager: { itemError() {} } }); state.begin(params)
        let controller
        if (stateFirst) { state.attach(f.editor); controller = installMaterialTexturePersistence(f.editor, params) }
        else { controller = installMaterialTexturePersistence(f.editor, params); state.attach(f.editor) }
        f.add(); f.service.complete(); await controller.whenReady()
        assert.equal(f.a.material.map, null); assert.equal(state.getStatus().ready, true)
        controller.dispose(); state.dispose()
    }
})

test('a failed old-project image request cannot poison the new project after reset', async () => {
    const params = { modelCores: [entry(captureBaseColorTexture(imageTexture()))] }, f = fixture(params)
    let reject
    const controller = installMaterialTexturePersistence(f.editor, params, { load: () => new Promise((_, fail) => { reject = fail }), onError() { assert.fail('stale error') } })
    f.add(); f.service.complete(); const old = controller.whenReady()
    f.editor.resetEditorStorage({ modelCores: [] })
    assert.doesNotThrow(() => f.editor.saveSceneEdit())
    reject(new Error('old failure')); await assert.rejects(old, /old failure/)
    assert.deepEqual(controller.getStatus(), { pending: 0, errors: [] }); assert.doesNotThrow(() => f.editor.saveSceneEdit())
    controller.dispose()
})
