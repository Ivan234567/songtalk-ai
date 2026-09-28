import Link from 'next/link'
import styles from './landing.module.css'
import { SELLER } from '@/lib/seller'

export function DeliverySection() {
  return (
    <section id="delivery" className={styles.deliverySection} aria-labelledby="delivery-title">
      <div className={styles.deliveryInner}>
        <p className={styles.deliveryLabel}>Цифровая услуга</p>
        <h2 id="delivery-title" className={styles.deliveryTitle}>Как получить заказ после оплаты</h2>
        <p className={styles.deliveryLead}>
          Speakeasy не отправляет физический товар. После оплаты практика открывается в том же аккаунте на этом сайте.
        </p>
        <ol className={styles.deliveryList}>
          <li>Выбираете фиксированную сумму: 300, 500 или 1 000 ₽. На кнопке указана и цена, и ориентир, сколько практики на неё хватает.</li>
          <li>Платите на сайте. Деньги списывает платёжный сервис, карту сайт не хранит.</li>
          <li>Сумма зачисляется на баланс личного кабинета. Отдельная доставка, файл или письмо с заказом не нужны: доступ уже в аккаунте.</li>
          <li>Открываете собеседника, караоке или голосовые минутки, словарь и прогресс. Каждое действие списывает небольшую сумму с баланса.</li>
        </ol>
        <p className={styles.deliveryNote}>
          Если оплата прошла, а баланс не обновился, напишите в{' '}
          <a href={SELLER.telegramUrl} target="_blank" rel="noopener noreferrer">{SELLER.telegramHandle}</a>
          {' '}или на контакты из{' '}
          <Link href={`${SELLER.offerPath}#requisites`}>оферты</Link>.
        </p>
      </div>
    </section>
  )
}
