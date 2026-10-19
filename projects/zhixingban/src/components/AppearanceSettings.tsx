import { Check, Monitor, Moon, Sun, Sparkles, RotateCcw } from "lucide-react";
import { Modal } from "./ui";
import {
  DEFAULT_APPEARANCE,
  type Accent,
  type AppearancePreferences,
  type ThemeMode,
} from "../appearance";

export const ACCENTS: { id: Accent; name: string; color: string }[] = [
  { id: "blue", name: "海洋蓝", color: "#007aff" },
  { id: "purple", name: "鸢尾紫", color: "#8054d9" },
  { id: "green", name: "森林绿", color: "#218468" },
  { id: "rose", name: "玫瑰粉", color: "#bd476f" },
  { id: "orange", name: "日落橙", color: "#b96620" },
  { id: "graphite", name: "石墨灰", color: "#596273" },
];
const modes = [
  { id: "light" as ThemeMode, name: "浅色", icon: Sun },
  { id: "dark" as ThemeMode, name: "深色", icon: Moon },
  { id: "system" as ThemeMode, name: "跟随系统", icon: Monitor },
];

export default function AppearanceSettings({
  preferences,
  resolvedTheme,
  updatePreferences,
  error,
  onClose,
}: {
  preferences: AppearancePreferences;
  resolvedTheme: "light" | "dark";
  updatePreferences: (patch: Partial<AppearancePreferences>) => void;
  error: string;
  onClose: () => void;
}) {
  return (
    <Modal title="外观与体验" onClose={onClose} className="appearance-modal">
      <p className="appearance-intro">把工作空间，调成你喜欢的样子。</p>
      <section className="appearance-section">
        <div className="appearance-label">
          <h3>界面模式</h3>
          <span>随心切换明暗</span>
        </div>
        <div className="mode-options" role="group" aria-label="界面模式">
          {modes.map((mode) => (
            <button
              key={mode.id}
              className={`mode-option ${preferences.mode === mode.id ? "selected" : ""}`}
              aria-pressed={preferences.mode === mode.id}
              onClick={() => updatePreferences({ mode: mode.id })}
            >
              <div
                className={`mode-preview preview-${mode.id}`}
                aria-hidden="true"
              >
                <div className="preview-sidebar">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="preview-content">
                  <span />
                  <div />
                  <div />
                </div>
                {preferences.mode === mode.id && (
                  <span className="mode-check">
                    <Check size={11} />
                  </span>
                )}
              </div>
              <span>
                <mode.icon size={15} />
                {mode.name}
              </span>
            </button>
          ))}
        </div>
        {preferences.mode === "system" && (
          <p className="setting-caption">
            当前跟随系统使用{resolvedTheme === "dark" ? "深色" : "浅色"}外观。
          </p>
        )}
      </section>
      <section className="appearance-section">
        <div className="appearance-label">
          <h3>强调色</h3>
          <span>
            {ACCENTS.find((item) => item.id === preferences.accent)?.name}
          </span>
        </div>
        <div className="accent-options" role="radiogroup" aria-label="强调色">
          {ACCENTS.map((accent) => (
            <label
              className={`accent-option ${preferences.accent === accent.id ? "selected" : ""}`}
              key={accent.id}
              style={{ "--swatch": accent.color } as React.CSSProperties}
            >
              <input
                type="radio"
                name="accent"
                value={accent.id}
                checked={preferences.accent === accent.id}
                onChange={() => updatePreferences({ accent: accent.id })}
                aria-label={accent.name}
              />
              <span className="accent-swatch" aria-hidden="true">
                {preferences.accent === accent.id && <Check size={18} />}
              </span>
              <span>{accent.name}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="appearance-section settings-rows">
        <div className="setting-row">
          <div>
            <h3>显示密度</h3>
            <p>多一点留白，或多看一些内容</p>
          </div>
          <div className="segmented" role="group" aria-label="显示密度">
            <button
              className={preferences.density === "comfortable" ? "active" : ""}
              aria-pressed={preferences.density === "comfortable"}
              onClick={() => updatePreferences({ density: "comfortable" })}
            >
              舒适
            </button>
            <button
              className={preferences.density === "compact" ? "active" : ""}
              aria-pressed={preferences.density === "compact"}
              onClick={() => updatePreferences({ density: "compact" })}
            >
              紧凑
            </button>
          </div>
        </div>
        <label className="setting-row motion-setting">
          <div>
            <h3>减少动态效果</h3>
            <p>偏好更安静的过渡；也会尊重系统设置</p>
          </div>
          <span className="switch">
            <input
              type="checkbox"
              aria-label="减少动态效果"
              checked={preferences.reduceMotion}
              onChange={(event) =>
                updatePreferences({ reduceMotion: event.target.checked })
              }
            />
            <span aria-hidden="true" />
          </span>
        </label>
      </section>
      {error && (
        <p className="appearance-error" role="alert">
          {error}
        </p>
      )}
      <div className="appearance-footer">
        <span>
          <Sparkles size={13} />
          更改即时生效，自动记住偏好
        </span>
        <button
          className="text-link"
          onClick={() => updatePreferences(DEFAULT_APPEARANCE)}
        >
          <RotateCcw size={13} />
          恢复默认外观
        </button>
      </div>
    </Modal>
  );
}
