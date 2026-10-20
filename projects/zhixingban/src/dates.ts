/** Calendar dates always use the computer's local time, never UTC truncation. */
export function dateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("无效日期");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function localDate(value: string): Date {
  if (!isDateKey(value)) throw new Error(`无效日期：${value}`);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(value: string, count: number): string {
  const date = localDate(value);
  date.setDate(date.getDate() + count);
  return dateKey(date);
}

export function weekStart(value: string): string {
  const date = localDate(value);
  return addDays(value, -((date.getDay() + 6) % 7));
}

export function weekEnd(value: string): string {
  return addDays(weekStart(value), 6);
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: "numeric", day: "numeric" },
): string {
  return localDate(value).toLocaleDateString("zh-CN", options);
}
