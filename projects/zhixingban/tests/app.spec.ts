import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

test("快捷输入保留空格，独立任务始终可见，1920px 布局正常", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("Control+j");
  const input = page.getByRole("textbox", { name: "新任务标题" });
  await input.click();
  await input.pressSequentially("Task alpha beta");
  await expect(input).toHaveValue("Task alpha beta");
  await input.press("Enter");
  await navigate(page, "收集箱");
  await page.getByLabel("选择 Task alpha beta", { exact: true }).check();
  await page.getByRole("button", { name: "转为任务", exact: true }).click();
  await navigate(page, "任务导航");
  await expect(
    page.getByRole("heading", { name: "独立任务", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "查看 Task alpha beta", exact: true })
    .click();
  const title = page.getByRole("textbox", { name: "任务名称" });
  await title.click();
  await title.press("End");
  await title.pressSequentially(" gamma");
  await expect(title).toHaveValue("Task alpha beta gamma");
  await page.getByRole("button", { name: "展开更多选项" }).click();
  const note = page.getByLabel("Obsidian 笔记链接或路径");
  await note.pressSequentially("C:\\Research Notes\\note.md");
  await expect(note).toHaveValue("C:\\Research Notes\\note.md");
  await page.getByRole("button", { name: "关闭任务详情" }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const name of [
    "任务导航",
    "收集箱",
    "今日执行",
    "我的项目",
    "日历安排",
    "每周回顾",
  ]) {
    await navigate(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
});

const taskTitle = "测试 Spotiflow 分割效果";
const projectTitle = "溶酶体分析验证";
const eventTitle = "与导师讨论分析结果";

async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "主要页面" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /让重要的事，有序发生/ }),
  ).toBeVisible();
  await expect(page.getByText("正在打开本地工作空间…")).toHaveCount(0);
}

async function capture(page: Page, title: string) {
  await navigate(page, "收集箱");
  await page.getByRole("textbox", { name: "快速记录" }).fill(title);
  await page.getByRole("textbox", { name: "快速记录" }).press("Enter");
  await expect(
    page.locator(".task-row").filter({ hasText: title }),
  ).toHaveCount(1);
}

async function exportData(page: Page) {
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出完整备份/ }).click();
  const downloaded = await downloadPromise;
  const file = await downloaded.path();
  expect(file).toBeTruthy();
  const source = await readFile(file!, "utf8");
  return { source, data: JSON.parse(source) };
}

test("空数据下六个页面正常显示且没有页面异常", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const pages = [
    ["任务导航", /让重要的事，有序发生/],
    ["收集箱", /^收集箱/],
    ["今日执行", /今天，一步一步来/],
    ["我的项目", /项目进展/],
    ["日历安排", /日历安排/],
    ["每周回顾", /本周回顾/],
  ] as const;
  for (const [name, heading] of pages) {
    await navigate(page, name);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});

