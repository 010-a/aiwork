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
- `src/store.tsx`：CRUD、IndexedDB 串行保存与多窗口冲突保护、严格备份校验、演示数据。
- `src/dates.ts` / `src/selectors.ts`：本地日期与无副作用的统计、建议规则。
- `src/App.tsx`：固定导航、全局搜索、新增、备份；`components/`：共享任务行、弹窗与右侧详情。
- `src/pages/Core.tsx`：首页、收集、今日；其他三个页面各自独立。CSS 统一在 `styles.css` 和 `pages/calendar-review.css`。
- `tests/data.test.ts`：领域规则、坏备份及真实 IndexedDB 语义；`tests/app.spec.ts`：浏览器流程与六页截图。
- `start.cmd` / `start.sh`：安装、构建、启动；`scripts/open-browser.mjs` 等待服务就绪后打开浏览器。

将 UI 输入视为草稿：不要在每个按键后去除尾部空格，也不要让 Modal 因回调引用变化而重新获取焦点。更改存储格式必须先设计版本迁移，不能改库名来绕过旧数据。
