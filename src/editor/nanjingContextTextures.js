import { RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, SRGBColorSpace, Vector3 } from 'three'

export const NANJING_CONTEXT_TEXTURE_TARGETS = Object.freeze([
  { name: '场地区块_近景建筑群_01', material: '场地_蓝灰玻璃', vertices: 2135, indices: 3561, kind: 'facade' },
  { name: '场地区块_近景建筑群_02', material: '场地_蓝灰玻璃', vertices: 2300, indices: 3906, kind: 'facade' },
  { name: '网格_停车设施_停车场入口石板路面_01', material: '停车_石板路面', vertices: 108, indices: 162, kind: 'parking' },
  { name: '网格_停车设施_停车场入口石板路面_02', material: '停车_石板路面', vertices: 60, indices: 90, kind: 'parking' },
  { name: '网格_停车设施_停车场入口石板路面_03', material: '停车_石板路面', vertices: 72, indices: 108, kind: 'parking' },
  { name: '网格_停车设施_停车场入口石板路面_04', material: '停车_石板路面', vertices: 56, indices: 84, kind: 'parking' }
].map(Object.freeze))
export const NANJING_CONTEXT_TEXTURE_DISTANT_TARGETS = Object.freeze([{"name":"中远景补楼_LL补齐_01","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"中远景补楼_LL补齐_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_LL补齐_03","material":"远景_蓝色玻璃","vertices":44,"indices":78,"kind":"distant"},{"name":"中远景补楼_LL补齐_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_LL补齐_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_LL补齐_06","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"中远景补楼_LL补齐_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_LL补齐_08","material":"远景_蓝色玻璃","vertices":44,"indices":78,"kind":"distant"},{"name":"中远景补楼_ML01_01","material":"远景_蓝色玻璃","vertices":30,"indices":48,"kind":"distant"},{"name":"中远景补楼_ML01_02","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"中远景补楼_ML01_03","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"中远景补楼_ML01_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML01_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML01_06","material":"远景_蓝色玻璃","vertices":44,"indices":78,"kind":"distant"},{"name":"中远景补楼_ML01_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML01_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML02_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML02_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML03_01","material":"远景_蓝色玻璃","vertices":44,"indices":78,"kind":"distant"},{"name":"中远景补楼_ML03_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML03_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML03_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_ML03_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR01_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR01_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR01_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR01_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR01_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR01_06","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_02","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"中远景补楼_MR02_03","material":"远景_蓝色玻璃","vertices":30,"indices":48,"kind":"distant"},{"name":"中远景补楼_MR02_04","material":"远景_蓝色玻璃","vertices":30,"indices":48,"kind":"distant"},{"name":"中远景补楼_MR02_05","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"中远景补楼_MR02_06","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_09","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_10","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR02_11","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_04","material":"远景_蓝色玻璃","vertices":44,"indices":78,"kind":"distant"},{"name":"中远景补楼_MR03_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_06","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"中远景补楼_MR03_08","material":"远景_蓝色玻璃","vertices":145,"indices":255,"kind":"distant"},{"name":"远景_建筑体块","material":"远景_蓝色玻璃","vertices":17641,"indices":28299,"kind":"distant"},{"name":"远景补楼_N01_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N01_02","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N01_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N01_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N01_05","material":"远景_蓝色玻璃","vertices":20,"indices":30,"kind":"distant"},{"name":"远景补楼_N01_06","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N01_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N01_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N01_09","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_N01_10","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N01_11","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N01_12","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N01_13","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N02_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N02_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N02_03","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_N02_04","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N02_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N02_06","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N02_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N02_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N02_09","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N03_01","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N03_02","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_N03_03","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N03_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N03_05","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N03_06","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N03_07","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N03_08","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N03_09","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N03_10","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N04_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N04_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N04_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N04_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N05_01","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N05_02","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_N05_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N05_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N05_05","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N05_06","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N05_07","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_N06_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_N06_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_01","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SE01_02","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE01_03","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE01_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_05","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SE01_06","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE01_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_09","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE01_10","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE01_11","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE01_12","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_13","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_14","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SE01_15","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE01_16","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE01_17","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE01_18","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SE01_19","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE01_20","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE01_21","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE01_22","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE02_01","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE02_02","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE02_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE02_04","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE02_05","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE02_06","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE02_07","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE02_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE03_01","material":"远景_蓝色玻璃","vertices":20,"indices":30,"kind":"distant"},{"name":"远景补楼_SE03_02","material":"远景_蓝色玻璃","vertices":20,"indices":30,"kind":"distant"},{"name":"远景补楼_SE03_03","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE03_04","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SE03_05","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SE03_06","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE03_07","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE03_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE03_09","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SE03_10","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SE04_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW01_01","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW01_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW01_03","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW01_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW01_05","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW01_06","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW01_07","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW01_08","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW02_01","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW02_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_01","material":"远景_蓝色玻璃","vertices":20,"indices":30,"kind":"distant"},{"name":"远景补楼_SW03_02","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW03_03","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW03_04","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW03_05","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW03_06","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SW03_07","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW03_08","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW03_09","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SW03_10","material":"远景_蓝色玻璃","vertices":20,"indices":30,"kind":"distant"},{"name":"远景补楼_SW03_11","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SW03_12","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_13","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW03_14","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_15","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_16","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_17","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_18","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_19","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"},{"name":"远景补楼_SW03_20","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW03_21","material":"远景_蓝色玻璃","vertices":20,"indices":30,"kind":"distant"},{"name":"远景补楼_SW03_22","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW03_23","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW04_01","material":"远景_蓝色玻璃","vertices":70,"indices":120,"kind":"distant"},{"name":"远景补楼_SW04_02","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW04_03","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW04_04","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW04_05","material":"远景_蓝色玻璃","vertices":40,"indices":66,"kind":"distant"},{"name":"远景补楼_SW04_06","material":"远景_蓝色玻璃","vertices":60,"indices":102,"kind":"distant"},{"name":"远景补楼_SW04_07","material":"远景_蓝色玻璃","vertices":80,"indices":138,"kind":"distant"}].map(Object.freeze))
const DISTANT_MEAN_RGB = Object.freeze([0.12340357686991073,0.12340357686991073,0.12340357686991073])
export const NANJING_CONTEXT_TEXTURE_PEDESTRIAN_TARGETS = Object.freeze([{"name":"外扩_街区06_曲线联络步道","material":"周边_步道_暖灰石材","vertices":966,"indices":1872,"kind":"pedestrian"},{"name":"街区06_人行铺装","material":"周边_步道_暖灰石材","vertices":5363,"indices":9045,"kind":"pedestrian"},{"name":"街区07_人行铺装","material":"周边_步道_暖灰石材","vertices":1578,"indices":2778,"kind":"pedestrian"},{"name":"外扩_街区08_曲线联络步道","material":"周边_步道_暖灰石材","vertices":640,"indices":1224,"kind":"pedestrian"},{"name":"街区08_人行铺装","material":"周边_步道_暖灰石材","vertices":4303,"indices":7281,"kind":"pedestrian"},{"name":"外扩_街区30_曲线联络步道","material":"周边_步道_暖灰石材","vertices":1580,"indices":3072,"kind":"pedestrian"},{"name":"街区30_人行铺装","material":"周边_步道_暖灰石材","vertices":5478,"indices":9258,"kind":"pedestrian"},{"name":"外扩_街区31_曲线联络步道","material":"周边_步道_暖灰石材","vertices":376,"indices":720,"kind":"pedestrian"},{"name":"街区31_人行铺装","material":"周边_步道_暖灰石材","vertices":3018,"indices":3954,"kind":"pedestrian"},{"name":"外扩_街区45_曲线联络步道","material":"周边_步道_暖灰石材","vertices":318,"indices":600,"kind":"pedestrian"},{"name":"街区45_人行铺装","material":"周边_步道_暖灰石材","vertices":767,"indices":1017,"kind":"pedestrian"},{"name":"外扩_街区46_曲线联络步道","material":"周边_步道_暖灰石材","vertices":764,"indices":1464,"kind":"pedestrian"},{"name":"街区46_人行铺装","material":"周边_步道_暖灰石材","vertices":20942,"indices":27312,"kind":"pedestrian"},{"name":"街区01_人行铺装","material":"周边_步道_暖灰石材","vertices":2496,"indices":4344,"kind":"pedestrian"},{"name":"街区02_人行铺装","material":"周边_步道_暖灰石材","vertices":670,"indices":1170,"kind":"pedestrian"},{"name":"街区03_人行铺装","material":"周边_步道_暖灰石材","vertices":70,"indices":120,"kind":"pedestrian"},{"name":"街区04_人行铺装","material":"周边_步道_暖灰石材","vertices":538,"indices":714,"kind":"pedestrian"},{"name":"街区05_人行铺装","material":"周边_步道_暖灰石材","vertices":1580,"indices":2712,"kind":"pedestrian"},{"name":"街区09_人行铺装","material":"周边_步道_暖灰石材","vertices":10148,"indices":17430,"kind":"pedestrian"},{"name":"街区10_人行铺装","material":"周边_步道_暖灰石材","vertices":5272,"indices":6852,"kind":"pedestrian"},{"name":"街区11_人行铺装","material":"周边_步道_暖灰石材","vertices":2223,"indices":3171,"kind":"pedestrian"},{"name":"街区12_人行铺装","material":"周边_步道_暖灰石材","vertices":1617,"indices":2079,"kind":"pedestrian"},{"name":"街区13_人行铺装","material":"周边_步道_暖灰石材","vertices":40,"indices":66,"kind":"pedestrian"},{"name":"街区14_人行铺装","material":"周边_步道_暖灰石材","vertices":348,"indices":606,"kind":"pedestrian"},{"name":"补塑_街区14_曲线联络步道","material":"周边_步道_暖灰石材","vertices":1108,"indices":2148,"kind":"pedestrian"},{"name":"街区15_人行铺装","material":"周边_步道_暖灰石材","vertices":481,"indices":831,"kind":"pedestrian"},{"name":"街区16_人行铺装","material":"周边_步道_暖灰石材","vertices":325,"indices":579,"kind":"pedestrian"},{"name":"街区17_人行铺装","material":"周边_步道_暖灰石材","vertices":160,"indices":282,"kind":"pedestrian"},{"name":"街区18_人行铺装","material":"周边_步道_暖灰石材","vertices":2844,"indices":4896,"kind":"pedestrian"},{"name":"街区19_人行铺装","material":"周边_步道_暖灰石材","vertices":305,"indices":543,"kind":"pedestrian"},{"name":"补塑_街区19_曲线联络步道","material":"周边_步道_暖灰石材","vertices":454,"indices":876,"kind":"pedestrian"},{"name":"街区20_人行铺装","material":"周边_步道_暖灰石材","vertices":1073,"indices":1431,"kind":"pedestrian"},{"name":"街区21_人行铺装","material":"周边_步道_暖灰石材","vertices":25,"indices":39,"kind":"pedestrian"},{"name":"街区22_人行铺装","material":"周边_步道_暖灰石材","vertices":539,"indices":957,"kind":"pedestrian"},{"name":"街区23_人行铺装","material":"周边_步道_暖灰石材","vertices":200,"indices":354,"kind":"pedestrian"},{"name":"街区24_人行铺装","material":"周边_步道_暖灰石材","vertices":185,"indices":327,"kind":"pedestrian"},{"name":"街区25_人行铺装","material":"周边_步道_暖灰石材","vertices":317,"indices":561,"kind":"pedestrian"},{"name":"街区26_人行铺装","material":"周边_步道_暖灰石材","vertices":235,"indices":417,"kind":"pedestrian"},{"name":"街区27_人行铺装","material":"周边_步道_暖灰石材","vertices":195,"indices":345,"kind":"pedestrian"},{"name":"街区28_人行铺装","material":"周边_步道_暖灰石材","vertices":290,"indices":516,"kind":"pedestrian"},{"name":"街区29_人行铺装","material":"周边_步道_暖灰石材","vertices":634,"indices":1074,"kind":"pedestrian"},{"name":"街区32_人行铺装","material":"周边_步道_暖灰石材","vertices":11063,"indices":18819,"kind":"pedestrian"},{"name":"街区33_人行铺装","material":"周边_步道_暖灰石材","vertices":10803,"indices":18699,"kind":"pedestrian"},{"name":"街区33_人行铺装_高地0","material":"周边_步道_暖灰石材","vertices":84,"indices":126,"kind":"pedestrian"},{"name":"街区33_人行铺装_高地2","material":"周边_步道_暖灰石材","vertices":371,"indices":633,"kind":"pedestrian"},{"name":"街区34_人行铺装","material":"周边_步道_暖灰石材","vertices":1089,"indices":1407,"kind":"pedestrian"},{"name":"街区35_人行铺装","material":"周边_步道_暖灰石材","vertices":5184,"indices":7236,"kind":"pedestrian"},{"name":"街区36_人行铺装","material":"周边_步道_暖灰石材","vertices":1501,"indices":1977,"kind":"pedestrian"},{"name":"街区37_人行铺装","material":"周边_步道_暖灰石材","vertices":392,"indices":684,"kind":"pedestrian"},{"name":"街区38_人行铺装","material":"周边_步道_暖灰石材","vertices":464,"indices":792,"kind":"pedestrian"},{"name":"街区39_人行铺装","material":"周边_步道_暖灰石材","vertices":1393,"indices":2319,"kind":"pedestrian"},{"name":"街区40_人行铺装","material":"周边_步道_暖灰石材","vertices":719,"indices":1059,"kind":"pedestrian"},{"name":"街区41_人行铺装","material":"周边_步道_暖灰石材","vertices":805,"indices":1113,"kind":"pedestrian"},{"name":"街区42_人行铺装","material":"周边_步道_暖灰石材","vertices":477,"indices":825,"kind":"pedestrian"},{"name":"街区43_统一标高地面_网格_1","material":"周边_步道_暖灰石材","vertices":1925,"indices":4131,"kind":"pedestrian"},{"name":"街区44_人行铺装","material":"周边_步道_暖灰石材","vertices":602,"indices":1050,"kind":"pedestrian"},{"name":"街区47_人行铺装","material":"周边_步道_暖灰石材","vertices":2693,"indices":3495,"kind":"pedestrian"},{"name":"街区48_人行铺装","material":"周边_步道_暖灰石材","vertices":1673,"indices":2199,"kind":"pedestrian"},{"name":"补塑_临河长带01_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":345,"indices":603,"kind":"pedestrian"},{"name":"补塑_临河长带01_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":2808,"indices":5154,"kind":"pedestrian"},{"name":"补塑_临河长带02_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":177,"indices":303,"kind":"pedestrian"},{"name":"补塑_临河长带03_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":308,"indices":558,"kind":"pedestrian"},{"name":"补塑_临河长带04_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":173,"indices":303,"kind":"pedestrian"},{"name":"补塑_北侧空地02_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":20,"indices":30,"kind":"pedestrian"},{"name":"补塑_北侧空地02_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":93,"indices":159,"kind":"pedestrian"},{"name":"补塑_北侧空地03_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":20,"indices":30,"kind":"pedestrian"},{"name":"补塑_北侧空地04_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":1185,"indices":2157,"kind":"pedestrian"},{"name":"补塑_北侧空地04_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":510,"indices":912,"kind":"pedestrian"},{"name":"补塑_北侧空地05_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":35,"indices":57,"kind":"pedestrian"},{"name":"补塑_北侧空地06_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":256,"indices":450,"kind":"pedestrian"},{"name":"补塑_北侧空地06_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":383,"indices":693,"kind":"pedestrian"},{"name":"补塑_北侧空地07_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":85,"indices":153,"kind":"pedestrian"},{"name":"补塑_北侧空地08_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":30,"indices":48,"kind":"pedestrian"},{"name":"补塑_原楼基座衔接_00","material":"周边_步道_暖灰石材","vertices":190,"indices":294,"kind":"pedestrian"},{"name":"补塑_原楼基座衔接_01","material":"周边_步道_暖灰石材","vertices":125,"indices":195,"kind":"pedestrian"},{"name":"补塑_原楼基座衔接_02","material":"周边_步道_暖灰石材","vertices":155,"indices":249,"kind":"pedestrian"},{"name":"补塑_原楼基座衔接_03","material":"周边_步道_暖灰石材","vertices":135,"indices":219,"kind":"pedestrian"},{"name":"补塑_原楼基座衔接_04","material":"周边_步道_暖灰石材","vertices":165,"indices":285,"kind":"pedestrian"},{"name":"补塑_河湾两岸01_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":25,"indices":39,"kind":"pedestrian"},{"name":"补塑_河湾两岸01_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":900,"indices":1638,"kind":"pedestrian"},{"name":"补塑_河湾两岸02_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":30,"indices":48,"kind":"pedestrian"},{"name":"补塑_河湾两岸03_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":195,"indices":351,"kind":"pedestrian"},{"name":"补塑_河湾两岸04_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":68,"indices":114,"kind":"pedestrian"},{"name":"补塑_河湾两岸04_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":55,"indices":87,"kind":"pedestrian"},{"name":"补塑_河湾两岸05_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":25,"indices":39,"kind":"pedestrian"},{"name":"补塑_河湾两岸05_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":15,"indices":21,"kind":"pedestrian"},{"name":"补塑_河湾两岸06_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":155,"indices":273,"kind":"pedestrian"},{"name":"补塑_河湾两岸07_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":580,"indices":1062,"kind":"pedestrian"},{"name":"补塑_河湾两岸07_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":125,"indices":219,"kind":"pedestrian"},{"name":"补塑_河湾两岸08_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":30,"indices":48,"kind":"pedestrian"},{"name":"补塑_河湾两岸09_原场地_人行铺装","material":"周边_步道_暖灰石材","vertices":55,"indices":87,"kind":"pedestrian"},{"name":"补塑_河湾两岸09_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":411,"indices":723,"kind":"pedestrian"},{"name":"补塑_河湾两岸10_原绿地_人行铺装","material":"周边_步道_暖灰石材","vertices":65,"indices":111,"kind":"pedestrian"},{"name":"西侧街区_连续人行铺地","material":"周边_步道_暖灰石材","vertices":6463,"indices":9963,"kind":"pedestrian"}].map(Object.freeze))
const DONORS = {
  pedestrian: { name: '道路_人行道路面_01', material: '远景_混凝土铺地', mean: .1990178531637707 },
  distant: { name: '远景_建筑体块', material: '远景_蓝色玻璃', mean: 0.12340357686991073 },
  facade: { name: '远景_建筑体块', material: '远景_蓝色玻璃', mean: .12340357686991073 },
  parking: { name: '道路_人行道路面_01', material: '远景_混凝土铺地', mean: .1990178531637707 }
}
const defaults = { version: 1, enabled: false, facadeStrength: .30, facadeWorldScale: .22, parkingStrength: .35, parkingWorldScale: 1.25 }
// Track editable values on both sides: generated texture copies must never be
// saved as source maps, but edits made through a panel bound to a copy are real.
const EDIT_FIELDS = ['color', 'emissive', 'specularColor', 'sheenColor', 'attenuationColor', 'normalScale', 'clearcoatNormalScale',
  'roughness', 'metalness', 'opacity', 'transparent', 'depthWrite', 'depthTest', 'alphaTest', 'side', 'shadowSide',
  'transmission', 'ior', 'thickness', 'attenuationDistance', 'envMapIntensity', 'emissiveIntensity', 'specularIntensity',
  'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness', 'iridescence', 'iridescenceIOR', 'iridescenceThicknessRange',
  'anisotropy', 'anisotropyRotation', 'bumpScale', 'aoMapIntensity', 'lightMapIntensity', 'normalMapType',
  'displacementScale', 'displacementBias', 'wireframe', 'toneMapped', 'vertexColors', 'alphaToCoverage', 'visible',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'premultipliedAlpha', 'forceSinglePass',
  'map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'lightMap', 'bumpMap',
  'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'anisotropyMap', 'envMap']
const editValue = value => value?.toArray ? value.toArray() : Array.isArray(value) ? value.slice() : value
const sameEdit = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b)
const editSnapshot = material => Object.fromEntries(EDIT_FIELDS.filter(key => key in material).map(key => [key, editValue(material[key])]))
function copyEdit(target, source, key) {
  if (!(key in target)) return
  if (target[key]?.copy && source[key]?.toArray) target[key].copy(source[key])
  else target[key] = Array.isArray(source[key]) ? source[key].slice() : source[key]
}
const excluded = object => object.userData?.nanjingUtility || object.userData?.skipEditorTree || object.isHelper
function visit(object, callback) {
  if (!object || excluded(object)) return
  callback(object)
  for (const child of object.children || []) visit(child, callback)
}
function normalize(value) {
  const next = { ...defaults, ...(value && typeof value === 'object' ? value : {}), version: 1,
    enabled: value?.version === 1 && value.enabled === true }
  if (next.facadeStyle !== undefined && next.facadeStyle !== 'light-grid-v1') throw new Error('场景纹理 facadeStyle 不支持')
  if (next.pedestrianStrength !== undefined && (!Number.isFinite(next.pedestrianStrength) || next.pedestrianStrength < 0 || next.pedestrianStrength > 1)) throw new Error('场景纹理 pedestrianStrength 须在 0–1 之间')
  if (next.scope !== undefined && next.scope !== 'near' && next.scope !== 'distant') throw new Error('场景纹理 scope 须为 near 或 distant')
  for (const key of ['facadeStrength', 'parkingStrength']) if (!Number.isFinite(next[key]) || next[key] < 0 || next[key] > 1) throw new Error(`场景纹理 ${key} 须在 0–1 之间`)
  for (const key of ['facadeWorldScale', 'parkingWorldScale']) if (!Number.isFinite(next[key]) || next[key] <= 0) throw new Error(`场景纹理 ${key} 须大于 0`)
  return next
}
function patchShader(shader, uniforms, kind, style) {
  if (shader.uniforms.nanjingContextTextureStrength) return true
  if (kind === 'distant' && !shader.fragmentShader.includes('#include <fog_fragment>')) return false
  for (const [text, token] of [[shader.vertexShader, '#include <common>'], [shader.vertexShader, '#include <project_vertex>'],
    [shader.fragmentShader, '#include <common>'], [shader.fragmentShader, '#include <map_fragment>']]) if (!text.includes(token)) return false
  const position = 'vNanjingContextTextureWorldPosition'
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 ${position};`)
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 nanjingContextTexturePosition = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        nanjingContextTexturePosition = batchingMatrix * nanjingContextTexturePosition;
      #endif
      #ifdef USE_INSTANCING
        nanjingContextTexturePosition = instanceMatrix * nanjingContextTexturePosition;
      #endif
      ${position} = ( modelMatrix * nanjingContextTexturePosition ).xyz;`)
  const uv = (kind === 'facade' || kind === 'distant') ? `
      vec3 nanjingContextDx = dFdx( ${position} );
      vec3 nanjingContextDy = dFdy( ${position} );
      vec3 nanjingContextPlane = cross( nanjingContextDx, nanjingContextDy );
      float nanjingContextLength = length( nanjingContextPlane );
      nanjingContextPlane /= max( nanjingContextLength, 1e-12 );
      // Use the geometric face, not interpolated shading normals. Canonical
      // orientation is stable on both front/back faces of transparent blocks.
      if ( abs( nanjingContextPlane.x ) >= abs( nanjingContextPlane.z ) ) {
        if ( nanjingContextPlane.x < 0.0 ) nanjingContextPlane = -nanjingContextPlane;
      } else if ( nanjingContextPlane.z < 0.0 ) nanjingContextPlane = -nanjingContextPlane;
      vec3 nanjingContextTangent = vec3( nanjingContextPlane.z, 0.0, -nanjingContextPlane.x );
      nanjingContextTangent /= max( length( nanjingContextTangent ), 1e-12 );
      vec2 nanjingContextUv = vec2( dot( ${position}, nanjingContextTangent ), ${position}.y ) * nanjingContextTextureWorldScale;
      vec2 nanjingContextUvDx = vec2( dot( nanjingContextDx, nanjingContextTangent ), nanjingContextDx.y ) * nanjingContextTextureWorldScale;
      vec2 nanjingContextUvDy = vec2( dot( nanjingContextDy, nanjingContextTangent ), nanjingContextDy.y ) * nanjingContextTextureWorldScale;
      float nanjingContextSurfaceWeight = nanjingContextLength > 1e-12 && abs( nanjingContextPlane.y ) < 0.5 ? 1.0 : 0.0;
    ` : `
      vec2 nanjingContextUv = ${position}.xz * nanjingContextTextureWorldScale;
      vec2 nanjingContextUvDx = dFdx( ${position}.xz ) * nanjingContextTextureWorldScale;
      vec2 nanjingContextUvDy = dFdy( ${position}.xz ) * nanjingContextTextureWorldScale;
      float nanjingContextSurfaceWeight = 1.0;
    `
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
    varying vec3 ${position};
    uniform float nanjingContextTextureStrength;
    uniform float nanjingContextTextureWorldScale;
    uniform float nanjingContextTextureMean;
    uniform vec3 nanjingContextTextureMeanRGB;`)
    .replace('#include <map_fragment>', `#ifdef USE_MAP
      ${uv}
      vec4 nanjingContextSample = texture2DGradEXT( map, nanjingContextUv, nanjingContextUvDx, nanjingContextUvDy );
      float nanjingContextGrain = dot( nanjingContextSample.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / nanjingContextTextureMean;
      diffuseColor.rgb *= mix( 1.0, nanjingContextGrain, nanjingContextTextureStrength * nanjingContextSurfaceWeight );
      // These source images are opaque; preserve the original material alpha.
    #endif`)

  if (kind === 'distant' && style === 'light-grid-v1') {
    // Analytic periodic-line coverage avoids aliasing from subpixel mullions.
    // Mean line coverage is 1 - .98 * .98 = .0396 at any window density.
    shader.fragmentShader = shader.fragmentShader.replace('uniform vec3 nanjingContextTextureMeanRGB;', `uniform vec3 nanjingContextTextureMeanRGB;
      float nanjingGridIntegral( float x ) { return floor( x ) * 0.02 + min( fract( x ), 0.02 ); }
      float nanjingGridCoverage( float center, float footprint ) {
        float width = max( footprint, 0.0001 );
        float c = fract( center ) + 0.01;
        return clamp( ( nanjingGridIntegral( c + width * 0.5 ) - nanjingGridIntegral( c - width * 0.5 ) ) / width, 0.0, 1.0 );
      }
      float nanjingPaneValue( vec2 cell ) { return fract( sin( dot( cell, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ) - 0.5; }`)
    const begin = shader.fragmentShader.indexOf('#ifdef USE_MAP\n'), endToken = '// These source images are opaque; preserve the original material alpha.\n    #endif'
    const end = shader.fragmentShader.indexOf(endToken, begin)
    if (begin < 0 || end < 0) return false
    shader.fragmentShader = shader.fragmentShader.slice(0, begin) + `#ifdef USE_MAP
      ${uv}
      // One pane is .25 world units wide and one floor is .35 high.
      vec2 nanjingGridCellSize = vec2( 0.25, 0.35 );
      vec2 nanjingGridCell = nanjingContextUv / nanjingContextTextureWorldScale / nanjingGridCellSize;
      vec2 nanjingGridDx = nanjingContextUvDx / nanjingContextTextureWorldScale / nanjingGridCellSize;
      vec2 nanjingGridDy = nanjingContextUvDy / nanjingContextTextureWorldScale / nanjingGridCellSize;
      vec2 nanjingGridFootprint = abs( nanjingGridDx ) + abs( nanjingGridDy );
      float nanjingGridX = nanjingGridCoverage( nanjingGridCell.x, nanjingGridFootprint.x );
      float nanjingGridY = nanjingGridCoverage( nanjingGridCell.y, nanjingGridFootprint.y );
      float nanjingGridFrame = 1.0 - ( 1.0 - nanjingGridX ) * ( 1.0 - nanjingGridY );
      float nanjingPaneVisibility = 1.0 - smoothstep( 0.2, 1.0, max( nanjingGridFootprint.x, nanjingGridFootprint.y ) );
      float nanjingPane = 1.0 + nanjingPaneValue( floor( nanjingGridCell ) ) * nanjingContextTextureStrength * 0.2 * nanjingPaneVisibility;
      float nanjingGridFactor = ( 1.0 - nanjingContextTextureStrength * nanjingGridFrame ) / max( 1.0 - nanjingContextTextureStrength * 0.0396, 0.0001 ) * nanjingPane;
      vec3 nanjingContextDistantAlbedo = nanjingContextTextureMeanRGB * mix( 1.0, nanjingGridFactor, nanjingContextSurfaceWeight );
      diffuseColor.rgb *= nanjingContextDistantAlbedo;
    #endif` + shader.fragmentShader.slice(end + endToken.length)
    if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) return false
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
      #ifdef USE_MAP
        totalEmissiveRadiance *= nanjingContextDistantAlbedo;
      #else
        totalEmissiveRadiance *= nanjingContextTextureMeanRGB;
      #endif
    #endif`)
  } else if (kind === 'distant') {
    // Replace the original colour/emission map terms once. Weak detail around
    // the baked image's RGB mean preserves its dark30 energy and grey tint.
    if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) return false
    shader.fragmentShader = shader.fragmentShader.replace(
      'diffuseColor.rgb *= mix( 1.0, nanjingContextGrain, nanjingContextTextureStrength * nanjingContextSurfaceWeight );',
      `vec3 nanjingContextDistantAlbedo = nanjingContextTextureMeanRGB * mix( vec3( 1.0 ), nanjingContextSample.rgb / nanjingContextTextureMeanRGB, nanjingContextTextureStrength );
      vec4 nanjingContextOriginalAlbedo = texture2D( map, vMapUv );
      diffuseColor.rgb *= mix( nanjingContextOriginalAlbedo.rgb, nanjingContextDistantAlbedo, nanjingContextSurfaceWeight );`)
      .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
      vec4 nanjingContextOriginalEmission = texture2D( emissiveMap, vEmissiveMapUv );
      #ifdef USE_MAP
        totalEmissiveRadiance *= mix( nanjingContextOriginalEmission.rgb, nanjingContextDistantAlbedo, nanjingContextSurfaceWeight );
      #else
        totalEmissiveRadiance *= nanjingContextOriginalEmission.rgb;
      #endif
      #endif`)
  }
  Object.assign(shader.uniforms, uniforms)
  return true
}

/** Exact source meshes, runtime-only texture copies. Old histories default
 * off. Save through withOriginals, then rebuild from contextTextures settings. */
export function createNanjingContextTextures(editor, config = {}, { onChange } = {}) {
  const scene = editor?.scene, ownedSources = new WeakMap()
  let settings = normalize(config.contextTextures), records = [], copies = new Set(), suspended = 0, pending = false, disposed = false, skipped = [], shaderErrors = 0, activeRestore = null
  function syncMaterialEdits() {
    if (disposed) return getStatus()
    for (const row of copies) {
      const sourceNow = editSnapshot(row.source), copyNow = editSnapshot(row.material)
      let changed = false
      for (const key of EDIT_FIELDS) {
        if (!(key in row.source)) continue
        const sourceChanged = !sameEdit(sourceNow[key], row.sourceValues[key])
        const copyChanged = !sameEdit(copyNow[key], row.copyValues[key])
        // A simultaneous source edit (including history restoration) wins.
        if (copyChanged && !sourceChanged) { copyEdit(row.source, row.material, key); row.source.needsUpdate = true; changed = true }
        else if (sourceChanged) changed = true
        if (key !== 'map') copyEdit(row.material, row.source, key)
      }
      // A map replacement must be re-evaluated against the original preset
      // guards. Keep the generated map separate from the user's source map.
      if (row.source.map !== row.sourceValues.map || row.material.map !== row.map
        || (row.kind === 'distant' && row.source.emissiveMap !== row.sourceValues.emissiveMap)) pending = true
      row.material.map = row.map
      if (changed) row.material.needsUpdate = true
      row.sourceValues = editSnapshot(row.source); row.copyValues = editSnapshot(row.material)
    }
    return getStatus()
  }
  function restoreMaterials() { for (const row of records) if (row.object.material === row.material) row.object.material = row.source }
  function attachMaterials() { for (const row of records) if (row.object.material === row.source) row.object.material = row.material }
  function sourceMaterialLists() {
    const plans = []
    scene?.traverse(root => {
      const previous = root.RootMaterials
      if (!Array.isArray(previous) || !previous.some(material => ownedSources.has(material))) return
      const hasDuplicates = new Set(previous).size !== previous.length, originals = new Set(previous), mapped = new Set(), next = []
      for (const material of previous) {
        const source = ownedSources.get(material)
        if (!source) { next.push(material); continue }
        if (!hasDuplicates && (originals.has(source) || mapped.has(source))) continue
        next.push(source); mapped.add(source)
      }
      root.RootMaterials = next; plans.push({ root, previous, next })
    })
    return () => { for (const { root, previous, next } of plans) if (root.RootMaterials === next) root.RootMaterials = previous }
  }
  function release() {
    restoreMaterials(); sourceMaterialLists()
    for (const row of copies) { row.map.dispose(); row.material.dispose() }
    records = []; copies.clear()
  }
  function refresh() {
    if (disposed) return getStatus()
    if (suspended) { pending = true; return getStatus() }
    syncMaterialEdits(); pending = false
    const hadRecords = records.length > 0
    restoreMaterials(); sourceMaterialLists()
    const previous = copies
    copies = new Set(); records = []; skipped = []
    if (settings.enabled && scene) {
      const names = new Map()
      visit(scene, object => { const list = names.get(object.name) || []; list.push(object); names.set(object.name, list) })
      const baseTargets = settings.scope === 'distant'
        ? [...NANJING_CONTEXT_TEXTURE_DISTANT_TARGETS, ...NANJING_CONTEXT_TEXTURE_TARGETS.filter(row => row.kind === 'parking')]
        : NANJING_CONTEXT_TEXTURE_TARGETS
      const targets = Number.isFinite(settings.pedestrianStrength) ? [...baseTargets, ...NANJING_CONTEXT_TEXTURE_PEDESTRIAN_TARGETS] : baseTargets
      const distantCopies = new Map()
      for (const target of targets) {
        const matches = names.get(target.name) || [], object = matches.length === 1 ? matches[0] : null, source = object?.material, geometry = object?.geometry
        const donorInfo = DONORS[target.kind], donors = names.get(donorInfo.name) || [], donor = donors.length === 1 ? donors[0].material : null
        if (!object?.isMesh || !source?.isMeshStandardMaterial || source.name !== target.material || object.isInstancedMesh || object.isSkinnedMesh
          || object.morphTargetInfluences?.length || geometry?.attributes.position?.count !== target.vertices || (geometry?.index?.count || 0) !== target.indices) {
          skipped.push({ name: target.name, reason: '对象或源几何版本不匹配' }); continue
        }
        if (!donor?.isMeshStandardMaterial || donor.name !== donorInfo.material || !donor.map?.isTexture) {
          skipped.push({ name: target.name, reason: '现有源贴图尚未加载' }); continue
        }
        if (target.kind === 'facade' && (!source.transparent || (source.transmission || 0) > 0)) {
          skipped.push({ name: target.name, reason: '保留已改为实体或透射模式的用户楼体材质' }); continue
        }
        if (target.kind !== 'distant' && source.map?.isTexture) {
          skipped.push({ name: target.name, reason: '保留用户设置的颜色贴图' }); continue
        }
        if (target.kind === 'distant' && (source.map?.textureUrl !== '/nanjing-restore/distant-glass-image5-dark30-7b570b17a0eb.png'
          || source.map.source !== donor.map.source || source.emissiveMap?.source !== donor.map.source)) {
          skipped.push({ name: target.name, reason: '保留已更换的远景颜色或发光贴图' }); continue
        }
        if ((target.kind === 'distant' || target.kind === 'pedestrian') && distantCopies.has(source)) {
          records.push({ object, source, material: distantCopies.get(source), kind: target.kind }); continue
        }
        const donorMap = target.kind === 'distant' ? source.map : donor.map
        const reusable = [...previous].find(row => row.source === source && row.kind === target.kind && (target.kind === 'distant' || target.kind === 'pedestrian' || row.object === object))
        const material = reusable?.material || source.clone()
        let map = reusable?.map
        if (!map || reusable.donorMap !== donorMap || reusable.donorVersion !== donorMap.version) {
          map?.dispose(); map = donorMap.clone()
          map.wrapS = map.wrapT = RepeatWrapping; map.colorSpace = SRGBColorSpace
          map.minFilter = LinearMipmapLinearFilter; map.magFilter = LinearFilter
          if (target.kind !== 'distant') { map.repeat.set(1, 1); map.offset.set(0, 0); map.rotation = 0; map.updateMatrix() }
          map.needsUpdate = true
        }
        material.map = map
        const settingKind = target.kind === 'distant' ? 'facade' : target.kind
        const scaleKind = target.kind === 'pedestrian' ? 'parking' : settingKind
        const uniforms = reusable?.uniforms || { nanjingContextTextureStrength: { value: settings[settingKind + 'Strength'] },
          nanjingContextTextureWorldScale: { value: settings[scaleKind + 'WorldScale'] }, nanjingContextTextureMean: { value: donorInfo.mean },
          nanjingContextTextureMeanRGB: { value: new Vector3(...DISTANT_MEAN_RGB) } }
        uniforms.nanjingContextTextureStrength.value = settings[settingKind + 'Strength']
        uniforms.nanjingContextTextureWorldScale.value = settings[scaleKind + 'WorldScale']
        const style = settings.facadeStyle
        material.onBeforeCompile = (shader, renderer) => { source.onBeforeCompile.call(source, shader, renderer); if (!patchShader(shader, uniforms, target.kind, style)) shaderErrors++ }
        material.customProgramCacheKey = () => `${source.customProgramCacheKey.call(source)}|nanjing-context-source-textures-v1-${target.kind}${style ? '|' + style : ''}${target.kind === 'distant' ? '|lighting-aware-v1' : ''}`
        if (!reusable || reusable.style !== style || reusable.map !== map) material.needsUpdate = true
        const copy = reusable || { object, source, material, kind: target.kind }
        Object.assign(copy, { map, donorMap, donorVersion: donorMap.version, uniforms, style,
          sourceValues: editSnapshot(source), copyValues: editSnapshot(material) })
        copies.add(copy)
        ownedSources.set(material, source); records.push({ object, source, material, kind: target.kind })
        if (target.kind === 'distant' || target.kind === 'pedestrian') distantCopies.set(source, material)
      }
      attachMaterials()
    }
    for (const row of previous) if (!copies.has(row)) { row.map.dispose(); row.material.dispose() }
    if (hadRecords || records.length) onChange?.(getStatus())
    return getStatus()
  }
  function update(patch = {}) { if (disposed) return getStatus(); const next = normalize({ ...settings, ...patch, version: 1 }); settings = next; config.contextTextures = structuredClone(next); return refresh() }
  function withOriginals(callback) {
    if (disposed) return callback()
    const outer = suspended === 0
    if (outer) syncMaterialEdits()
    suspended++
    if (outer) {
      restoreMaterials()
      try { activeRestore = sourceMaterialLists() }
      catch (error) { suspended--; attachMaterials(); throw error }
    }
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true; suspended--
      if (suspended || disposed) return
      const restore = activeRestore; activeRestore = null
      restore?.()
      syncMaterialEdits()
      if (pending) { pending = false; refresh() } else attachMaterials()
    }
    try { const result = callback(); if (result?.then) return Promise.resolve(result).finally(finish); finish(); return result }
    catch (error) { finish(); throw error }
  }
  function getStatus() { return { version: 1, active: !disposed && !suspended && records.length > 0, settings: { ...settings },
    objects: records.map(row => ({ name: row.object.name, kind: row.kind })), materials: records.length, skipped: skipped.slice(), shaderErrors,
    geometryChanged: false, originalUVChanged: false, imagePixelsChanged: false, materialAlphaChanged: false,
    facadeScope: settings.scope || 'near', facadeStyle: settings.facadeStyle || 'source-photo', distantColorMode: 'lighting-aware', privateMaterials: new Set(records.map(row => row.material)).size,
    mapping: { facade: 'geometric-face-world-projection, vertical faces only', parking: 'world-XZ' } } }
  function dispose() { if (disposed) return; syncMaterialEdits(); disposed = true; release() }
  refresh()
  return { refresh, update, syncMaterialEdits, withOriginals, withBaseline: withOriginals, getStatus, dispose, getOriginalMaterial: material => ownedSources.get(material) || material }
}
