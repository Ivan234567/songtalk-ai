const PREFIX = 'speakeasy.nextIntroRun.v1:'

export function introRunStorageKey(userId) {
  return `${PREFIX}${userId}`
}

export function readIntroRun(storage, userId) {
  if (!userId || !storage) return 0
  const run = Number(storage.getItem(introRunStorageKey(userId)))
  if (!Number.isInteger(run) || run < 0 || run > 100) return 0
  return run
}

export function writeIntroRun(storage, userId, run) {
  if (!userId || !storage) return
  const next = Number.isInteger(run) && run > 0 && run <= 100 ? run : 0
  const key = introRunStorageKey(userId)
  if (next === 0) storage.removeItem(key)
  else storage.setItem(key, String(next))
}
