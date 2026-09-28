/** Сумма к оплате с комиссией ЮKassa. Формула совпадает с backend/src/yookassa.js */

export type TopupMethod = 'sbp' | 'other';

const SBP_FEE_BPS = 70;
const CARD_FEE_BPS = 350;
const CARD_VAT_BPS = 2200;
const OTHER_FEE_BPS = Math.round((CARD_FEE_BPS * (10000 + CARD_VAT_BPS)) / 10000);

export function chargeKopecks(creditRub: number, method: TopupMethod): number {
  const creditKop = Math.round(creditRub * 100);
  const feeBps = method === 'sbp' ? SBP_FEE_BPS : OTHER_FEE_BPS;
  const denom = 10000 - feeBps;
  return Math.floor((creditKop * 10000 + denom - 1) / denom);
}

export function formatChargeRub(kopecks: number): string {
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kopecks / 100);
  return `${formatted} ₽`;
}
