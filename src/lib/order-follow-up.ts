import { orderRowSql } from './order-metrics.ts';

export const ORDER_FOLLOW_UP_STEPS = ['welcome', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
export type OrderFollowUpStep = typeof ORDER_FOLLOW_UP_STEPS[number];
export type OrderFollowUp = {
  step: OrderFollowUpStep;
  completed: number;
  note: string;
  updated_at: string;
  updated_by: string;
  revision: number;
};

export function parseOrderFollowUp(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { step, completed, note, revision } = value as Record<string, unknown>;
  if (!ORDER_FOLLOW_UP_STEPS.includes(step as OrderFollowUpStep) || typeof completed !== 'boolean' ||
      typeof note !== 'string' || note.length > 1000 || typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) || revision < 0 || (!completed && !note.trim())) return null;
  return { step: step as OrderFollowUpStep, completed, note: note.trim(), revision };
}

export async function readOrderFollowUps(db: D1Database, orderId: number) {
  const result = await db.prepare(`SELECT step, completed, note, updated_at, updated_by, revision
    FROM order_follow_ups WHERE order_id = ? ORDER BY step`).bind(orderId).all<OrderFollowUp>();
  return result.results ?? [];
}

export async function saveOrderFollowUp(db: D1Database, orderId: number, input: NonNullable<ReturnType<typeof parseOrderFollowUp>>, actor: string) {
  // One conditional statement: no read-then-write race between operators.
  const result = await db.prepare(`INSERT INTO order_follow_ups
    (order_id, step, completed, note, updated_at, updated_by, revision)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, 1
    WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND ${orderRowSql()})
      AND (?7 = 0 OR EXISTS (SELECT 1 FROM order_follow_ups WHERE order_id = ?1 AND step = ?2))
    ON CONFLICT(order_id, step) DO UPDATE SET
      completed = excluded.completed, note = excluded.note, updated_at = excluded.updated_at,
      updated_by = excluded.updated_by, revision = order_follow_ups.revision + 1
    WHERE order_follow_ups.revision = ?7
    RETURNING step, completed, note, updated_at, updated_by, revision`)
    .bind(orderId, input.step, input.completed ? 1 : 0, input.note, new Date().toISOString(), actor, input.revision)
    .first<OrderFollowUp>();
  return result;
}
