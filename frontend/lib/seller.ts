/** Реквизиты исполнителя для оферты, политики и подвала. Пустые поля на сайте не показываем. */
export const SELLER = {
  fullName: 'Капуста Иван Александрович',
  legalName: 'Индивидуальный предприниматель Капуста Иван Александрович',
  inn: '282900946150',
  ogrnip: '326310000076431',
  address: '309087, Белгородская область, Яковлевский муниципальный округ, село Стрелецкое, улица Степная, дом 26',
  email: 'ivankapusta23@gmail.com',
  phone: '+7 (980) 323-12-85',
  telegramUrl: 'https://t.me/SPEAKEASY_SUPPORT',
  telegramHandle: '@SPEAKEASY_SUPPORT',
  siteUrl: 'https://speakeasy-voice.vercel.app',
  offerPath: '/legal/offer',
  privacyPath: '/legal/privacy',
} as const

export const SELLER_ROWS: { label: string; value: string; href?: string }[] = [
  { label: 'Исполнитель', value: SELLER.legalName },
  { label: 'ИНН', value: SELLER.inn },
  { label: 'ОГРНИП', value: SELLER.ogrnip },
  { label: 'Почтовый адрес', value: SELLER.address },
  { label: 'Телефон', value: SELLER.phone, href: SELLER.phone ? `tel:${SELLER.phone.replace(/[^\d+]/g, '')}` : undefined },
  { label: 'Эл. почта', value: SELLER.email, href: SELLER.email ? `mailto:${SELLER.email}` : undefined },
  { label: 'Telegram', value: SELLER.telegramHandle, href: SELLER.telegramUrl },
  { label: 'Сайт', value: SELLER.siteUrl, href: SELLER.siteUrl },
].filter((row) => row.value)
