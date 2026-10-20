import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const settingsName = "外观与体验";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让重要的事，有序发生/ })).toBeVisible();
}

async function openAppearance(page: Page) {
  await page.getByRole("button", { name: settingsName, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: settingsName, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeAppearance(page: Page) {
  await page.getByRole("dialog", { name: settingsName, exact: true })
    .getByRole("button", { name: "关闭", exact: true }).click();
}

async function navigate(page: Page, name: string) {
  await page.getByRole("navigation", { name: "主要页面" })
    .getByRole("button", { name: new RegExp(`^${name}`) }).click();
}

test("旧外观设置保留配色并使用更大默认字体，字号选择刷新后仍保留", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("zhixingban-appearance-v1"))
      localStorage.setItem(
        "zhixingban-appearance-v1",
        JSON.stringify({
          mode: "dark",
          accent: "purple",
          density: "compact",
          reduceMotion: false,
        }),
      );
  });
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
  await expect(page.locator("html")).toHaveAttribute(
    "data-font-size",
    "standard",
  );
  expect(
    await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("16px");
  await navigate(page, "收集箱");
  await page
    .getByRole("textbox", { name: "快速记录" })
    .fill("检查全局字号调整");
  await page.getByRole("textbox", { name: "快速记录" }).press("Enter");
  expect(
    await page
      .locator(".inbox-list .task-name")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const settings = await openAppearance(page);
  for (const [name, value, pixels] of [
    ["较小", "small", 14],
    ["标准（默认）", "standard", 16],
    ["较大", "large", 18],
    ["特大", "extra-large", 20],
  ] as const) {
    await settings
      .getByRole("group", { name: "字体大小" })
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-font-size", value);
    await expect(
      settings.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page
        .locator("html")
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBe(pixels);
    expect(
      await page
        .locator(".inbox-list .task-name")
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeCloseTo(pixels, 1);
  }
  await closeAppearance(page);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute(
    "data-font-size",
    "extra-large",
  );
  const second = await context.newPage();
  await ready(second);
  await expect(second.locator("html")).toHaveAttribute(
    "data-font-size",
    "extra-large",
  );
  await openAppearance(page);
  await page.getByRole("button", { name: "标准（默认）", exact: true }).click();
  await expect(second.locator("html")).toHaveAttribute(
    "data-font-size",
    "standard",
  );
  await second.close();
  await page.getByRole("button", { name: "恢复默认外观", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-font-size",
    "standard",
  );
});

test("特大字号下六页、任务详情和外观面板可读且不横向溢出", async ({ page }) => {
  // Twelve page visits and eight screenshots need extra time on slower CI machines.
  test.slow();
  await ready(page);
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await page.getByRole("button", { name: "载入演示", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  const settings = await openAppearance(page);
  await settings.getByRole("button", { name: "特大", exact: true }).click();
  await settings.getByRole("button", { name: "深色", exact: true }).click();
  expect(
    await settings.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBeTruthy();
  await closeAppearance(page);
  const directory = path.join(
    process.cwd(),
    "work",
    "screenshots",
    "font-size",
  );
  await mkdir(directory, { recursive: true });
  const pages = [
    "任务导航",
    "收集箱",
    "今日执行",
    "我的项目",
    "日历安排",
    "每周回顾",
  ];
  for (const [index, name] of pages.entries()) {
    await navigate(page, name);
    if (index === 0) {
      const title = page.locator(".map-root strong");
      expect(
        await title.evaluate(
          (element) =>
            element.getBoundingClientRect().height /
            parseFloat(getComputedStyle(element).fontSize),
        ),
      ).toBeLessThan(1.6);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(
      await page
        .locator(".sidebar")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBeTruthy();
    await page.screenshot({
      path: path.join(directory, `${index + 1}-extra-large.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
  await navigate(page, "今日执行");
  await page
    .getByRole("button", { name: "查看 测试 Spotiflow 分割效果", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
  expect(
    await detail.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: path.join(directory, "7-extra-large-detail.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "关闭任务详情", exact: true }).click();
  await openAppearance(page);
  await page.screenshot({
    path: path.join(directory, "8-font-settings.png"),
    animations: "disabled",
  });
  await closeAppearance(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const name of pages) {
    await navigate(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
});

test("跟随系统实时响应，手动浅色和深色能覆盖系统设置", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await ready(page);
  const settings = await openAppearance(page);
  await settings.getByRole("button", { name: "跟随系统", exact: true }).click();
  await expect(settings.getByRole("button", { name: "跟随系统", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await settings.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await settings.getByRole("button", { name: "浅色", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const reopened = await openAppearance(page);
  await expect(reopened.getByRole("button", { name: "浅色", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
});

test("六种主题色、布局密度和减少动态效果都会保存到本机", async ({ page }) => {
  await ready(page);
  await navigate(page, "收集箱");
  await page.getByRole("textbox", { name: "快速记录", exact: true }).fill("检查任务显示密度");
  await page.getByRole("textbox", { name: "快速记录", exact: true }).press("Enter");
  const comfortableHeight = (await page.locator(".inbox-list .task-row").boundingBox())!.height;
  const settings = await openAppearance(page);
  for (const [name, value] of [
    ["海洋蓝", "blue"], ["鸢尾紫", "purple"], ["森林绿", "green"],
    ["玫瑰粉", "rose"], ["日落橙", "orange"], ["石墨灰", "graphite"],
  ]) {
    const radio = settings.getByRole("radio", { name, exact: true });
    await radio.click();
    await expect(radio).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-accent", value);
  }
  await settings.getByRole("radio", { name: "鸢尾紫", exact: true }).click();
  await settings.getByRole("button", { name: "紧凑", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await settings.getByRole("checkbox", { name: "减少动态效果", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  const durations = await page.locator(".topbar .btn-primary").evaluate(element =>
    getComputedStyle(element).transitionDuration.split(",").map(value => Number.parseFloat(value)));
  expect(durations.every(duration => duration <= 0.01)).toBeTruthy();

  await closeAppearance(page);
  const compactHeight = (await page.locator(".inbox-list .task-row").boundingBox())!.height;
  expect(compactHeight).toBeLessThan(comfortableHeight);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  const saved = await page.evaluate(() => localStorage.getItem("zhixingban-appearance-v1"));
  expect(saved).toBeTruthy();
  expect(() => JSON.parse(saved!)).not.toThrow();
  const reopened = await openAppearance(page);
  await expect(reopened.getByRole("radio", { name: "鸢尾紫", exact: true }))
    .toBeChecked();
  await expect(reopened.getByRole("button", { name: "紧凑", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(reopened.getByRole("checkbox", { name: "减少动态效果", exact: true })).toBeChecked();
  await reopened.getByRole("button", { name: "舒适", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  await reopened.getByRole("checkbox", { name: "减少动态效果", exact: true }).uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
  await expect(reopened.getByRole("checkbox", { name: "减少动态效果", exact: true })).not.toBeChecked();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "false");
  await reopened.getByRole("button", { name: "恢复默认外观", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
  await expect(reopened.getByRole("button", { name: "跟随系统", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
});

test("快捷添加直接接收输入，Escape 恢复焦点，搜索支持键盘打开任务", async ({ page }) => {
  await ready(page);
  const trigger = page.getByRole("button", { name: /随手记一件事/ });
  await trigger.focus();
  await page.keyboard.press("Control+j");
  const input = page.getByRole("textbox", { name: "新任务标题", exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.type("Keyboard focus check");
  await expect(input).toHaveValue("Keyboard focus check");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "记下一件事" })).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Control+j");
  await expect(input).toBeFocused();
  await page.keyboard.type("Keyboard search target");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "记下一件事" })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "搜索任务和项目", exact: true });
  await expect(search).toBeFocused();
  await page.keyboard.type("Keyboard search target");
  await expect(page.locator(".search-results")).toContainText("Keyboard search target");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("textbox", { name: "任务名称", exact: true }))
    .toHaveValue("Keyboard search target");
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("连续记录、清空重写任务名称和嵌套删除确认保持输入与焦点", async ({ page }) => {
  test.slow();
  await ready(page);
  await page.keyboard.press("Control+j");
  const quickDialog = page.getByRole("dialog", { name: "记下一件事", exact: true });
  const input = quickDialog.getByRole("textbox", { name: "新任务标题", exact: true });
  await expect(input).toBeFocused();
  await page.keyboard.type("Rapid capture first");
  await page.keyboard.press("Shift+Enter");
  await expect(quickDialog).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await page.keyboard.type("Rapid capture second");
  await quickDialog.getByRole("button", { name: "保存并继续", exact: true }).click();
  await expect(quickDialog).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await page.keyboard.type("Rapid capture third");
  await page.keyboard.press("Enter");
  await expect(quickDialog).toHaveCount(0);
  await navigate(page, "收集箱");
  await expect(page.locator(".inbox-list .task-row")).toHaveCount(3);
  for (const title of ["Rapid capture first", "Rapid capture second", "Rapid capture third"]) {
    await expect(page.locator(".inbox-list .task-row").filter({ hasText: title })).toBeVisible();
  }

  await page.getByRole("button", { name: "查看 Rapid capture first", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "任务详情", exact: true });
  const title = detail.getByRole("textbox", { name: "任务名称", exact: true });
  await title.fill("");
  await expect(title).toHaveValue("");
  await title.pressSequentially("Edited first task with spaces");
  await expect(title).toHaveValue("Edited first task with spaces");
  await detail.getByRole("button", { name: "标记重要任务", exact: true }).focus();
  await detail.getByRole("button", { name: "关闭任务详情", exact: true }).click();
  await page.reload();
  await navigate(page, "收集箱");
  await expect(page.locator(".inbox-list .task-row")).toHaveCount(3);
  await page.getByRole("button", { name: "查看 Edited first task with spaces", exact: true }).click();
  await expect(detail.getByRole("textbox", { name: "任务名称", exact: true }))
    .toHaveValue("Edited first task with spaces");
  const remove = detail.getByRole("button", { name: "删除任务", exact: true });
  await remove.click();
  const confirmation = page.getByRole("dialog", { name: "删除这件任务？", exact: true });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("button", { name: "保留任务", exact: true })).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(remove).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  await remove.click();
  await confirmation.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(detail).toHaveCount(0);
  await expect(page.locator(".inbox-list .task-row")).toHaveCount(2);
  await expect(page.locator(".inbox-list .task-row").filter({ hasText: "Edited first task with spaces" })).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  expect(await page.evaluate(() => document.getElementById("root")?.hasAttribute("inert"))).toBe(false);
  await navigate(page, "任务导航");
  await expect(page.getByRole("heading", { name: /让重要的事，有序发生/ })).toBeVisible();
});

test("深色主题的六个页面和外观面板布局正常，切回浅色后保持主题色", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await page.getByRole("button", { name: "载入演示", exact: true }).click();
  await expect(page.locator(".demo-banner")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  const settings = await openAppearance(page);
  await settings.getByRole("button", { name: "深色", exact: true }).click();
  await settings.getByRole("radio", { name: "鸢尾紫", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const directory = path.join(process.cwd(), "work", "screenshots", "appearance");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, "00-dark-settings.png"), animations: "disabled" });
  await closeAppearance(page);

  for (const [name, file] of [
    ["任务导航", "01-dark-home.png"], ["收集箱", "02-dark-inbox.png"],
    ["今日执行", "03-dark-today.png"], ["我的项目", "04-dark-projects.png"],
    ["日历安排", "05-dark-calendar.png"], ["每周回顾", "06-dark-review.png"],
  ]) {
    await navigate(page, name);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("main h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: path.join(directory, file), fullPage: true, animations: "disabled" });
  }
  await navigate(page, "任务导航");
  const darkCardBackground = await page.locator(".task-map-card").evaluate(element => getComputedStyle(element).backgroundColor);
  const darkTextColor = await page.locator(".task-map-card h2").evaluate(element => getComputedStyle(element).color);
  await openAppearance(page);
  await page.getByRole("dialog", { name: settingsName, exact: true }).getByRole("button", { name: "浅色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await closeAppearance(page);
  const lightCardBackground = await page.locator(".task-map-card").evaluate(element => getComputedStyle(element).backgroundColor);
  const lightTextColor = await page.locator(".task-map-card h2").evaluate(element => getComputedStyle(element).color);
  expect(darkCardBackground).not.toBe(lightCardBackground);
  expect(darkTextColor).not.toBe(lightTextColor);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
  await page.screenshot({ path: path.join(directory, "07-light-purple-home.png"), fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
