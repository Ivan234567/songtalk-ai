import { SELLER_ROWS } from '@/lib/seller'

export function SellerCard({ className }: { className?: string }) {
  return (
    <div className={className} id="requisites">
      {SELLER_ROWS.map((row) => (
        <p key={row.label}>
          <strong>{row.label}: </strong>
          {row.href ? <a href={row.href}>{row.value}</a> : row.value}
        </p>
      ))}
    </div>
  )
}