test("完整任务流程、阶段、日程、刷新持久化和备份恢复", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });

  await test.step("创建项目及可编辑阶段", async () => {
    await navigate(page, "我的项目");
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "新建项目", exact: true });
    await dialog.getByLabel("项目名称", { exact: true }).fill(projectTitle);
    await dialog.getByLabel(/想达成什么/).fill("找到可靠的溶酶体分割分析流程");
    await dialog.getByRole("button", { name: "创建项目", exact: true }).click();
    await expect(page.locator(".project-summary")).toContainText(projectTitle);
    await page.getByRole("button", { name: "添加阶段", exact: true }).click();
    await page.getByRole("textbox", { name: "新阶段名称" }).fill("算法验证");
    await page
      .locator(".stage-create-form")
      .getByRole("button", { name: "添加", exact: true })
      .click();
    await page.getByRole("button", { name: "编辑阶段：算法验证" }).click();
    await page
      .getByRole("textbox", { name: "编辑阶段名称" })
      .fill("模型与算法验证");
    await page.getByRole("button", { name: "保存阶段名称" }).click();
    await expect(
      page.getByRole("button", { name: "编辑阶段：模型与算法验证" }),
    ).toBeVisible();
  });

  await test.step("收集任务、归入项目并安排到今天", async () => {
    await capture(page, taskTitle);
    await page
      .getByRole("button", { name: `查看 ${taskTitle}`, exact: true })
      .click();
    const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
    await detail
      .getByRole("combobox", { name: "所属项目" })
      .selectOption({ label: projectTitle });
    await detail
      .getByLabel("所在阶段")
      .selectOption({ label: "模型与算法验证" });
    await detail
      .getByRole("button", { name: "安排到今天", exact: true })
      .click();
    await detail.getByLabel("必须完成的截止日期", { exact: true }).fill(today);
    await detail
      .getByLabel("补充说明", { exact: true })
      .fill("先测试十张图，记录错误类型。");
    await expect(
      detail.getByRole("textbox", { name: "补充说明", exact: true }),
    ).toHaveValue("先测试十张图，记录错误类型。");
    await expect(detail.getByLabel("计划做的日期")).toHaveValue(today);
    await detail.getByRole("button", { name: "关闭任务详情" }).click();
    await expect(page.locator(".inbox-list .task-row")).toHaveCount(0);
  });

  await test.step("日历同步任务并创建、编辑固定日程", async () => {
    await navigate(page, "日历安排");
    const calendarTask = page
      .locator(".calendar-item")
      .filter({ hasText: taskTitle });
    await expect(calendarTask).toHaveCount(1);
    await expect(calendarTask).toContainText("计划 · 截止");
    await page.getByRole("button", { name: "月视图", exact: true }).click();
    await expect(page.locator(".calendar-month")).toBeVisible();
    await expect(
      page.locator(".calendar-item").filter({ hasText: taskTitle }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "周视图", exact: true }).click();
    await page
      .locator(".calendar-heading-actions")
      .getByRole("button", { name: "新建日程", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "新建日程", exact: true });
    await dialog.getByLabel("日程名称", { exact: true }).fill(eventTitle);
    await dialog.getByLabel("日期", { exact: true }).fill(today);
    await dialog.getByLabel("开始时间").fill("14:00");
    await dialog.getByLabel("结束时间").fill("13:00");
    await dialog.getByRole("button", { name: "保存日程" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "结束时间需要晚于开始时间",
    );
    await dialog.getByLabel("结束时间").fill("15:00");
    await dialog.getByRole("button", { name: "保存日程" }).click();
    await page
      .locator(".calendar-event")
      .filter({ hasText: eventTitle })
      .click();
    const edit = page.getByRole("dialog", { name: "编辑日程", exact: true });
    await edit
      .getByLabel("备注（可选）", { exact: true })
      .fill("准备分割对比图与误差清单");
    await edit.getByRole("button", { name: "保存日程" }).click();
    await expect(page.locator(".calendar-event")).toContainText("14:00–15:00");
  });

  await test.step("完成后首页、项目进度和回顾同时更新", async () => {
    await navigate(page, "今日执行");
    await expect(page.locator(".today-event")).toContainText(eventTitle);
    await page
      .getByRole("button", { name: `完成 ${taskTitle}`, exact: true })
      .click();
    await expect(page.locator(".progress-ring strong")).toContainText("100");
    await navigate(page, "任务导航");
    const branch = page.locator(".map-node").filter({ hasText: projectTitle });
    await expect(branch.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    await expect(branch).toContainText("1 已完成");
    await navigate(page, "每周回顾");
    const completed = page
      .locator(".review-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "这一周，完成了这些",
          exact: true,
        }),
      });
    await expect(completed).toContainText(taskTitle);
    await expect(
      page
        .locator(".review-stat")
        .filter({ hasText: "完成的任务" })
        .locator("strong"),
    ).toHaveText("1");
    await page
      .getByRole("textbox", { name: "本周回顾笔记" })
      .fill("这周完成首次验证，下周比较不同参数。");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /让重要的事，有序发生/ }),
    ).toBeVisible();
    await navigate(page, "每周回顾");
    await expect(
      page.getByRole("textbox", { name: "本周回顾笔记" }),
    ).toHaveValue("这周完成首次验证，下周比较不同参数。");
    await expect(page.locator(".review-task-list").first()).toContainText(
      taskTitle,
    );
  });

  const { source, data } = await exportData(page);
  expect(data.tasks).toHaveLength(1);
  expect(data.tasks[0]).toMatchObject({
    title: taskTitle,
    status: "done",
    plannedDate: today,
    dueDate: today,
    inbox: false,
  });
  expect(data.projects).toHaveLength(1);
  expect(data.stages[0].title).toBe("模型与算法验证");
  expect(data.events[0].notes).toBe("准备分割对比图与误差清单");
  expect(Object.values(data.reviewNotes)).toContain(
    "这周完成首次验证，下周比较不同参数。",
  );

  await test.step("无效 JSON 不破坏现有数据", async () => {
    await page
      .getByLabel("导入 JSON 备份")
      .setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{invalid json"),
      });
    await expect(page.getByRole("status")).toContainText("导入失败");
    await page
      .getByRole("dialog", { name: "数据与备份" })
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await expect(page.locator(".review-task-list").first()).toContainText(
      taskTitle,
    );
    await expect(
      page.getByRole("textbox", { name: "本周回顾笔记" }),
    ).toHaveValue("这周完成首次验证，下周比较不同参数。");
  });

  await test.step("新浏览器空间恢复完整备份并验证删除阶段保留任务", async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Shanghai",
      locale: "zh-CN",
      baseURL: "http://127.0.0.1:5173",
    });
    const restored = await context.newPage();
    restored.on("pageerror", (error) => errors.push(error.message));
    await ready(restored);
    await restored
      .getByRole("button", { name: "数据与备份", exact: true })
      .click();
    restored.once("dialog", (dialog) => dialog.accept());
    await restored
      .getByLabel("导入 JSON 备份")
      .setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(source),
      });
    await expect(restored.getByRole("status")).toContainText("备份已导入");
    await navigate(restored, "我的项目");
    await expect(restored.locator(".project-summary")).toContainText(
      "已完成 1 / 1 项任务",
    );
    await restored
      .getByRole("button", { name: "删除阶段：模型与算法验证" })
      .click();
    await restored
      .getByRole("dialog", { name: "删除这个阶段？" })
      .getByRole("button", { name: "删除阶段", exact: true })
      .click();
    await expect(restored.locator(".project-stages .task-row")).toContainText(
      taskTitle,
    );
    await expect(
      restored.getByRole("button", { name: "删除阶段：模型与算法验证" }),
    ).toHaveCount(0);
    await navigate(restored, "日历安排");
    await restored
      .locator(".calendar-event")
      .filter({ hasText: eventTitle })
      .click();
    await expect(
      restored.getByRole("textbox", { name: "备注（可选）", exact: true }),
    ).toHaveValue("准备分割对比图与误差清单");
    restored.once("dialog", (dialog) => dialog.accept());
    await restored
      .getByRole("dialog", { name: "编辑日程" })
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await expect(restored.locator(".calendar-event")).toHaveCount(0);
    await navigate(restored, "每周回顾");
    await expect(
      restored.getByRole("textbox", { name: "本周回顾笔记" }),
    ).toHaveValue("这周完成首次验证，下周比较不同参数。");
    await restored.reload();
    await navigate(restored, "今日执行");
    await expect(
      restored.getByRole("button", {
        name: `重新打开 ${taskTitle}`,
        exact: true,
      }),
    ).toBeVisible();
    await context.close();
  });
  expect(errors).toEqual([]);
});

