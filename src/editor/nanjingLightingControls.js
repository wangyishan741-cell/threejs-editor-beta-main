const SUN_NAME = '灯光_总览_03'
const LIMITS = { sunIntensity: [0, 100], ambientIntensity: [0, 10], exposure: [.01, 10] }
const isUtility = object => {
    for (let node = object; node; node = node.parent) {
        if (node.userData?.nanjingUtility || node.userData?.nanjingInstancing || node.isHelper) return true
    }
    return false
}

function findSun(editor) {
    const directional = []
    editor?.scene?.traverse?.(object => {
        if (object.isDirectionalLight && !isUtility(object)) directional.push(object)
    })
    const named = directional.filter(light => light.name === SUN_NAME)
    if (named.length === 1) return named[0]
    if (named.length > 1) return null
    const shadowLights = directional.filter(light => light.castShadow === true)
    return shadowLights.length === 1 ? shadowLights[0] : null
}

/** These controls expose the existing restored lighting; opening a panel never
 * creates an ambient/sun light or changes the sky and material colours. */
export function readNanjingLightingControls(editor) {
    const sun = findSun(editor)
    return {
        sunIntensity: Number.isFinite(sun?.intensity) ? sun.intensity : 0,
        sunAvailable: !!sun,
        ambientIntensity: Number.isFinite(editor?.scene?.environmentIntensity) ? editor.scene.environmentIntensity : 1,
        exposure: Number.isFinite(editor?.renderer?.toneMappingExposure) ? editor.renderer.toneMappingExposure : 1,
    }
}

/** Validate the entire patch before applying any field. The restore host owns
 * render invalidation and recording these values in its normal save pipeline. */
export function updateNanjingLightingControls(editor, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('光照参数须为对象')
    for (const [key, value] of Object.entries(patch)) {
        const range = LIMITS[key]
        if (!range) throw new TypeError(`未知光照参数：${key}`)
        if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
            throw new RangeError(`${key} 须在 ${range[0]}–${range[1]} 之间`)
        }
    }
    const sun = Object.hasOwn(patch, 'sunIntensity') ? findSun(editor) : null
    if (Object.hasOwn(patch, 'sunIntensity') && !sun) throw new Error('未找到唯一主日光，请检查“灯光_总览_03”或唯一投影方向光')
    if (Object.hasOwn(patch, 'ambientIntensity') && !editor?.scene) throw new Error('场景尚未准备好')
    if (Object.hasOwn(patch, 'exposure') && !editor?.renderer) throw new Error('渲染器尚未准备好')
    if (Object.hasOwn(patch, 'sunIntensity')) sun.intensity = patch.sunIntensity
    if (Object.hasOwn(patch, 'ambientIntensity')) editor.scene.environmentIntensity = patch.ambientIntensity
    if (Object.hasOwn(patch, 'exposure')) editor.renderer.toneMappingExposure = patch.exposure
    return readNanjingLightingControls(editor)
}
