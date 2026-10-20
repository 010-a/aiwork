import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const nav = async (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "主要页面" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /让重要的事，有序发生/ }),
  ).toBeVisible();
}
async function add(page: Page, title: string) {
  await page.keyboard.press("Control+j");
  const input = page.getByRole("textbox", { name: "新任务标题" });
  await input.fill(title);
  await input.press("Enter");
}
test("撤销、回收站与重复任务保留真实结果", async ({ page }) => {
  test.slow();
  await ready(page);
  await add(page, "每周样本检查");
  await nav(page, "收集箱");
  await page
    .getByRole("button", { name: "查看 每周样本检查", exact: true })
    .click();
  let detail = page.getByRole("dialog", { name: "任务详情" });
  await detail.getByLabel("任务下一小步").fill("先检查对照样本");
  await detail.getByText("重复、耗时与模板（可选）", { exact: true }).click();
  await detail.getByLabel("重复此任务", { exact: true }).check();
  await detail.getByLabel("预计耗时", { exact: true }).fill("30");
  await detail.getByLabel("预计耗时", { exact: true }).blur();
  await detail.getByRole("button", { name: "存为常用模板" }).click();
  await detail.getByRole("button", { name: "标记完成", exact: true }).click();
  await page.getByRole("button", { name: "关闭任务详情" }).click();
  await nav(page, "日历安排");
  await page.getByRole("button", { name: "下一个周期" }).click();
  await expect(page.locator(".calendar-page")).toContainText("每周样本检查");
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await nav(page, "收集箱");
  await page
    .getByRole("button", { name: "查看 每周样本检查", exact: true })
    .click();
  detail = page.getByRole("dialog", { name: "任务详情" });
  await expect(
    detail.getByRole("button", { name: "标记完成", exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "删除任务", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await page.getByRole("button", { name: /回收站（1）/ }).click();
  await page.getByRole("button", { name: "恢复内容" }).click();
  await expect(page.getByText("回收站是空的。")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await nav(page, "收集箱");
  await page
    .getByRole("button", { name: "查看 每周样本检查", exact: true })
    .click();
  await expect(page.getByLabel("任务下一小步")).toHaveValue("先检查对照样本");
  await page.getByRole("button", { name: "关闭任务详情" }).click();
  await page.keyboard.press("Control+j");
  await page.getByLabel("快速添加模板").selectOption({ label: "每周样本检查" });
  await expect(page.getByLabel("新任务标题")).toHaveValue("每周样本检查");
});
test("原则可以增改删，文字原则不触发预警", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "预警原则", exact: true }).click();
  await page.getByRole("button", { name: "新增原则", exact: true }).click();
  await page.getByLabel("原则名称", { exact: true }).fill("先检查样本质量");
  await page.getByLabel("原则检查条件").selectOption("manual");
  await page.getByLabel("原则说明").fill("启动批量实验前检查对照组");
  await page.getByRole("button", { name: "保存原则", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "先检查样本质量" }),
  ).toContainText("不自动检查");
  await page
    .getByRole("button", { name: "编辑原则 先检查样本质量", exact: true })
    .click();
  await page.getByLabel("原则名称", { exact: true }).fill("先验证对照组");
  await page.getByRole("button", { name: "保存原则", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "编辑原则", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("已保存到本机浏览器", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "预警原则", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "先验证对照组" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "删除原则 先验证对照组", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "先验证对照组" }),
  ).toHaveCount(0);
});
test("视图记忆与三种图表在浅深色大字布局中可用", async ({ page }) => {
  test.slow();
  await ready(page);
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  await page.getByRole("button", { name: "载入演示", exact: true }).click();
  await nav(page, "我的项目");
  await expect(
    page.getByRole("region", { name: "继续上次工作" }),
  ).toBeVisible();
  await page.getByLabel("下一小步", { exact: true }).fill("比较下一组参数");
  await nav(page, "日历安排");
  await page.getByRole("button", { name: "月视图", exact: true }).click();
  await nav(page, "今日执行");
  await nav(page, "日历安排");
  await expect(
    page.getByRole("button", { name: "月视图", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "外观与体验", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await page.getByRole("button", { name: /特大/ }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await mkdir("work/screenshots/daily", { recursive: true });
  for (const [i, name] of [
    "任务导航",
    "收集箱",
    "今日执行",
    "我的项目",
    "日历安排",
    "每周回顾",
  ].entries()) {
    await nav(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `work/screenshots/daily/${i + 1}-${i === 4 ? "calendar" : "page"}.png`,
      fullPage: true,
    });
  }
  await nav(page, "任务导航");
  await expect(
    page.getByRole("region", { name: "项目近期进展" }),
  ).toBeVisible();
  await nav(page, "日历安排");
  await expect(
    page.getByRole("region", { name: "未来七天安排概览" }),
  ).toBeVisible();
  await nav(page, "每周回顾");
  await expect(
    page.getByRole("region", { name: "卡点持续时间" }),
  ).toBeVisible();
});

test("批量安排与今日排序均可一次撤销", async ({ page }) => {
  await ready(page);
  for (const title of ["一件", "二件", "三件"]) await add(page, title);
  await nav(page, "收集箱");
  await page.getByLabel("全选收集任务").check();
  await page.getByRole("button", { name: "安排到今天", exact: true }).click();
  await expect(page.locator(".task-row")).toHaveCount(0);
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await expect(page.locator(".task-row")).toHaveCount(3);
  await page.getByLabel("全选收集任务").check();
  await page.getByRole("button", { name: "安排到今天", exact: true }).click();
  await nav(page, "今日执行");
  const names = () =>
    page.locator(".ordered-task .task-name").allTextContents();
  expect(await names()).toEqual(["一件", "二件", "三件"]);
  await page.getByRole("button", { name: "上移 三件", exact: true }).click();
  expect(await names()).toEqual(["一件", "三件", "二件"]);
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  expect(await names()).toEqual(["一件", "二件", "三件"]);
});