test("搜索、批量整理、演示数据清除保留个人任务", async ({ page }) => {
  await ready(page);
  const personalTitle = "个人任务：整理真实实验记录";
  await capture(page, personalTitle);
  await capture(page, "个人任务：预约显微镜");
  await page.getByRole("checkbox", { name: "全选收集任务" }).check();
  await page
    .locator(".batch-toolbar")
    .getByRole("button", { name: "安排到今天", exact: true })
    .click();
  await navigate(page, "今日执行");
  await expect(page.locator(".ordered-task")).toHaveCount(2);
  await page.getByRole("textbox", { name: "搜索任务和项目" }).fill("真实实验");
  await expect(page.locator(".search-results")).toContainText(personalTitle);
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await page.getByRole("button", { name: "载入演示", exact: true }).click();
  await expect(page.locator(".demo-banner")).toBeVisible();
  await page.getByRole("textbox", { name: "搜索任务和项目" }).fill("真实实验");
  await expect(page.locator(".search-results")).toContainText(personalTitle);
  await page.getByRole("button", { name: "清除搜索" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /清除演示数据/ }).click();
  await expect(page.locator(".demo-banner")).toHaveCount(0);
  await navigate(page, "今日执行");
  await expect(page.locator(".ordered-task")).toHaveCount(2);
  await expect(
    page.locator(".ordered-task").filter({ hasText: personalTitle }),
  ).toBeVisible();
  const { data } = await exportData(page);
  expect(data.tasks).toHaveLength(2);
  expect(
    data.tasks.every((task: { demo?: boolean }) => !task.demo),
  ).toBeTruthy();
  expect(data.projects).toHaveLength(0);
  expect(data.events).toHaveLength(0);
});

test("演示工作空间六页截图并检查桌面布局", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await page.getByRole("button", { name: "载入演示", exact: true }).click();
  await expect(page.locator(".demo-banner")).toBeVisible();
  const directory = path.join(process.cwd(), "work", "screenshots");
  await mkdir(directory, { recursive: true });
  await expect(page.getByRole("status")).toHaveCount(0);
  for (const [name, file] of [
    ["任务导航", "01-home.png"],
    ["收集箱", "02-inbox.png"],
    ["今日执行", "03-today.png"],
    ["我的项目", "04-projects.png"],
    ["日历安排", "05-calendar.png"],
    ["每周回顾", "06-review.png"],
  ]) {
    await navigate(page, name);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: path.join(directory, file),
      fullPage: true,
      animations: "disabled",
    });
  }
  expect(errors).toEqual([]);
});
