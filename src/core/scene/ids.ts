/** Generate a stable, human-scannable id: `${prefix}_${8 hex chars}`. */
export function newId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${prefix}_${hex}`;
}
