# 南京水面细波纹材质

实现：`src/editor/nanjingWaterSurface.js`。目标限定为唯一的 `远景_休闲区域` 网格、`远景_浅蓝水面` 材质及 409 顶点 / 1023 索引的源几何。重复对象名、不同几何版本、实例、蒙皮和辅助对象均跳过。

## 外观与成本

- 保留源颜色；显示材质将金属度降为 0、IOR 设为 1.333、粗糙度设为 0.27，环境反射强度为 0.75。源模型的 `specularColor` 是黑色；显示副本将其恢复为白色，使非金属水面仍有正确的低强度介电反射。
- 程序生成一张可重复的 256×256 RGBA 法线方向纹理，以两个方向 / 比例在世界 XZ 平面采样。16 个方向不同的周期波叠加避免单一规则条纹。GPU mipmap 过滤减少远处闪烁。
- 默认 `rippleScale: 0.65`，`rippleStrength: 0.22`。纹理周期为 `1 / rippleScale` 个世界单位；周期内含多个细波。强度为 0 时法线扰动归零。
- 不改变顶点、索引、UV、原图或透明度；不增加反射相机、传输、额外渲染 pass 或 draw call。不运行持续动画 / 定时器。仅增加水面片元的两次小纹理采样。
- 基础纹理 CPU / GPU 数据各 256 KiB；GPU 自动 mipmap 链约 341 KiB。纹理首次启用时生成一次，refresh 复用，dispose 释放。
- 目标有少量竖直边缘，按世界法线 Y 分量渐弱波纹，避免在边缘上出现不合理的水波。
- 这是一种依赖现有环境光照的微表面水材质，不产生实时平面倒影。静态波纹保证空闲视图不因水面连续重绘。

## 配置

```js
waterSurface: {
  version: 1,
  enabled: true,
  rippleScale: 0.65,
  rippleStrength: 0.22,
  metalness: 0,
  roughness: 0.27,
  envMapIntensity: 0.75,
  ior: 1.333,
  specularIntensity: 1
}
```

没有配置及未知版本均保持旧工程原貌。调用 `update({ enabled: true })` 或将上述配置加入当前外观预设才启用。普通源材质编辑和显示副本编辑均会同步；若同时编辑同一字段，源材质优先。材质面板对上述默认覆盖字段的修改以 `materialOverrides` 保存，避免 refresh 还原用户修改；通过水面设置重设这些字段时可同时传入 `materialOverrides: {}` 清除覆盖。

程序纹理仅绑定自定义 shader uniform，不赋值到 `material.normalMap`，不会干扰材质面板自选的法线贴图或保存图片。源法线贴图先完成原 Three.js 法线计算，再叠加波纹。

## 接入现有编辑器

```js
import { createNanjingWaterSurface } from './nanjingWaterSurface.js'
state.waterSurface = baseline ? null : createNanjingWaterSurface(editor, config, {
  onChange: invalidateRender
})
```

1. 将 `waterSurface` 纳入现有 `contextTextures / facadeFrameFinish / internalRoadSurfaces` 配置捕获、源材质解析、材质同步和场景 refresh 链。
2. 应用新外观、模型重载及退出时按同类模块调用 dispose / recreate。不能只替换 config 引用而保留持有旧 config 的 controller。
3. 保存链需加入 `state.waterSurface.withOriginals(next)`；此函数在保存回调期间恢复原材质、同步 `RootMaterials`，支持异步、嵌套和异常恢复。
4. `getOriginalMaterial(material)` 用于所有在保存包装外运行的配置捕获和材质面板源材质解析。
5. 给公共诊断添加 `waterSurface: state.waterSurface?.getStatus()`。`shaderErrors` 必须为 0；这是目标 shader chunk 不匹配的计数，不是 GPU 驱动编译结果。
6. 不需要添加动画帧回调。仅设置更新通过 `onChange` 请求重绘。
7. `withBaseline` 与 `withOriginals` 相同，可用于原水面对比截图。

API：`refresh / update / syncMaterialEdits / withOriginals / withBaseline / getOriginalMaterial / getStatus / dispose`。

## 验证

```powershell
node --check src/editor/nanjingWaterSurface.js
node --test tests/nanjingWaterSurface.test.mjs
```

自动化覆盖 10 项：旧版本兼容、精确目标限制、共享源材质隔离、几何和颜色保留、编辑同步、保存 / 重开、嵌套异步和失败恢复、关停释放、shader hook 兼容、纹理确定性和预算。

实际编辑器集成后仍需验证：WebGL shader 编译无错误、原视角的高光由大片白斑变成克制的细碎反光、远近视角无明显摩尔纹、保存重开仍启用、关闭水面开关恢复源材质。自动化测试本身不宣称完成 GPU 渲染或人工视觉验收。
