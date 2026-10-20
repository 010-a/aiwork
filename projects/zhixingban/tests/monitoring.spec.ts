import { test, expect, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AppData, Project, Task } from "../src/types";

// Monday morning in the app's local time. Friday -> Monday is one elapsed
// working day, which makes the Bug default independent of the runner's date.
const now = new Date("2026-10-19T01:00:00.000Z");
const startedAt = "2026-10-09T01:00:00.000Z";
const bugStartedAt = "2026-10-16T01:00:00.000Z";
const researchTitle = "示例科研：溶酶体分割验证";
const bugTitle = "示例 Bug：分割结果偏移";
const blockedTitle = "示例等待：获取对照样本";
const negativeResult = "阴性结果：已排除归一化参数，下一步检查坐标转换。";
const screenshots = path.join(
  process.cwd(),
  "work",
  "screenshots",
  "monitoring",
);

function project(
  id: string,
  title: string,
  patch: Partial<Project> = {},
): Project {
  return {
    id,
    title,
    goal: "完成代表性样本测试，判断现有方法是否可继续采用",
    description: "浏览器验证使用的演示项目",
    color: "#4f87e5",
    archived: false,
    createdAt: startedAt,
    updatedAt: startedAt,
    demo: true,
    monitor: { startedAt },
    ...patch,
  };
}

function task(id: string, title: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title,
    notes: "演示：先比较代表性样本，再决定下一步",
    status: "doing",
    inbox: false,
    important: false,
    order: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
    demo: true,
    monitor: { preset: "bug", startedAt: bugStartedAt },
    ...patch,
  };
}

function fixture(): AppData {
  return {
    schemaVersion: 1,
    projects: [
      project("research", researchTitle),
      project("paused-project", "示例暂停项目", {
        monitor: { startedAt, paused: true },
      }),
      project("archived", "示例已归档项目", { archived: true }),
    ],
    tasks: [
      task("bug", bugTitle, {
        projectId: "research",
        dueDate: "2026-10-16",
        monitor: {
          preset: "bug",
          startedAt: bugStartedAt,
          checkpoint: {
            title: "验证偏移问题的最小复现",
            criteria: "使用一张代表性图像复现偏移，并记录误差范围",
            date: "2026-10-16",
          },
        },
      }),
      task("blocked", blockedTitle, {
        blockedReason: "等待补充对照样本",
        monitor: { startedAt, blockedSince: "2026-10-12T01:00:00.000Z" },
      }),
      task("paused", "示例已暂停 Bug", { status: "paused" }),
      task("done", "示例已完成 Bug", {
        status: "done",
        completedAt: bugStartedAt,
      }),
      task("archived-bug", "示例归档项目中的 Bug", { projectId: "archived" }),
      task("future", "示例下周开始的 Bug", {
        status: "todo",
        plannedDate: "2026-10-26",
      }),
    ],
    stages: [],
    events: [],
    reviewNotes: {},
    monitoring: {
      enabledAt: "2026-10-01T01:00:00.000Z",
      rules: {
        projectStall: { enabled: true, days: 7 },
        bugStall: { enabled: true, days: 1 },
        checkpoint: { enabled: true },
        deadline: { enabled: true, days: 1 },
        blocked: { enabled: true, days: 3 },
      },
      entries: [],
    },
  };
}

async function ready(page: Page) {
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /让重要的事，有序发生/ }),
  ).toBeVisible();
  await expect(page.getByText("正在打开本地工作空间…")).toHaveCount(0);
}

async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "主要页面" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

async function importData(page: Page, data: AppData) {
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("导入 JSON 备份").setInputFiles({
    name: "monitoring-demo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole("status")).toContainText("备份已导入");
  const backup = page.getByRole("dialog", { name: "数据与备份", exact: true });
  if (await backup.isVisible())
    await backup.getByRole("button", { name: "关闭", exact: true }).click();
}

async function exportData(page: Page): Promise<AppData> {
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出完整备份/ }).click();
  const file = await (await downloadPromise).path();
  expect(file).toBeTruthy();
  const data: AppData = JSON.parse(await readFile(file!, "utf8"));
  await page
    .getByRole("dialog", { name: "数据与备份", exact: true })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  return data;
}

function homeAlerts(page: Page) {
  return page.getByRole("region", { name: "需要调整", exact: true });
}

function openAlert(page: Page, title: string) {
  return homeAlerts(page).getByRole("button", {
    name: `处理预警 ${title}`,
    exact: true,
  });
}

