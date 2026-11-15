/** Классический SM-2. День равен 24 часам, чтобы срок не зависел от часового пояса. */
const DAY_MS = 24 * 60 * 60 * 1000

export const SM2_MIN_EASE = 1.3
export const SM2_DEFAULT_EASE = 2.5

function requireDate(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('SM-2 now must be a valid Date')
  }
  return now
}

function assertQuality(quality) {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new TypeError('SM-2 quality must be an integer from 0 to 5')
  }
}

function easeDeltaHundredths(quality) {
  const difficulty = 5 - quality
  return 10 - 8 * difficulty - 2 * difficulty * difficulty
}

function nextEaseFactor(easeFactor, quality) {
  const current = Math.round(easeFactor * 100)
  const updated = current + easeDeltaHundredths(quality)
  return Math.max(Math.round(SM2_MIN_EASE * 100), updated) / 100
}

/**
 * Начальное состояние новой карточки. dueAt совпадает с моментом создания:
 * карточка сразу доступна, интервал ещё не начат.
 */
export function createInitialSm2State(now) {
  const at = requireDate(now)
  return {
    easeFactor: SM2_DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    dueAt: new Date(at.getTime()),
  }
}

/**
 * Один шаг SM-2. Не меняет входное состояние.
 * Интервал считается по прежнему easeFactor, затем ease обновляется.
 * q >= 3: первый успех → 1 день, второй → 6 дней, дальше round(интервал × ease).
 * q < 3: серия сбрасывается, следующий показ через 1 день.
 */
export function applySm2Review(state, quality, now) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('SM-2 state is required')
  }
  assertQuality(quality)
  const at = requireDate(now)
  const easeFactor = Number(state.easeFactor)
  const intervalDays = state.intervalDays
  const repetitions = state.repetitions
  if (!Number.isFinite(easeFactor) || easeFactor <= 0) {
    throw new TypeError('SM-2 easeFactor must be a positive number')
  }
  if (!Number.isInteger(intervalDays) || intervalDays < 0) {
    throw new TypeError('SM-2 intervalDays must be a non-negative integer')
  }
  if (!Number.isInteger(repetitions) || repetitions < 0) {
    throw new TypeError('SM-2 repetitions must be a non-negative integer')
  }

  let nextInterval = intervalDays
  let nextRepetitions = repetitions
  if (quality >= 3) {
    if (repetitions <= 0) nextInterval = 1
    else if (repetitions === 1) nextInterval = 6
    else nextInterval = Math.round(intervalDays * easeFactor)
    nextRepetitions = repetitions + 1
  } else {
    nextInterval = 1
    nextRepetitions = 0
  }

  return {
    easeFactor: nextEaseFactor(easeFactor, quality),
    intervalDays: nextInterval,
    repetitions: nextRepetitions,
    dueAt: new Date(at.getTime() + nextInterval * DAY_MS),
  }
}
