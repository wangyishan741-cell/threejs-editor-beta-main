import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Group, DirectionalLight, AmbientLight, Color } from 'three'
import { readNanjingLightingControls, updateNanjingLightingControls } from '../src/editor/nanjingLightingControls.js'

function fixture() {
    const scene = new Scene(), sun = new DirectionalLight('#d1e4f9', 13.6), fill = new DirectionalLight('#ffeedd', 4), ambient = new AmbientLight('#8899aa', .2)
    sun.name = '灯光_总览_03'; sun.castShadow = true; fill.castShadow = true
    scene.add(sun, fill, ambient); scene.environmentIntensity = .85; scene.background = new Color('#8cc8ee')
    return { editor: { scene, renderer: { toneMappingExposure: 1.23 } }, scene, sun, fill, ambient }
}

test('reads restored main sun, environment and exposure without changing the scene', () => {
    const f = fixture(), objects = f.scene.children.slice(), sky = f.scene.background.clone(), color = f.sun.color.clone()
    assert.deepEqual(readNanjingLightingControls(f.editor), { sunIntensity: 13.6, sunAvailable: true, ambientIntensity: .85, exposure: 1.23 })
    assert.deepEqual(f.scene.children, objects); assert.ok(f.scene.background.equals(sky)); assert.ok(f.sun.color.equals(color))
})

test('changes only supplied fields and preserves light colours, shadows, other lights and sky', () => {
    const f = fixture(), color = f.sun.color.clone(), sky = f.scene.background.clone(), objects = f.scene.children.slice()
    updateNanjingLightingControls(f.editor, { ambientIntensity: 0 })
    assert.equal(f.scene.environmentIntensity, 0); assert.equal(f.sun.intensity, 13.6); assert.equal(f.editor.renderer.toneMappingExposure, 1.23)
    updateNanjingLightingControls(f.editor, { sunIntensity: 21.25, exposure: 1.7 })
    assert.equal(f.sun.intensity, 21.25); assert.equal(f.editor.renderer.toneMappingExposure, 1.7)
    assert.equal(f.fill.intensity, 4); assert.equal(f.ambient.intensity, .2); assert.equal(f.sun.castShadow, true)
    assert.ok(f.sun.color.equals(color)); assert.ok(f.scene.background.equals(sky)); assert.deepEqual(f.scene.children, objects)
})

test('fallback requires a unique non-utility shadow-casting directional light', () => {
    const f = fixture(); f.sun.name = '自定义日光'; f.fill.castShadow = false
    const utility = new Group(), utilitySun = new DirectionalLight()
    utility.userData.nanjingUtility = true; utilitySun.name = '灯光_总览_03'; utilitySun.castShadow = true; utility.add(utilitySun); f.scene.add(utility)
    assert.equal(readNanjingLightingControls(f.editor).sunAvailable, true)
    updateNanjingLightingControls(f.editor, { sunIntensity: 5 }); assert.equal(f.sun.intensity, 5); assert.equal(utilitySun.intensity, 1)
    f.fill.castShadow = true
    assert.equal(readNanjingLightingControls(f.editor).sunAvailable, false)
    assert.throws(() => updateNanjingLightingControls(f.editor, { sunIntensity: 6 }), /唯一主日光/)
    assert.equal(f.sun.intensity, 5); assert.equal(f.fill.intensity, 4)
})

test('missing or ambiguous main sun disables only sunlight; environment/exposure can still be edited', () => {
    const f = fixture(), second = new DirectionalLight(); second.name = '灯光_总览_03'; f.scene.add(second)
    assert.deepEqual(readNanjingLightingControls(f.editor), { sunIntensity: 0, sunAvailable: false, ambientIntensity: .85, exposure: 1.23 })
    updateNanjingLightingControls(f.editor, { exposure: .01, ambientIntensity: 10 })
    assert.equal(f.editor.renderer.toneMappingExposure, .01); assert.equal(f.scene.environmentIntensity, 10)
    f.scene.remove(f.sun, f.fill, second)
    assert.equal(readNanjingLightingControls(f.editor).sunAvailable, false)
})

test('validates all parameters atomically, including unknown keys and unsupported render targets', () => {
    const f = fixture()
    for (const patch of [{ sunIntensity: 101 }, { sunIntensity: -1 }, { ambientIntensity: 10.1 }, { exposure: 0 }, { exposure: NaN }, { skyColor: '#ffffff' }, null, []]) {
        assert.throws(() => updateNanjingLightingControls(f.editor, patch))
    }
    assert.throws(() => updateNanjingLightingControls(f.editor, { sunIntensity: 12, exposure: Infinity }))
    assert.equal(f.sun.intensity, 13.6)
    assert.throws(() => updateNanjingLightingControls({ scene: f.scene }, { sunIntensity: 1, exposure: 1 }))
    assert.equal(f.sun.intensity, 13.6)
    updateNanjingLightingControls(f.editor, { sunIntensity: 100, ambientIntensity: 0, exposure: 10 })
    assert.equal(f.sun.intensity, 100)
})
