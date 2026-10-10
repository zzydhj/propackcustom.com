// 设计器场景单位的唯一定义处。
//
// 为什么要单独一个模块：PX_PER_MM 原来只在 useFabricCanvas.ts（客户端组件）里导出，
// 但服务端也要用 —— AI/PDF 导入器要把 mm 坐标写成 Fabric 场景 JSON，生成脚本同样要算。
// 从客户端组件里 import 会把整个 Fabric.js 拖进服务端 bundle，而各脚本自己再写一份
// `const PX = 8` 迟早会和引擎对不上（模板生成器就差点因此算偏）。
// 所以：单位常量放这里，引擎 re-export 保持既有 import 路径不变。

/** 场景像素 / 毫米。8px/mm ≈ 203dpi 预览密度（80mm → 640px） */
export const PX_PER_MM = 8;

/** mm → 场景 px */
export const px = (mm: number): number => Math.round(mm * PX_PER_MM * 1000) / 1000;

/** 场景 px → mm */
export const toMm = (scenePx: number): number => scenePx / PX_PER_MM;
