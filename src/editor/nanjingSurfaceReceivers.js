// Audited static surfaces in nanjing-0911-36c1aee71981.glb. This is a draw-only
// receiver policy: it does not change material appearance, geometry or shadows.
const groundMaterials = new Set([
  "场地_混凝土面",
  "场地_绿化铺地",
  "场地_浅色铺装",
  "场地_浅色石材",
  "场地_深灰立面",
  "道路_景观石材",
  "道路_浅色铺装",
  "道路_人行道混凝土_A",
  "道路_人行道混凝土_B",
  "道路_人行道混凝土_C",
  "道路_深灰路面",
  "道路_棕色路面",
  "停车_石板包边",
  "停车_石板路面",
  "远景_混凝土铺地",
  "远景_沥青路面",
  "远景_绿化底板",
  "周边_步道_暖灰石材",
  "周边_草坪_灰橄榄绿",
  "周边_草坪_深绿",
  "周边_草坪_鼠尾草绿",
  "周边_路缘_浅暖灰",
  "周边_广场_灰褐石材",
  "建筑_黑色哑光",
  "道路_支路路面",
  "地库入口_石材贴图",
  "停车_减速带棕",
  "景观_花坛黑色金属",
  "景观_花坛棕色",
  "景观_花坛红褐色",
  "景观_花坛深蓝",
  "景观_花坛暖棕"
])
const buildingMaterials = new Set([
  "建筑_屋面混凝土",
  "建筑_楼层混凝土",
  "建筑_屋顶设备涂层",
  "建筑_蓝灰玻璃",
  "建筑_深灰金属框",
  "建筑_深灰金属框.003",
  "建筑_立面玻璃",
  "建筑_通透玻璃",
  "建筑_黑色哑光",
  "建筑_黑色金属",
  "建筑_深灰金属",
  "建筑_a4外层介电玻璃",
  "建筑_深灰亮面金属",
  "建筑_低粗糙玻璃",
  "建筑_浅蓝玻璃",
  "建筑_a2外层介电玻璃",
  "建筑_a3外层介电玻璃",
  "停车_石板路面",
  "门牌_浅色石材",
  "门牌_橙黄发光字",
  "门牌_铜色标志",
  "地库入口_蓝灰玻璃",
  "地库入口_暗灰金属",
  "地库入口_橙色标识",
  "地库入口_中灰金属",
  "地库入口_石材贴图",
  "地库入口_蓝色门牌",
  "地库入口_深灰门牌",
  "场地_蓝灰玻璃",
  "停车_栏杆棕灰",
  "建筑_镜面玻璃",
  "建筑_格栅涂层"
])
const separateRoofDevices = new Set(['Cube', 'Cube_016'])
const entryOwners = new Set(['Line211', 'Line211032', 'Line211064'])
const entryParts = new Map([
  ['Mesh221', '1Steel Painted black'],
  ['Mesh221_1', 'metall'],
  ['Mesh221_2', 'Glass door.002'],
  ['Mesh221_3', 'Material 27'],
  ['Mesh221_4', 'Iron brushed'],
  ['Mesh221_5', 'Architectural Glass']
])
const streetFurnitureName = /^(?:(?:街区\d+|西侧)_(?:木坐凳|坐凳基座|廊架木格栅|廊架立柱)\d*|(?:外扩_街区\d+|遗漏补塑_(?:街区|北侧空地|河湾两岸|临河长带)\d+)_坐凳\d+_(?:坐面|基座))$/

export function nanjingStaticSurfaceReceiverKind(material, object) {
  if (!object?.isMesh || object.isInstancedMesh || object.isBatchedMesh || object.isSkinnedMesh
    || object.morphTargetInfluences?.length || !material?.isMeshStandardMaterial
    || material.alphaHash || material.alphaTest > 0 || material.isShaderMaterial || material.isRawShaderMaterial) return null
  const geometry = object.geometry
  if (!geometry?.isBufferGeometry || !geometry.attributes?.position || !geometry.attributes?.normal
    || Object.keys(geometry.morphAttributes || {}).length) return null
  let buildingOwner = false, farOwner = false, separateRoofOwner = false
  for (let node = object; node; node = node.parent) {
    if (node.userData?.nanjingUtility || node.isHelper || node.isTransformControlsRoot
      || node.type?.endsWith('Helper')) return null
    if (/^a[1-4]/.test(node.name) || /^场地区块_近景建筑群_\d+$/.test(node.name)
      || /^(?:地下停车设施_地下停车场入口|停车设施_停车场入口栏杆_|园区门牌_)/.test(node.name)) buildingOwner = true
    if (node.name === '远景_建筑体块' || /^(?:中)?远景补楼_(?:[A-Z]+\d+|LL补齐)_\d+$/.test(node.name)) farOwner = true
    if (separateRoofDevices.has(node.name)) separateRoofOwner = true
  }
  if (buildingOwner && buildingMaterials.has(material.name)) return 'building'
  if (farOwner && material.name === '远景_蓝色玻璃') return 'building'
  if (separateRoofOwner && material.name === '建筑_屋顶设备涂层') return 'building'
  // This original static leisure plane is visible through the near buildings.
  // Keep the receiver policy tied to its exact source pair, not all water.
  if (object.name === '远景_休闲区域' && material.name === '远景_浅蓝水面') return 'ground'
  if (object.name === '周边深化_bay' && material.name === '周边深化_立面分区') return 'building'
  if (entryOwners.has(object.parent?.name) && entryParts.get(object.name) === material.name) return 'building'
  if (streetFurnitureName.test(object.name)
    && ((/(?:木坐凳|廊架木格栅)\d*$|_坐面$/.test(object.name) && material.name === '周边_座椅_暖木色')
      || (/(?:坐凳基座|廊架立柱)\d*$|_基座$/.test(object.name) && material.name === '周边_设施_石墨灰'))) return 'ground'
  if (/^道路灯具母版_交通信号灯_模型(?:_\d+)?$/.test(object.name) && material.name === '建筑_深灰金属') return 'ground'
  if (/^道路灯具母版_道路灯_模型(?:_\d+)?$/.test(object.name) && material.name === '灯具_发光灯罩') return 'ground'
  return groundMaterials.has(material.name) ? 'ground' : null
}
