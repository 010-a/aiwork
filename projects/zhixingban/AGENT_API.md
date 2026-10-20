# 给本地 Agent 的接口说明

知行办 v1.4 提供 MCP stdio 和 JSON CLI，两者通过同一个本机 HTTP 服务执行同一套领域操作。无需模型 API Key，不连接云服务。先运行一次 `start.cmd` 完成构建，并用原来的浏览器打开完成旧数据迁移。

## 接入

支持 MCP 的 Agent 可配置：

```json
{
  "mcpServers": {
    "zhixingban": {
      "command": "node",
      "args": ["C:/实际路径/aiwork/projects/zhixingban/service-dist/mcp.mjs"]
    }
  }
}
```

Codex 的 TOML 配置形式为：

```toml
[mcp_servers.zhixingban]
command = "node"
args = ["C:/实际路径/aiwork/projects/zhixingban/service-dist/mcp.mjs"]
```

用实际绝对路径替换示例。zcode、deepseekharness 的配置位置依所用版本而定；如果不支持 MCP，可让 Agent 执行 CLI。MCP 标准输入/输出只传 JSON-RPC；启动信息不会写入协议输出。支持 initialize、ping、tools/list 和 tools/call。

CLI 在项目目录执行：

```bash
node service-dist/cli.mjs schema
node service-dist/cli.mjs query --file query.json
node service-dist/cli.mjs apply --file command.json
node service-dist/cli.mjs backup
```

`--file` 读取 UTF-8 JSON，兼容 Windows 命令行的中文与引号。也可将 JSON 作为第二个参数传入。CLI 成功向 stdout 输出 JSON，失败向 stderr 输出错误并返回非零退出码。

浏览器无需开启。CLI/MCP 会连接已运行的服务；没有服务时会启动同一个本地服务。之后可在固定地址打开界面。后台服务可运行 `node service-dist/cli.mjs stop` 或双击 stop.cmd 停止。升级前先停止再运行 start.cmd；不能以两个端口同时操作同一数据目录。

## 三个 MCP 工具

- `zhixingban_query`：读取数据、预警与周回顾。
- `zhixingban_apply`：执行一个结构化操作，可附 `expectedRevision` 保护旧版本。
- `zhixingban_backup`：创建本机完整快照。

### 查询

`query.json` 示例：

```json
{"resource":"tasks","search":"样本"}
```

resource 支持 `state`、`tasks`、`projects`、`stages`、`events`、`principles`、`alerts`、`progress`、`review`、`templates`、`trash`。普通列表可按 `id`、`projectId` 和 `search` 筛选。响应包含 revision；后续重要修改建议传回该版本。`review` 可加 `week: "2026-10-19"`，自动取所在周周一。`currentAlerts` 始终是当前状态，不是历史周快照。

### 新增与编辑

任务只要求标题：

```json
{"type":"task.add","title":"测试代表性样本"}
```

归入项目并安排今天（日期由 Agent 读取本机当天日期后填入）：

```json
{
  "command": {
    "type":"task.update",
    "id":"从查询获得的任务ID",
    "patch":{"projectId":"项目ID","inbox":false,"plannedDate":"2026-10-20"}
  },
  "expectedRevision":12
}
```

`apply` 同时接受直接 command 或上面带版本的外层对象。操作列表与完整参数以 `schema` 输出为准：

| 对象 | 操作 |
| --- | --- |
| 任务 | `task.add`（title、可选 patch）、`task.update`（id、patch）、`task.updateMany`（ids、patch，原子批量）、`task.reorder`（ids，按给定顺序排列）、`task.delete`（id 或 ids） |
| 项目 | `project.add`（patch）、`project.update`（id、patch），归档用 `archived:true` |
| 阶段 | `stage.add`（projectId、title）、`stage.update`（id、title）、`stage.delete`（id） |
| 固定日程 | `event.add`（patch）、`event.update`（id、patch）、`event.delete`（id） |
| 进展 | `progress.record`（target、note）、`monitor.update`（target、patch）、`checkpoint.complete`（target） |
| 原则 | `principle.save`（principle，按 id 新增或修改）、`principle.delete`（id） |
| 模板 | `template.save`（template）、`template.delete`（id） |
| 回收站 | `trash.restore`（id）、`trash.purge`（id） |
| 周记 | `review.note`（week 周一日期、note） |

