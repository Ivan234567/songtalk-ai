import { getStoredBackendToken } from '@/lib/backend-jwt';

export type PracticeListBindKind = 'scenario' | 'debate';

/** Закрепляет сценарий или тему дебата за списком слов, для которого их собрали. */
export async function bindPracticeList(
  listId: string,
  binding: { kind: PracticeListBindKind; ref: string; origin: 'user' | 'system'; label: string },
): Promise<void> {
  const token = getStoredBackendToken();
  const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  const ref = binding.ref.trim();
  const label = binding.label.trim().slice(0, 160);
  if (!listId || !ref || !token) return;
  const response = await fetch(`${api}/api/vocabulary/lists/${encodeURIComponent(listId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      binding: {
        kind: binding.kind,
        ref,
        origin: binding.origin,
        label,
      },
    }),
  });
  if (!response.ok) {
    throw new Error('Не удалось закрепить за списком');
  }
}
