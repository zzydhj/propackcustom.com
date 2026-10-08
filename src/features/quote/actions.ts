'use server';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const rfqSchema = z.object({
  productName: z.string().min(1, 'required'),
  quantity: z.coerce.number().int().positive('invalid'),
  material: z.string().optional(),
  size: z.string().optional(),
  country: z.string().min(2, 'required'),
  contactName: z.string().min(1, 'required'),
  email: z.string().email('invalid'),
  notes: z.string().max(2000).optional(),
  designId: z.string().optional(),
});

export type RfqState = {
  ok: boolean;
  errors?: Partial<Record<keyof z.infer<typeof rfqSchema>, string>>;
  quoteId?: string;
};

export async function submitRfq(_prev: RfqState | null, formData: FormData): Promise<RfqState> {
  const raw = {
    productName: formData.get('productName'),
    quantity: formData.get('quantity'),
    material: formData.get('material') || undefined,
    size: formData.get('size') || undefined,
    country: formData.get('country'),
    contactName: formData.get('contactName'),
    email: formData.get('email'),
    notes: formData.get('notes') || undefined,
    designId: formData.get('designId') || undefined,
  };

  const parsed = rfqSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: RfqState['errors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof rfqSchema>;
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, errors: fieldErrors };
  }

  const d = parsed.data;
  const quote = await prisma.quote.create({
    data: {
      productName: d.productName,
      quantity: d.quantity,
      country: d.country,
      contactName: d.contactName,
      email: d.email,
      notes: d.notes,
      detail: { material: d.material ?? null, size: d.size ?? null },
      designId: d.designId ?? null,
    },
  });

  return { ok: true, quoteId: quote.id };
}
