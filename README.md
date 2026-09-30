# Emoji 跨平台兼容性检测工具

面向「需要在多平台上正确展示 Emoji 的开发者」的纯前端工具：展示一组覆盖
基础、变体选择符、肤色修饰符、ZWJ 序列、旗帜序列的 Emoji，检测当前浏览器
与系统的真实渲染能力，对异常渲染给出语义一致的降级方案。

## 运行

Web Worker 不支持 `file://` 协议，需通过本地 HTTP 服务打开：

```bash
cd A
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

无框架、无第三方依赖。需要 Canvas 2D；Web Worker + OffscreenCanvas、
Intl.Segmenter、IndexedDB、Clipboard API 均有降级路径。

## 文件结构

- `index.html` — 页面结构（能力面板、工具栏、卡片网格、详情/复制弹窗）
- `css/styles.css` — 暗色主题样式
- `js/emoji-data.js` — 45 条测试数据集 + 能力探针定义
- `js/detector.js` — 检测核心（纯逻辑，主线程与 Worker 共用）
- `js/detect-worker.js` — Web Worker：OffscreenCanvas 离屏渲染测量
- `js/db.js` — IndexedDB 缓存封装
- `js/app.js` — UI 逻辑、检测调度、搜索分类、复制、详情弹窗

## 检测原理

把 Emoji 绘制到 Canvas（64px 系统 emoji 字体栈），用三类信号交叉判断：

| 信号 | 方法 | 能发现的问题 |
| --- | --- | --- |
| 宽度 | `measureText` 对比序列宽度与分量宽度之和 | ZWJ 序列被拆开、肤色修饰符独立成色块、旗帜退化为两个字母 |
| 颜色 | `getImageData` 扫描彩色像素 | VS16/VS15 变体选择符被忽略、缺少彩色 emoji 字体 |
| 豆腐块 | 与非字符 U+10FFFE 的渲染指纹比对 | 字体缺失导致的缺字形 |

降级策略（语义保持一致）：旗帜 → ISO 国家码（如 `CN`）；肤色 → 基础
emoji + 肤色文字说明；ZWJ 拆开 → 分量并列 + 名称；豆腐块 → 名称文本。

## 功能与验收点

| 验收标准 | 实现 |
| --- | --- |
| Emoji 展示正确 | 卡片网格直接以系统字体渲染，宽度按实测 em 预留空间防溢出 |
| 支持性检测准确 | 宽度/颜色/豆腐块三信号；7 项能力探针总览当前环境 |
| 异常渲染有降级 | 每条异常给出降级显示文本，详情面板可一键复制 |
| 码点和序列展示准确 | 详情面板逐码点列出 U+ 编码并标注 VS15/VS16、ZWJ、肤色、区域指示符、Tag 字符；Intl.Segmenter 统计字形簇 |
| 宽度测量准确 | Canvas 实测 px + em 宽度（64px 基准），ZWJ 条目另给分量宽度合计 |
| 搜索分类可用 | 名称/英文/码点/Emoji 本体搜索；5 类分类 chips + 状态筛选 |
| 复制正确 | Clipboard API 复制 Emoji/码点/JS 转义/降级文本，权限被拒时降级为手动复制弹窗 |

## 边界与异常处理

- **Worker/OffscreenCanvas 不可用** → 主线程 Canvas 分批检测（每 10 条让出主线程）
- **IndexedDB 不可用（隐私模式）** → 跳过缓存，每次重新检测
- **剪贴板权限被拒** → 弹窗提供手动复制文本框
- **检测误判** → 详情面板展示全部原始指标（宽度、颜色、指纹）供人工核对
- **检测结果缓存** → 按「序列 + 字体栈 + UA」为键存 IndexedDB，「重新检测」清空重测

## 已验证

检测核心用 Node 打桩 mock measurer 测试：98 项断言全部通过，覆盖全支持
环境、ZWJ/肤色/旗帜拆开环境、无彩色字体环境、豆腐块缺字形、能力探针等场景。
浏览器端端到端需在本地 HTTP 服务下手动验证。
