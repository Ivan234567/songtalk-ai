/** 200 ₽ баланса = 1 час на экране. Списание идёт по фактической стоимости, не по этому часу. */
export const PRACTICE_RUB_PER_HOUR = 200;

export function practiceMinutesFromRub(balanceRub: number): number {
  if (!Number.isFinite(balanceRub) || balanceRub <= 0) return 0;
  return Math.round((balanceRub * 60) / PRACTICE_RUB_PER_HOUR);
}

export function formatPracticeRemaining(balanceRub: number): string {
  const minutes = practiceMinutesFromRub(balanceRub);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `≈ ${mins} мин практики`;
  if (mins === 0) return `≈ ${hours} ч практики`;
  return `≈ ${hours} ч ${mins} мин практики`;
}

/** Короткая подпись для шапки: «25 ч», «40 мин». */
export function formatPracticeRemainingShort(balanceRub: number): string {
  const minutes = practiceMinutesFromRub(balanceRub);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins} мин`;
  if (mins === 0) return `${hours} ч`;
  return `${hours} ч ${mins} мин`;
}