任务 patch 可用 title、notes、status（todo/doing/paused/done）、inbox、projectId、stageId、plannedDate、dueDate、important、order、blockedReason、dependsOn、obsidianUrl、nextAction、estimatedMinutes、recurrence。项目可用 title、goal、description、color（#RRGGBB）、archived、blockedReason、obsidianUrl、nextAction。清除可选字段传 JSON `null`；必填字段不能清空。日期必须为 YYYY-MM-DD。

新增项目 patch 只写 title 即可，其余使用默认值。新增日程 patch 必须有 title、date、startTime、endTime、notes；时间为 HH:mm，结束晚于开始。任务删除进入回收站；恢复会尽量找回仍有效的项目、阶段、依赖和进展，不引入依赖环。项目采用归档，阶段删除保留任务。

记录真实结果：

```json
{
  "type":"progress.record",
  "target":{"type":"task","id":"任务ID"},
  "note":"对照测试未见改善，已排除当前参数组合"
}
```

### 原则

```json
{
  "type":"principle.save",
  "principle":{
    "id":"sample-validation",
    "title":"验证方法及时调整",
    "description":"已开始的方法验证任务需要及时得到新信息",
    "enabled":true,
    "scope":"task",
    "condition":"stall",
    "days":2,
    "unit":"business",
    "action":"检查最小样本，换一个有区分度的对照"
  }
}
```

scope 为 project/task/bug/all；condition 为 stall/blocked/deadline/checkpoint/manual；unit 为 calendar/business。stall/blocked 为 1–365 天，deadline 提前量为 0–365 个自然日，checkpoint/manual 的 days 可用 0。项目没有任务式截止日期，使用 checkpoint。manual 文字原则不自动触发，也不会执行任意条件文本。删除内置原则后不会自动补回；界面提供恢复默认与撤销。

重复规则示例：`{"interval":1,"unit":"week","mode":"schedule"}`。mode 为 schedule/completion，unit 为 day/week/month，可选 paused。只有完成时生成一个未来周期，不补建错过的积压；原结果保留，截止日期不复制。template 必须包含 id/title/notes，可选 projectId/stageId/estimatedMinutes。

## Agent 必须遵守

1. 先查询，保留用户原来的目标与真实日期；需要防止陈旧修改时传 expectedRevision。冲突后重新读取，不反复覆盖。
2. 计划、推测和“准备做”不能当作有效进展。阴性结果或排除假设可以记录，但必须有用户提供的真实依据。
3. 只有用户确认或有明确事实支持时才标记完成、确认检查点达成。日常整理不应通过改期消除真实截止风险。
4. 不要求用户给每件事估时、打标签或划阶段。缺少日期时保留空值，不编造计划。
5. 每次 Agent 修改前会自动保留一份快照（最多 30 份）；批量整理前仍建议另建并导出完整备份。日常优先使用可恢复删除和归档；永久删除需要明确指令。
6. 不直接修改 data.json、备份文件或 IndexedDB；不读取、上传 connection.json 中的访问凭据。Obsidian 只保存关联路径或链接，不读写整个库。

## 存储与恢复

Windows 默认目录为 `%LOCALAPPDATA%\Zhixingban`；macOS/Linux 为 `$XDG_DATA_HOME/zhixingban` 或 `~/.local/share/zhixingban`。可用 `ZHIXINGBAN_DATA_DIR` 指定其他目录，界面与 Agent 必须使用相同目录。目录包含 data.json、backups/、connection.json 和服务锁。connection.json 由程序管理，不加入 Git 或分享给其他人。

服务绑定 127.0.0.1，默认端口 5173。写入串行并校验；文件采用临时写入再替换，陈旧界面快照返回冲突。浏览器空闲时约两秒读取一次外部更新；外部数据到来会清掉该窗口过期的撤销历史。撤销只覆盖本窗口最近操作，跨重启请用回收站或快照。

HTTP 接口供客户端内部使用：GET /api/state、PUT /api/state（必须带 expectedRevision）、POST /api/command、GET/POST /api/backups、GET /api/backups/:id。除会话与健康检查外均需本机凭据；跨站请求被拒绝。建议 Agent 使用 CLI/MCP，而不是自行管理凭据。
