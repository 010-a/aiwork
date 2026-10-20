import { useState, type Dispatch, type SetStateAction } from "react";
/** View preferences never belong to scientific task data or JSON backups. */
export function useViewState<T>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(`zhixingban-view-${key}`) ?? "null",
      );
      return valid(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  });
  const set: Dispatch<SetStateAction<T>> = (next) =>
    setValue((current) => {
      const result =
        typeof next === "function" ? (next as (value: T) => T)(current) : next;
      try {
        localStorage.setItem(`zhixingban-view-${key}`, JSON.stringify(result));
      } catch {
        /* A view preference never blocks a task edit. */
      }
      return result;
    });
  return [value, set];
}
export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
export const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length < 200;
