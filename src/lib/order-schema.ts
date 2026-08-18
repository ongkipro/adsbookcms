import { z } from 'zod';
import {
  AUTOLARIS_CHECKOUT_CHANNELS,
  autoLarisChannelLockReason,
} from './autolaris-client.ts';

import { normalizePhone } from './validation.ts';
export const normalizePhoneNumber = normalizePhone;

export const orderSubmitSchema = z.object({
  customer_name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
  customer_phone: z.string().transform(normalizePhone).pipe(
    z.string().regex(/^(08|628)\d{8,11}$/, 'Nomor WhatsApp / HP tidak valid. Contoh: 081234567890'),
  ),
  customer_email: z.string().trim().email('Email pembayaran tidak valid').max(160).optional().or(z.literal('')),
  address: z.string().trim().min(10, 'Alamat lengkap minimal 10 karakter').max(500),
  district: z.string().trim().min(2, 'Kecamatan harus diisi').max(120),
  province: z.string().trim().min(2, 'Provinsi harus diisi').max(120),
  postal_code: z.string().trim().regex(/^\d{5}$/, 'Kode pos harus 5 digit').optional().or(z.literal('')),
  payment_method: z.enum(['cod', 'bank_transfer', 'qris', 'manual_transfer']).default('cod'),
  payment_channel: z.enum(AUTOLARIS_CHECKOUT_CHANNELS).optional(),
  seller_bank_account_id: z.coerce.number().int().positive().optional(),
  variant_id: z.union([z.string(), z.number().transform(String)]).pipe(
    z.string().trim().min(1, 'Varian produk harus dipilih').max(120),
  ),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  submit_token: z.string().trim().min(16, 'Token submit tidak valid').max(120),
  website: z.string().optional(), // Honeypot field
}).superRefine((input, context) => {
  if (input.payment_method === 'cod') return;
  if (input.payment_method === 'manual_transfer') {
    if (!input.seller_bank_account_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seller_bank_account_id'],
        message: 'Rekening transfer wajib dipilih',
      });
    }
    return;
  }
  if (!input.payment_channel) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payment_channel'],
      message: 'Channel pembayaran wajib dipilih',
    });
  } else if (autoLarisChannelLockReason(input.payment_channel)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payment_channel'],
      message: 'Channel pembayaran tidak aktif di provider',
    });
  }
  if (input.payment_method === 'qris' && input.payment_channel !== 'QRIS') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payment_channel'],
      message: 'Channel QRIS tidak cocok dengan metode pembayaran',
    });
  }
  if (input.payment_method === 'bank_transfer' && input.payment_channel === 'QRIS') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payment_channel'],
      message: 'Channel transfer tidak cocok dengan metode pembayaran',
    });
  }
});

export type OrderSubmitInput = z.infer<typeof orderSubmitSchema>;
