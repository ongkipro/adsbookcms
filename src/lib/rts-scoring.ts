import { MengantarClient } from './mengantar-client';
import { getProviderConfig } from './provider-config';
import { parseReceiverPerformance, type ReceiverPerformance } from './receiver-performance';


export async function getReceiverPerformance(
  database: D1Database,
  customerPhone: string,
  locals?: App.Locals,
): Promise<ReceiverPerformance> {
  const cleanPhone = customerPhone.replace(/\D/g, '');
  if (cleanPhone.length < 9) throw new Error('Nomor penerima tidak valid.');

  const config = (await getProviderConfig(database, locals)).mengantar;
  if (!config.apiKey) throw new Error('Mengantar API belum dikonfigurasi.');

  const client = new MengantarClient(config.apiKey, config.baseUrl);
  const payload = await client.getReceiverPerformance(cleanPhone);
  return parseReceiverPerformance(payload, cleanPhone);
}

async function refreshOrderReceiverPerformance(
  database: D1Database,
  orderNumber: string,
  customerPhone: string,
  locals?: App.Locals,
): Promise<void> {
  const performance = await getReceiverPerformance(database, customerPhone, locals);

  await database
    .prepare(
      `UPDATE orders
       SET receiver_rts_score = ?,
           rts_risk_label = ?,
           receiver_performance_json = ?,
           receiver_performance_checked_at = ?
       WHERE order_number = ? OR CAST(id AS TEXT) = ?`,
    )
    .bind(
      performance.deliveryRate == null ? null : Math.round(performance.deliveryRate),
      performance.riskLevel,
      JSON.stringify(performance),
      performance.checkedAt,
      orderNumber,
      orderNumber,
    )
    .run();
}

export function scheduleReceiverPerformanceRefresh(
  database: D1Database,
  orderNumber: string,
  customerPhone: string,
  locals?: App.Locals,
): void {
  const task = refreshOrderReceiverPerformance(database, orderNumber, customerPhone, locals)
    .catch((error) => console.error('Background receiver performance error:', error));

  if (locals?.cfContext) {
    locals.cfContext.waitUntil(task);
    return;
  }

  void task;
}

