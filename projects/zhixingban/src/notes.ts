export function noteHref(value?: string): string | undefined {
  const note = value?.trim();
  if (!note) return undefined;
  if (/^obsidian:\/\//i.test(note)) return note;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(note) && !/^[A-Za-z]:[\\/]/.test(note))
    return undefined;
  return `obsidian://open?path=${encodeURIComponent(note)}`;
}
