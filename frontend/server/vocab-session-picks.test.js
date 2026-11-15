import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickSessionCandidates,
  buildSessionPickReason,
  scoreSceneFit,
  classifySenseMilestone,
} from './vocab-session-picks.js'

const rng = () => 0.5

test('fit к сцене поднимает подходящие слова', () => {
  assert.ok(scoreSceneFit({ headword: 'rent', glossRu: 'аренда квартиры' }, 'rent apartment landlord') > 0)
  assert.equal(scoreSceneFit({ headword: 'apple', glossRu: 'яблоко' }, 'rent apartment'), 0)
})

test('отбор: due раньше mastered, учитывает fit и лимит 5', () => {
  const candidates = [
    { senseId: '1', headword: 'mastered', glossRu: 'освоено', status: 'mastered' },
    { senseId: '2', headword: 'lease', glossRu: 'rent for apartment', status: 'due' },
    { senseId: '3', headword: 'rent', glossRu: 'плата rent', status: 'learning' },
    { senseId: '4', headword: 'banana', glossRu: 'фрукт', status: 'new' },
    { senseId: '5', headword: 'guitar', glossRu: 'музыка', status: 'new' },
    { senseId: '6', headword: 'landlord', glossRu: 'owner landlord', status: 'new' },
  ]
  const { items, reason } = pickSessionCandidates(candidates, {
    limit: 5,
    sceneText: 'rent apartment landlord',
    rng,
  })
  assert.ok(items.length >= 3)
  assert.equal(items[0].senseId, '2')
  assert.ok(items.some((item) => item.senseId === '3'))
  assert.ok(items.some((item) => item.senseId === '6'))
  assert.ok(items.every((item) => item.senseId !== '4'))
  assert.match(reason, /Подобрали|на повторение|изучении|сцене/)
})

test('exclude и reason строка', () => {
  const { items, reason } = pickSessionCandidates([
    { senseId: 'a', headword: 'a', glossRu: 'а', status: 'due' },
    { senseId: 'b', headword: 'b', glossRu: 'б', status: 'learning' },
  ], { limit: 5, excludeSenseIds: ['a'], rng })
  assert.deepEqual(items.map((item) => item.senseId), ['b'])
  assert.equal(buildSessionPickReason(items), reason)
})

test('вехи Exposed → Produced → Stable → Transferred', () => {
  assert.equal(classifySenseMilestone({ status: 'new', producedCount: 0, sessionAppearances: 0 }), 'new')
  assert.equal(classifySenseMilestone({ status: 'new', producedCount: 0, sessionAppearances: 1 }), 'exposed')
  assert.equal(classifySenseMilestone({ status: 'learning', producedCount: 1, sessionAppearances: 1 }), 'produced')
  assert.equal(classifySenseMilestone({ status: 'mastered', producedCount: 0, sessionAppearances: 2 }), 'stable')
  assert.equal(classifySenseMilestone({ status: 'mastered', producedCount: 2, sessionAppearances: 3 }), 'transferred')
})

test('due без fit не попадает в пятёрку, если есть слова со стыком к сцене', () => {
  const { items, weak_scene_fit: weak } = pickSessionCandidates([
    { senseId: 'due-off', headword: 'banana', glossRu: 'банан', status: 'due' },
    { senseId: 'fit-new', headword: 'rent', glossRu: 'аренда', status: 'new' },
    { senseId: 'fit-learn', headword: 'landlord', glossRu: 'арендодатель', status: 'learning' },
  ], { limit: 5, sceneText: 'rent apartment landlord', rng })
  assert.equal(weak, false)
  assert.ok(items.every((item) => item.senseId !== 'due-off'))
  assert.ok(items.some((item) => item.senseId === 'fit-new'))
})

test('если никто не стыкуется со сценой — fallback на SRS с пометкой', () => {
  const { items, reason, weak_scene_fit: weak } = pickSessionCandidates([
    { senseId: 'd', headword: 'due', glossRu: 'срок', status: 'due' },
    { senseId: 'n', headword: 'new', glossRu: 'новое', status: 'new' },
  ], { limit: 2, sceneText: 'airport taxi terminal', rng })
  assert.equal(weak, true)
  assert.equal(items[0].senseId, 'd')
  assert.match(reason, /карточках|слабо/)
})
