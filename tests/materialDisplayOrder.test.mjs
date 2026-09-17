import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three'
import { collectMaterialGroups } from '../src/editor/materialGroups.js'
import { getMaterialDisplayName, sortMaterialDisplay } from '../src/editor/materialDisplayOrder.js'

function material(name) {
    return new MeshStandardMaterial({ name })
}

test('A–Z ordering is case insensitive and numeric without mutating saved slots', () => {
    const savedSlots = ['Zinc', 'wood10', 'aluminum', 'Wood2', 'brick'].map(material)
    const original = [...savedSlots]
    const display = sortMaterialDisplay(savedSlots)
    assert.deepEqual(display.map((item) => item.name), ['aluminum', 'brick', 'Wood2', 'wood10', 'Zinc'])
    assert.notEqual(display, savedSlots)
    assert.deepEqual(savedSlots, original)
    display.forEach((item) => assert.ok(savedSlots.includes(item)))
})

test('Chinese names use pinyin order and unnamed materials use their displayed fallback', () => {
    const items = ['石材', '木材', '玻璃', '白墙'].map(material)
    assert.deepEqual(sortMaterialDisplay(items).map((item) => item.name), ['白墙', '玻璃', '木材', '石材'])
    assert.equal(getMaterialDisplayName(material('  ')), 'MeshStandardMaterial')
    assert.equal(getMaterialDisplayName({}), '未命名材质')
})

test('selection cannot shuffle equal names; shared resources and independent duplicates remain distinct', () => {
    const scene = new Scene(), root = new Group(), geometry = new BoxGeometry()
    const first = material('Brick'), second = material('brick'), third = material('Brick')
    const meshes = [first, second, third, first].map((item) => new Mesh(geometry, item))
    root.add(...meshes); scene.add(root)
    root.RootMaterials = [third, first, second]
    const savedSlots = root.RootMaterials
    const original = [...savedSlots]
    for (const selected of [null, meshes[0], meshes[1], meshes[2], root]) {
        const display = sortMaterialDisplay(collectMaterialGroups(scene, selected))
        assert.deepEqual(display.map((record) => record.material), [first, second, third])
        assert.equal(new Set(display.map((record) => record.material.uuid)).size, 3)
        assert.equal(display[0].usages.length, 2)
        assert.equal(display[0].meshCount, 2)
        assert.equal(root.RootMaterials, savedSlots)
        assert.deepEqual(savedSlots, original)
    }
})

test('renaming changes display position while preserving the selected resource identity and mesh slots', () => {
    const scene = new Scene(), root = new Group(), geometry = new BoxGeometry()
    const target = material('Zinc'), other = material('Brick')
    const mesh = new Mesh(geometry, [other, target])
    root.add(mesh); scene.add(root)
    root.RootMaterials = [other, target]
    const originalUUID = target.uuid, originalMeshSlots = mesh.material, savedSlots = root.RootMaterials
    assert.equal(sortMaterialDisplay(collectMaterialGroups(scene))[1].material, target)
    target.name = 'Aluminum'
    const display = sortMaterialDisplay(collectMaterialGroups(scene))
    assert.equal(display[0].material, target)
    assert.equal(display.find((record) => record.material.uuid === originalUUID).material, target)
    assert.equal(mesh.material, originalMeshSlots)
    assert.deepEqual(mesh.material, [other, target])
    assert.equal(root.RootMaterials, savedSlots)
    assert.deepEqual(savedSlots, [other, target])
})
