import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  clipOptional,
  createClickLimiter,
  normalizeAnonymousId,
  normalizeReferralCode,
} from './referral.js'

const exchange = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8')

test('код и анонимный идентификатор принимают только безопасный формат', () => {
  assert.equal(normalizeReferralCode(' spk4m8q2 '), 'SPK4M8Q2')
  assert.equal(normalizeReferralCode('a'), null)
  assert.equal(normalizeReferralCode('../admin'), null)
  assert.equal(normalizeAnonymousId('abc-def_12'), 'abc-def_12')
  assert.equal(normalizeAnonymousId('short'), null)
  assert.equal(normalizeAnonymousId('has space!!'), null)
  assert.equal(clipOptional('  /r/SPK4M8Q2  ', 8), '/r/SPK4M')
  assert.equal(clipOptional('   ', 8), null)
})

test('клики с одного адреса ограничены', () => {
  const allow = createClickLimiter({ limit: 2, windowMs: 60_000 })
  assert.equal(allow('1.1.1.1'), true)
  assert.equal(allow('1.1.1.1'), true)
  assert.equal(allow('1.1.1.1'), false)
  assert.equal(allow('2.2.2.2'), true)
})

test('обмен токена сначала привязывает реферала, потом начисляет бонус', () => {
  const attributeAt = exchange.indexOf("rpc('attribute_referral'")
  const bonusAt = exchange.indexOf("rpc('grant_welcome_bonus'")
  assert.equal(attributeAt > 0, true)
  assert.equal(bonusAt > attributeAt, true)
  assert.match(exchange, /anonymousId && referralCode/)
  assert.match(exchange, /p_referral_code: referralCode/)
  assert.match(exchange, /app\.post\('\/api\/referral\/click'/)
  assert.match(exchange, /record_referral_click/)
  assert.equal(exchange.includes("reason: 'welcome_bonus'"), false)
})
