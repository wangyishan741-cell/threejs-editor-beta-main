# JSON + GLB Preview

这个小工程放在 D 盘当前仓库里，用来验证编辑器导出的 JSON 和 GLB/GLTF 模型引用是否能正常加载。

## 运行

在仓库根目录执行：

```powershell
pnpm run preview:json-glb
```

浏览器会打开：

```text
http://localhost:5174/preview-json-glb/
```

如果当前 PowerShell 找不到 `pnpm`，可以直接双击根目录的 `start-json-glb-preview.cmd`，或在 VSCode 终端执行：

```powershell
.\node_modules\.bin\vite.cmd --host 0.0.0.0 --port 5174 --open /preview-json-glb/
```

如需打包静态文件：

```powershell
.\node_modules\.bin\vite.cmd build preview-json-glb --outDir ../preview-json-glb-dist --emptyOutDir
```

## 使用方式

- 默认会加载 `/src/json/三维测试.json`。
- 可以填写 JSON URL 后点击“加载”。
- 可以选择或拖入本地 `.json`。
- 可以填写 GLB/GLTF URL 后点击“叠加”。
- 可以选择或拖入本地 `.glb` / `.gltf`。

## 说明

预览器重点验证 JSON + GLB 的文件组合，已覆盖相机、OrbitControls、灯光、基础几何体、基础材质、环境贴图、`modelCores[].modelInfo.url` 的 GLB/GLTF 加载和模型自带动画。

编辑器专有的 `geoCores`、`particleCores`、`designCores` 等复杂组件不会完整复刻；如果这些也要完全一致，建议直接走主编辑器的 `ThreeEditor` 内核预览。
