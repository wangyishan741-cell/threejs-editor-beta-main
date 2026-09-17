const materialNameCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
    usage: 'sort',
    sensitivity: 'base',
    numeric: true,
})

export function getMaterialDisplayName(material) {
    return String(material?.name || '').trim() || material?.type || '未命名材质'
}

/** Sort a presentation copy only: saved material slots retain their original order. */
export function sortMaterialDisplay(items, getMaterial = (item) => item.material || item) {
    return items.map((item, index) => ({ item, index }))
        .sort((a, b) => materialNameCollator.compare(
            getMaterialDisplayName(getMaterial(a.item)),
            getMaterialDisplayName(getMaterial(b.item)),
        ) || a.index - b.index)
        .map(({ item }) => item)
}