test("真实预警合并展示，阴性结果算进展，目标确认和改期进入回顾", async ({
  page,
}) => {
  test.slow();
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await importData(page, fixture());
  await expect(openAlert(page, researchTitle)).toHaveCount(1);
  await expect(openAlert(page, bugTitle)).toHaveCount(1);
  await expect(openAlert(page, blockedTitle)).toHaveCount(1);
  await expect(homeAlerts(page)).toContainText(/Bug 排查已经过 1 个工作日/);
  await expect(homeAlerts(page)).toContainText(/连续 10 天没有记录有效进展/);
  await expect(homeAlerts(page)).toContainText(/截止日期已过/);
  await expect(homeAlerts(page)).toContainText(/验证偏移问题的最小复现/);
  const bugWarnings = homeAlerts(page)
    .locator(".monitor-alert-group")
    .filter({
      has: page.getByRole("button", {
        name: `处理预警 ${bugTitle}`,
        exact: true,
      }),
    });
  await expect(bugWarnings).toHaveCount(1);
  await expect(bugWarnings).toContainText(/Bug 排查已经过 1 个工作日/);
  await expect(bugWarnings).toContainText(/截止日期已过/);
  await expect(bugWarnings).toContainText(/验证偏移问题的最小复现/);
  for (const title of [
    "示例暂停项目",
    "示例已暂停 Bug",
    "示例已完成 Bug",
    "示例归档项目中的 Bug",
    "示例下周开始的 Bug",
  ]) {
    await expect(openAlert(page, title)).toHaveCount(0);
  }

  await openAlert(page, bugTitle).click();
  const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
  await detail.getByRole("button", { name: "记录进展", exact: true }).click();
  await detail
    .getByRole("textbox", { name: "有效进展", exact: true })
    .fill(negativeResult);
  await detail.getByRole("button", { name: "保存进展", exact: true }).click();
  await expect(detail).toContainText(negativeResult);
  await expect(detail).not.toContainText(/Bug 排查已经过/);
  await expect(detail).toContainText(/截止日期已过/);
  await detail
    .getByRole("button", { name: "关闭任务详情", exact: true })
    .click();
  await expect(openAlert(page, researchTitle)).toHaveCount(0);
  await expect(openAlert(page, bugTitle)).toHaveCount(1);

  await openAlert(page, bugTitle).click();
  await detail.getByRole("button", { name: "确认已达成", exact: true }).click();
  await detail
    .getByLabel("必须完成的截止日期", { exact: true })
    .fill("2026-10-23");
  await detail
    .getByRole("button", { name: "关闭任务详情", exact: true })
    .click();
  await expect(openAlert(page, bugTitle)).toHaveCount(0);
  await expect(openAlert(page, blockedTitle)).toHaveCount(1);
  await navigate(page, "每周回顾");
  await expect(page.locator("main")).toContainText(negativeResult);
  await expect(page.locator("main")).toContainText(/截止日期/);
  await expect(page.locator("main")).toContainText(/2026-10-16/);
  await expect(page.locator("main")).toContainText(/2026-10-23/);

  const backup = await exportData(page);
  expect(backup.monitoring?.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityId: "bug",
        kind: "progress",
        note: negativeResult,
        projectId: "research",
      }),
      expect.objectContaining({ entityId: "bug", kind: "checkpoint" }),
      expect.objectContaining({
        entityId: "bug",
        kind: "adjustment",
        previousDate: "2026-10-16",
        newDate: "2026-10-23",
      }),
    ]),
  );
  await page.reload();
  await expect(openAlert(page, bugTitle)).toHaveCount(0);
  await expect(openAlert(page, researchTitle)).toHaveCount(0);
  await navigate(page, "每周回顾");
  await expect(page.locator("main")).toContainText(negativeResult);
  expect(errors).toEqual([]);
});

