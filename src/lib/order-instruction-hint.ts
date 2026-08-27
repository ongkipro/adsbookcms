/**
 * Whether an order's payment instruction is dead, for the admin order list.
 *
 * An order can sit at `pending` while the AutoLaris instruction behind it
 * failed at checkout or expired unpaid — the two were indistinguishable in the
 * list, and an operator would tell a buyer to pay a VA that no longer exists.
 *
 * Lives here rather than inside the React component because the component is
 * not reachable from `node --test`, and this is exactly the branch that broke
 * the admin: the field is produced independently by the API mapper and by the
 * server-rendered first paint, and one of them omitted it entirely.
 */
export type PaymentInstructionHint = "failed" | "expired" | null;

const DEAD_INSTRUCTION_STATUSES = new Set(["failed", "expired"]);
const PAID_PAYMENT_STATUSES = new Set(["paid", "settled", "success"]);

export function paymentInstructionHint(
  paymentStatus: string | null | undefined,
  instructionStatus: string | null | undefined,
): PaymentInstructionHint {
  const instruction = (instructionStatus || "").trim().toLowerCase();
  if (!DEAD_INSTRUCTION_STATUSES.has(instruction)) return null;
  // A paid order's earlier failed attempt is history, not an operator warning.
  if (PAID_PAYMENT_STATUSES.has((paymentStatus || "").trim().toLowerCase())) return null;
  return instruction as PaymentInstructionHint;
}
