import { TextureLoader, SRGBColorSpace } from 'three'
import { collectMaterialGroups } from './materialGroups.js'

const slots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap',
    'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularColorMap', 'specularIntensityMap']
const channelNames = { map: '基础色', normalMap: '法线', emissiveMap: '自发光', roughnessMap: '粗糙度', metalnessMap: '金属度', alphaMap: '透明度' }
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const stableUrl = value => typeof value === 'string' && /^(data:image\/|https?:\/\/|\.?\.?\/)/i.test(value)
export const LOCAL_TEXTURE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp'

export function textureImageSize(texture) {
    const image = texture?.image
    return { width: image?.naturalWidth || image?.videoWidth || image?.width || 0,
        height: image?.naturalHeight || image?.videoHeight || image?.height || 0 }
}

export function collectProjectTextures(editor) {
    const byTexture = new Map()
    for (const record of collectMaterialGroups(editor?.scene)) {
        const material = editor.getNanjingSourceMaterial?.(record.material) || record.material
        for (const slot of slots) {
            const texture = material[slot]
            if (!texture?.isTexture || texture.isCubeTexture || texture.isDataTexture || texture.isCompressedTexture || texture.isVideoTexture) continue
            let item = byTexture.get(texture)
            if (!item) {
                item = { texture, name: texture.name || `${material.name || '未命名材质'} · ${channelNames[slot] || slot}`, usages: [] }
                byTexture.set(texture, item)
            }
            const usage = `${material.name || '未命名材质'} / ${channelNames[slot] || slot}`
            if (!item.usages.includes(usage)) item.usages.push(usage)
        }
    }
    return [...byTexture.values()].sort((a, b) => collator.compare(a.name, b.name) || a.texture.id - b.texture.id)
}

export function drawTexturePreview(texture, canvas, maxSize = 256) {
    const { width, height } = textureImageSize(texture)
    if (!width || !height || !texture.image || texture.isCompressedTexture || texture.isCubeTexture) return false
    const scale = Math.min(1, maxSize / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    try {
        const context = canvas.getContext('2d')
        if (!context) return false
        context.drawImage(texture.image, 0, 0, canvas.width, canvas.height)
        return true
    } catch { return false }
}

// A changed map needs its own durable image reference. An embedded GLB bitmap
// without a URL otherwise reopens as the old map at the destination slot.
export function durableTextureUrl(texture, { createCanvas = () => document.createElement('canvas') } = {}) {
    for (const url of [texture?.textureUrl, texture?.image?.currentSrc, texture?.image?.src]) if (stableUrl(url)) return url
    const { width, height } = textureImageSize(texture)
    if (!width || !height) throw new Error('贴图尚未加载完成，请稍后重试')
    const canvas = createCanvas()
    if (!drawTexturePreview(texture, canvas, Math.max(width, height))) throw new Error('这张贴图暂不支持更换，请从本地导入 PNG、JPG 或 WebP 图片')
    try {
        const url = canvas.toDataURL('image/png')
        if (!url.startsWith('data:image/')) throw new Error('empty image')
        return url
    } catch { throw new Error('此贴图禁止读取图片数据，请改用本地原图') }
}

export function createBaseColorTexture(source, previous, { flipY = true, url = durableTextureUrl(source) } = {}) {
    if (!source?.isTexture || source.isCubeTexture || source.isCompressedTexture || source.isVideoTexture || !stableUrl(url)) throw new Error('请选择可保存的二维图片贴图')
    const texture = source.clone()
    texture.name = source.name || '基础色贴图'
    texture.textureUrl = url; texture.textureType = 'image'
    texture.colorSpace = SRGBColorSpace
    if (previous?.isTexture) {
        for (const key of ['channel', 'wrapS', 'wrapT', 'rotation', 'matrixAutoUpdate', 'anisotropy', 'flipY']) texture[key] = previous[key]
        for (const key of ['repeat', 'offset', 'center', 'matrix']) texture[key].copy(previous[key])
    } else texture.flipY = flipY
    texture.needsUpdate = true
    return texture
}

export function baseColorFlipY(record) {
    if (record.material?.map?.isTexture) return record.material.map.flipY
    for (let object = record.mesh; object; object = object.parent) {
        if (/^(gltf|glb)$/i.test(object.modelInfo?.type || '')) return false
    }
    const inherited = slots.map(key => record.material?.[key]).find(texture => texture?.isTexture)
    return inherited?.flipY ?? true
}

export async function loadLocalBaseColorTexture(file, { read = readFileDataUrl, load = url => new TextureLoader().loadAsync(url) } = {}) {
    if (!file || !/^image\/(png|jpe?g|webp|avif|gif|bmp)$/i.test(file.type)) throw new Error('请选择 PNG、JPG、WebP、AVIF、GIF 或 BMP 图片')
    if (!file.size || file.size > 32 * 1024 * 1024) throw new Error('请选择不超过 32 MB 的图片')
    const url = await read(file)
    const texture = await load(url)
    texture.name = file.name; texture.textureUrl = url; texture.textureType = 'image'
    texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true
    return texture
}

export async function loadProjectBaseColorTexture(source, { getUrl = durableTextureUrl, load = url => new TextureLoader().loadAsync(url) } = {}) {
    const url = getUrl(source)
    // Decode as an ordinary image: ImageBitmap uploads ignore flipY, so simply
    // sharing a GLB bitmap produces different orientation after the next reload.
    const texture = await load(url)
    texture.name = source.name || '工程贴图'; texture.textureUrl = url; texture.textureType = 'image'
    texture.colorSpace = SRGBColorSpace
    return texture
}

function readFileDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('图片读取失败，请重新选择'))
        reader.onabort = () => reject(new Error('图片读取已取消'))
        reader.readAsDataURL(file)
    })
}

export function assignBaseColorTexture(editor, record, texture) {
    if (!collectMaterialGroups(editor?.scene).some(item => item.material === record.material)) throw new Error('此材质已不在当前场景中，请重新选择材质')
    const source = editor.getNanjingSourceMaterial?.(record.material) || record.material
    if (!('map' in source)) throw new Error('当前材质不支持基础色贴图')
    // Keep both sides in sync before the render request rebuilds cached batches.
    // Other materials that share the former image are deliberately untouched.
    source.map = texture; source.needsUpdate = true
    record.material.map = texture; record.material.needsUpdate = true
    source.userData.baseColorTextureEdited = true
    record.material.userData.baseColorTextureEdited = true
    for (const usage of record.usages || [{ mesh: record.mesh }]) for (let object = usage.mesh; object; object = object.parent) {
        if (object.editorType === 'isModelGroup') {
            object.modelConfig ||= {}
            object.modelConfig.isSaveMaterials = true
        }
    }
    return source
}
