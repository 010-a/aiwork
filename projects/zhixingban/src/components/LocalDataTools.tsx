import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  Download,
  Trash2,
  DatabaseBackup,
  Terminal,
} from "lucide-react";
import type { AppStore } from "../types";
import { exportBackup } from "../domain";
export default function LocalDataTools({
  store,
  download,
}: {
  store: AppStore;
  download: (text: string, name: string) => void;
}) {
  const [section, setSection] = useState<"backups" | "trash" | "agent">(
    "backups",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void store.refreshBackups().catch((error) => setMessage(String(error)));
  }, []);
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="local-data-tools">
      <div className="segmented data-tabs">
        <button
          className={section === "backups" ? "active" : ""}
          onClick={() => setSection("backups")}
        >
          <DatabaseBackup size={14} />
          备份快照
        </button>
        <button
          className={section === "trash" ? "active" : ""}
          onClick={() => setSection("trash")}
        >
          <Trash2 size={14} />
          回收站（{store.data.trash?.length ?? 0}）
        </button>
        <button
          className={section === "agent" ? "active" : ""}
          onClick={() => setSection("agent")}
        >
          <Terminal size={14} />
          Agent 接入
        </button>
      </div>
      {section === "backups" && (
        <div className="data-section">
          <div className="library-heading">
            <div>
              <h3>最近的安全快照</h3>
              <p className="muted">
                每日有修改时保留快照，最多 30 份。恢复前再保存当前版本。
              </p>
            </div>
            <button
              className="btn btn-small"
              disabled={busy || !store.loaded || store.saveState !== "saved"}
              onClick={() => void run(store.backupNow, "完整快照已保存")}
            >
              立即备份
            </button>
          </div>
          {store.storageMode === "browser" && (
            <p className="muted">
              此处快照仍在浏览器内。请导出 JSON 到电脑；使用新版 start.cmd
              可自动备份到本地文件夹。
            </p>
          )}
          {store.backups.length ? (
            <div className="backup-snapshot-list">
              {store.backups.map((b) => (
                <div className="backup-snapshot" key={b.id}>
                  <div>
                    <strong>{new Date(b.at).toLocaleString("zh-CN")}</strong>
                    <small>
                      {b.label} · {b.tasks} 个任务
                    </small>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="icon-btn"
                      disabled={busy}
                      aria-label={`下载快照 ${b.id}`}
                      onClick={() =>
                        void run(
                          async () =>
                            download(
                              exportBackup(await store.readBackup(b.id)),
                              `知行办-快照-${b.id.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`,
                            ),
                          "快照已下载",
                        )
                      }
                    >
                      <Download size={15} />
                    </button>
                    <button
                      className="btn btn-small"
                      disabled={
                        busy || (store.loaded && store.saveState !== "saved")
                      }
                      onClick={() => {
                        if (
                          confirm(
                            store.loaded
                              ? "恢复此快照会替换当前数据。当前版本会先备份，继续？"
                              : "恢复此快照？原数据无法读取，无法生成有效快照；本地文件服务会保留无法读取的原文件。",
                          )
                        )
                          void run(
                            () => store.restoreBackup(b.id),
                            "已恢复快照，正在保存",
                          );
                      }}
                    >
                      <ArchiveRestore size={14} />
                      恢复
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">暂时没有快照，可以点击“立即备份”。</p>
          )}
        </div>
      )}
      {section === "trash" && (
        <div className="data-section">
          <p className="muted">
            任务和日程删除后保留在这里。恢复任务时会找回它的进展记录与可用关联。
          </p>
          {store.data.trash?.length ? (
            <div className="trash-list">
              {[...store.data.trash].reverse().map((item) => (
                <div className="trash-item" key={item.id}>
                  <div>
                    <strong>{item.task?.title ?? item.event?.title}</strong>
                    <small>
                      {item.task ? "任务" : "日程"} ·{" "}
                      {new Date(item.deletedAt).toLocaleString("zh-CN")}
                    </small>
                  </div>
                  <div className="inline-actions">
                    <button
                      className="btn btn-small"
                      onClick={() => store.restoreTrash(item.id)}
                    >
                      恢复内容
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`永久删除 ${item.task?.title ?? item.event?.title}`}
                      onClick={() => {
                        if (
                          confirm(
                            "永久移除此回收站项目？仍可从此前的完整备份恢复。",
                          )
                        )
                          store.purgeTrash(item.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">回收站是空的。</p>
          )}
        </div>
      )}
      {section === "agent" && (
        <div className="data-section agent-help">
          <h3>让本地 Agent 帮你维护</h3>
          <p className="muted">
            支持 MCP stdio 和 JSON CLI。与界面共享数据，无需云服务或模型 API
            Key。
          </p>
          {store.storageMode === "service" ? (
            <p className="connection-status">
              本地数据服务已连接 · 浏览器关闭后 Agent 仍可使用
            </p>
          ) : (
            <p className="inline-warning">
              当前为浏览器模式。请使用新版 start.cmd 启动，迁移完成后再连接
              Agent。
            </p>
          )}
          <p>在 Agent 的 MCP 配置中添加：</p>
          <pre>
            {JSON.stringify(
              {
                mcpServers: {
                  zhixingban: {
                    command: "node",
                    args: [
                      "C:/你的路径/aiwork/projects/zhixingban/service-dist/mcp.mjs",
                    ],
                  },
                },
              },
              null,
              2,
            )}
          </pre>
          <p className="muted">
            将路径换成电脑上的实际位置。不同 Agent
            的配置文件位置不同；支持执行命令的 Agent 也可使用：
          </p>
          <pre>
            node service-dist/cli.mjs schema{"\n"}node service-dist/cli.mjs
            query --file query.json{"\n"}node service-dist/cli.mjs apply --file
            command.json
          </pre>
          <p className="muted">
            可以让 Agent 先读取项目中的
            AGENT_API.md。先查询再修改，实际结果才能记为进展；推测、建议与计划不算完成。
          </p>
        </div>
      )}
      {store.dataDirectory && (
        <p className="data-directory">
          数据目录：<code>{store.dataDirectory}</code>
        </p>
      )}
      {store.legacyData && (
        <button
          className="text-link"
          onClick={() =>
            download(
              exportBackup(store.legacyData!),
              "知行办-浏览器旧数据.json",
            )
          }
        >
          导出浏览器旧数据（原记录保留）
        </button>
      )}
      {store.legacyData && store.storageMode === "service" && (
        <button
          className="btn btn-ghost btn-small"
          disabled={busy || store.saveState !== "saved"}
          onClick={() => {
            if (
              confirm(
                "用浏览器旧数据替换当前文件数据？会先备份当前版本；这是整体替换，不是合并。",
              )
            )
              void run(async () => {
                await store.backupNow();
                store.replaceData(store.legacyData!);
              }, "旧数据已恢复，正在保存");
          }}
        >
          恢复浏览器旧数据
        </button>
      )}
      {message && (
        <p className="data-feedback" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
