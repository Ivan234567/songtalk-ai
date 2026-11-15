import test from 'node:test'
import assert from 'node:assert/strict'
import { composeBalance } from './balance.js'

test('бонус, оплаченное и остаток сходятся с общей суммой', () => {
  const result = composeBalance(170, [
    { source_type: 'bonus', remaining_amount: 50 },
    { source_type: 'paid', remaining_amount: 100 },
    { source_type: 'legacy_unclassified', remaining_amount: 20 },
  ])
  assert.deepEqual(result, {
    balance_rub: 170,
    composition_available: true,
    bonus_rub: 50,
    paid_rub: 100,
    legacy_rub: 20,
  })
})

test('пустой баланс остаётся нулём, а не неизвестным', () => {
  assert.deepEqual(composeBalance(0, []), {
    balance_rub: 0,
    composition_available: true,
    bonus_rub: 0,
    paid_rub: 0,
    legacy_rub: 0,
  })
})

test('старый баланс без партий показывается как ранее зачисленный', () => {
  const result = composeBalance(80, [])
  assert.equal(result.composition_available, true)
  assert.equal(result.legacy_rub, 80)
  assert.equal(result.bonus_rub, 0)
  assert.equal(result.paid_rub, 0)
})

test('расхождение частей не подменяется нулём', () => {
  const result = composeBalance(10, [
    { source_type: 'bonus', remaining_amount: 50 },
  ])
  assert.equal(result.composition_available, false)
  assert.equal(result.balance_rub, 10)
  assert.equal(result.bonus_rub, null)
  assert.equal(result.paid_rub, null)
  assert.equal(result.legacy_rub, null)
})
