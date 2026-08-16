/**
 * The single Rupiah formatter for the whole system.
 *
 * There were four: `IDR 150.000` in the checkout SSR and admin tables,
 * `Rp150.000` in the checkout's own client script, `Rp 150.000` in shipping
 * ops, and `Intl` currency style on the payment page — so a buyer watched the
 * price change format the moment they picked a variant.
 *
 * `Rp` with no space is the Indonesian convention.
 */
export function formatIdr(value: number | string): string {
  return `Rp${Math.round(Number(value) || 0).toLocaleString("id-ID")}`;
}
