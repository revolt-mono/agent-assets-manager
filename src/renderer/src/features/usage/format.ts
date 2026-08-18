export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const wholeUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
})

export const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
})
