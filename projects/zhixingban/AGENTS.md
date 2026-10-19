# 开发约定

- 本目录是独立应用；不要修改兄弟项目。参考图位于仓库根目录。
- React + TypeScript + Vite。所有页面共享 `src/types.ts` 中的 AppData 与单一 store，禁止另建页面数据副本。
- 任务只要求标题；计划日期和截止日期必须分开。统计和建议必须依据真实数据，可解释，不调用外部 AI。
- IndexedDB 是持久化来源。保存失败必须显示，初始化失败不得静默覆盖数据。备份导入必须校验结构、关系并确认替换。
- 日期工具使用本地日历日期，禁止用 UTC 截断当作本地日期。演示数据必须标记，支持独立清除。
- 无 CDN、云服务、外部字体或运行时网络依赖；保留 Windows 双击启动和固定端口，避免切换 origin 丢失数据。
- 交付前运行 npm test、npm run build、npm run test:e2e，更新 STATUS.md 并记录未验证事项。

## 文件位置

- `src/types.ts`：唯一领域模型与页面契约。
- `src/appearance.ts`：本机外观偏好、系统明暗/动态效果与跨窗口同步；使用 `zhixingban-appearance-v1`，不修改任务 schema 或 IndexedDB。`index.html` 的首次绘制脚本使用同一白名单和默认值，改动时需同步。
- `src/store.tsx`：CRUD、IndexedDB 串行保存与多窗口冲突保护、严格备份校验、演示数据。
- `src/alerts.ts`：无副作用的预警规则（自然日/工作日）、有效进展选择器；`components/Monitoring.tsx` / `monitoring.css`：合并预警、进展与检查点、原则设置。任务/项目的可选 monitor 和根 monitoring 沿用 schemaVersion 1；旧数据首次启用时间必须持久保存，改标题/改期不算进展，暂停/等待状态不能伪造投入工时。规则、历史与检查点必须通过严格备份校验，删除/清演示要同步清理关联记录。
- `src/dates.ts` / `src/selectors.ts`：本地日期与无副作用的统计、建议规则。
- `src/App.tsx`：固定导航、全局搜索、新增、备份；`components/`：共享任务行、弹窗与右侧详情。
- `src/pages/Core.tsx`：首页、收集、今日；其他三个页面各自独立。CSS 统一在 `styles.css` 和 `pages/calendar-review.css`。
- `tests/alerts.test.ts` / `tests/monitoring.spec.ts`：停滞/目标/日期/阻碍边界、旧数据、进展和调整历史、原则持久化与备份恢复、大字深色预警截图。
- `tests/data.test.ts`：领域规则、坏备份及真实 IndexedDB 语义；`tests/app.spec.ts`：浏览器流程与六页截图。
- `src/experience.css`：全局语义色板、明暗/强调色、密度及交互过渡。其他样式须使用共享 token，避免写死浅色背景；对话框渲染到 body，主题属性必须位于 html。遵循系统减少动态效果，避免全属性动画。全局文字使用 rem，四档根字号 14/16/18/20px，默认 16px；新增字体样式不得写死 px。放大后要允许换行、滚动，核查六页及弹窗在 1440px/1920px 的布局。
- `tests/appearance.test.ts` / `tests/appearance.spec.ts`：偏好校验、主题和系统变化、持久化、旧偏好兼容、字号、密度及键盘交互；Vitest 配置仅包含 `*.test.ts`，与 Playwright 分开。
- `start.cmd` / `start.sh`：安装、构建、启动；`scripts/open-browser.mjs` 等待服务就绪后打开浏览器。

将 UI 输入视为草稿：不要在每个按键后去除尾部空格，也不要让 Modal 因回调引用变化而重新获取焦点。更改存储格式必须先设计版本迁移，不能改库名来绕过旧数据。
