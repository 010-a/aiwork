import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import type { AppStore, Principle } from "../types";
import { getPrinciples, conditionLabels } from "../principles";
import { validatePrinciple } from "../domain";
import { DEFAULT_ALERT_RULES } from "../alerts";
import { Modal } from "./ui";
const scopeLabels = {
  project: "项目",
  task: "任务",
  bug: "Bug 任务",
  all: "项目与任务",
};
export default function PrincipleLibrary({
  store,
  onClose,
}: {
  store: AppStore;
  onClose: () => void;
}) {
  const principles = getPrinciples(store.data);
  const [draft, setDraft] = useState<Principle>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      store.savePrinciple(validatePrinciple(draft));
      await store.flushSaves();
      setDraft(undefined);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="预警原则" onClose={onClose} className="monitor-rules-modal">
      <div className="library-heading">
        <p className="muted">
          原则可以增减和修改。自动检查已有数据；文字原则留作提醒。
        </p>
        <button
          className="btn btn-primary btn-small"
          onClick={() => {
            setError("");
            setDraft({
              id: crypto.randomUUID(),
              title: "",
              description: "",
              enabled: true,
              scope: "project",
              condition: "stall",
              days: 7,
              unit: "calendar",
              action: "",
            });
          }}
        >
          <Plus size={15} />
          新增原则
        </button>
      </div>
      <div className="monitor-rules-table-wrap">
        <table className="monitor-rules-table">
          <thead>
            <tr>
              <th>启用 / 原则</th>
              <th>什么时候提醒</th>
              <th>默认阈值</th>
              <th>建议行动</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {principles.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`启用${p.title}`}
                      checked={p.enabled}
                      onChange={(e) =>
                        store.savePrinciple({ ...p, enabled: e.target.checked })
                      }
                    />
                    {p.title}
                  </label>
                  <small className="muted">{scopeLabels[p.scope]}</small>
                </th>
                <td>
                  {conditionLabels[p.condition]}
                  {p.description && (
                    <small className="muted">{p.description}</small>
                  )}
                </td>
                <td>
                  {["stall", "blocked", "deadline"].includes(p.condition) ? (
                    <div className="monitor-rule-threshold">
                      <input
                        className="field"
                        type="number"
                        key={`${p.id}-${p.days}`}
                        defaultValue={p.days}
                        min={p.condition === "deadline" ? 0 : 1}
                        max={365}
                        aria-label={`${p.title}阈值`}
                        onBlur={(e) => {
                          const days = Number(e.target.value);
                          if (
                            e.target.value &&
                            Number.isInteger(days) &&
                            days >= (p.condition === "deadline" ? 0 : 1) &&
                            days <= 365
                          )
                            store.savePrinciple({ ...p, days });
                          else {
                            e.target.value = String(p.days);
                            setError("天数应为有效整数，已保留原值。");
                          }
                        }}
                      />
                      <span>
                        {p.condition === "deadline"
                          ? "天前提醒"
                          : p.unit === "business"
                            ? "工作日"
                            : "自然日"}
                      </span>
                    </div>
                  ) : p.condition === "manual" ? (
                    "不自动检查"
                  ) : (
                    "按检查日期"
                  )}
                </td>
                <td>{p.action || "—"}</td>
                <td>
                  <div className="inline-actions">
                    <button
                      className="icon-btn"
                      aria-label={`编辑原则 ${p.title}`}
                      onClick={() => {
                        setDraft({ ...p });
                        setError("");
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`删除原则 ${p.title}`}
                      onClick={() => store.deletePrinciple(p.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!principles.length && (
          <p className="padded muted">
            还没有原则。可以新增一条，或恢复默认原则。
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      <div className="monitor-principle-note">
        <ShieldCheck size={21} />
        <div>
          <strong>只检查可判断的条件</strong>
          <p>
            记录结果、完成任务、确认目标达成才算有效进展。改标题和改期不算进展。没有记录不代表没有工作。
          </p>
          <p>
            工作日按周一至周五计算，不等于投入工时。暂停或未开始的事项不检查停滞；明确的日期风险仍保留。文字原则不会被当作程序执行。
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <button
          className="btn btn-ghost"
          onClick={() =>
            store.updateAlertRules(structuredClone(DEFAULT_ALERT_RULES))
          }
        >
          恢复默认原则
        </button>
        {store.undoLabel && (
          <button className="btn btn-ghost" onClick={store.undo}>
            撤销上一步
          </button>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          完成
        </button>
      </div>
      {draft && (
        <Modal
          title={
            principles.some((p) => p.id === draft.id) ? "编辑原则" : "新增原则"
          }
          onClose={() => setDraft(undefined)}
        >
          <form className="principle-form" onSubmit={save}>
            <label className="form-label">
              原则名称
              <input
                className="field"
                aria-label="原则名称"
                required
                maxLength={500}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="form-label">
              说明
              <textarea
                className="field"
                aria-label="原则说明"
                rows={2}
                maxLength={10000}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label className="form-label">
                适用范围
                <select
                  className="field"
                  aria-label="原则适用范围"
                  value={draft.scope}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scope: e.target.value as Principle["scope"],
                    })
                  }
                >
                  {Object.entries(scopeLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                检查条件
                <select
                  className="field"
                  aria-label="原则检查条件"
                  value={draft.condition}
                  onChange={(e) => {
                    const condition = e.target.value as Principle["condition"];
                    setDraft({
                      ...draft,
                      condition,
                      unit: condition === "deadline" ? "calendar" : draft.unit,
                      scope:
                        condition === "deadline" && draft.scope === "project"
                          ? "task"
                          : draft.scope,
                      days: Math.max(
                        draft.days,
                        ["stall", "blocked"].includes(condition) ? 1 : 0,
                      ),
                    });
                  }}
                >
                  {Object.entries(conditionLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {["stall", "blocked", "deadline"].includes(draft.condition) && (
              <div className="form-grid">
                <label className="form-label">
                  {draft.condition === "deadline"
                    ? "提前几天提醒"
                    : "经过多少天"}
                  <input
                    className="field"
                    aria-label="原则天数"
                    type="number"
                    required
                    min={draft.condition === "deadline" ? 0 : 1}
                    max={365}
                    value={draft.days}
                    onChange={(e) =>
                      setDraft({ ...draft, days: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="form-label">
                  时间单位
                  <select
                    className="field"
                    aria-label="原则时间单位"
                    disabled={draft.condition === "deadline"}
                    value={draft.unit}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        unit: e.target.value as Principle["unit"],
                      })
                    }
                  >
                    <option value="calendar">自然日</option>
                    <option value="business">工作日（周一至周五）</option>
                  </select>
                </label>
              </div>
            )}
            <label className="form-label">
              提醒时建议做什么
              <textarea
                className="field"
                aria-label="原则建议行动"
                rows={2}
                maxLength={10000}
                value={draft.action}
                onChange={(e) => setDraft({ ...draft, action: e.target.value })}
              />
            </label>
            {draft.condition === "manual" && (
              <p className="muted">
                这条原则供你和 Agent 阅读，不自动触发预警。
              </p>
            )}
            {error && (
              <p className="text-red" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setDraft(undefined)}
              >
                取消
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "正在保存…" : "保存原则"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