test("原则与个别阈值可调整，等待按跟进日期提醒，备份保留规则和记录", async ({
  page,
  browser,
}) => {
  test.slow();
  test.setTimeout(360_000);
  await ready(page);
  await importData(page, fixture());
  await page.getByRole("button", { name: "预警原则", exact: true }).click();
  const rules = page.getByRole("dialog", { name: "预警原则", exact: true });
  await expect(rules.getByRole("table")).toBeVisible();
  for (const name of [
    "项目停滞",
    "Bug 排查停滞",
    "目标未达",
    "截止日期风险",
    "阻碍跟进",
  ]) {
    await expect(
      rules.getByRole("checkbox", { name: `启用${name}`, exact: true }),
    ).toBeChecked();
  }
  await rules.getByLabel("项目停滞阈值", { exact: true }).fill("14");
  await rules.getByLabel("项目停滞阈值", { exact: true }).blur();
  await rules.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(openAlert(page, researchTitle)).toHaveCount(0);

  await openAlert(page, bugTitle).click();
  const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
  await detail.getByText("目标检查点与跟进设置", { exact: true }).click();
  await detail.getByLabel("停滞阈值", { exact: true }).fill("3");
  await detail.getByLabel("停滞阈值", { exact: true }).blur();
  await detail
    .getByRole("button", { name: "关闭任务详情", exact: true })
    .click();
  await expect(homeAlerts(page)).not.toContainText(/Bug 排查已经过/);
  await expect(openAlert(page, bugTitle)).toHaveCount(1);
  await openAlert(page, blockedTitle).click();
  await detail.getByText("目标检查点与跟进设置", { exact: true }).click();
  await detail.getByLabel("下次跟进日期", { exact: true }).fill("2026-10-21");
  await detail
    .getByRole("button", { name: "关闭任务详情", exact: true })
    .click();
  await expect(openAlert(page, blockedTitle)).toHaveCount(0);
  await page.reload();
  await expect(openAlert(page, researchTitle)).toHaveCount(0);
  await expect(openAlert(page, blockedTitle)).toHaveCount(0);
  const backup = await exportData(page);
  expect(backup.monitoring?.rules.projectStall.days).toBe(14);
  expect(
    backup.tasks.find((item) => item.id === "bug")?.monitor?.stallDays,
  ).toBe(3);
  expect(
    backup.tasks.find((item) => item.id === "blocked")?.monitor?.followUpDate,
  ).toBe("2026-10-21");
  expect(
    backup.monitoring?.entries.some((entry) => entry.kind === "adjustment"),
  ).toBeTruthy();

  const restoredContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN",
  });
  const restored = await restoredContext.newPage();
  await ready(restored);
  await importData(restored, backup);
  await expect(openAlert(restored, researchTitle)).toHaveCount(0);
  await expect(openAlert(restored, blockedTitle)).toHaveCount(0);
  await restored.getByRole("button", { name: "预警原则", exact: true }).click();
  await expect(
    restored.getByLabel("项目停滞阈值", { exact: true }),
  ).toHaveValue("14");
  await restored
    .getByRole("dialog", { name: "预警原则", exact: true })
    .getByRole("checkbox", { name: "启用截止日期风险", exact: true })
    .uncheck();
  await restored
    .getByRole("dialog", { name: "预警原则", exact: true })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(homeAlerts(restored)).not.toContainText(/截止日期已过/);
  await expect(homeAlerts(restored)).toContainText(/验证偏移问题的最小复现/);
  await restored.clock.setFixedTime(new Date("2026-10-21T01:00:00.000Z"));
  await restored.reload();
  await expect(openAlert(restored, blockedTitle)).toHaveCount(1);
  await expect(homeAlerts(restored)).toContainText(/已到跟进日期/);
  await restoredContext.close();
});

test("预警首页、原则表和进展详情适配深色特大字号并可截图检查", async ({
  page,
}) => {
  test.slow();
  test.setTimeout(360_000);
  await ready(page);
  await importData(page, fixture());
  await expect(page.getByRole("status")).toHaveCount(0);
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, "01-home-warnings.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "外观与体验", exact: true }).click();
  const appearance = page.getByRole("dialog", {
    name: "外观与体验",
    exact: true,
  });
  await appearance.getByRole("button", { name: "深色", exact: true }).click();
  await appearance.getByRole("button", { name: "特大", exact: true }).click();
  await appearance.getByRole("button", { name: "关闭", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(screenshots, "02-dark-large-home.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "预警原则", exact: true }).click();
  const rules = page.getByRole("dialog", { name: "预警原则", exact: true });
  expect(
    await rules.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(screenshots, "03-dark-large-principles.png"),
    animations: "disabled",
  });
  await rules.getByRole("button", { name: "关闭", exact: true }).click();
  await openAlert(page, bugTitle).click();
  const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
  await detail
    .getByRole("heading", { name: "进展与预警", exact: true })
    .scrollIntoViewIfNeeded();
  await detail.getByRole("button", { name: "记录进展", exact: true }).click();
  await detail
    .getByRole("textbox", { name: "有效进展", exact: true })
    .fill(negativeResult);
  expect(
    await detail.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(screenshots, "04-dark-large-progress.png"),
    animations: "disabled",
  });
  await detail.getByRole("button", { name: "取消记录", exact: true }).click();
  await detail
    .getByRole("button", { name: "关闭任务详情", exact: true })
    .click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(homeAlerts(page)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
