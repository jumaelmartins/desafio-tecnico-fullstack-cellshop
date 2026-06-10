import { z } from 'zod';

export const checkoutSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1, 'productId é obrigatório'),
            quantity: z
              .number({ invalid_type_error: 'quantity deve ser um número' })
              .int('quantity deve ser um número inteiro')
              .min(1, 'quantity mínima é 1')
              .max(99, 'quantity máxima é 99 por pedido'),
          })
          .strict()
      )
      .min(1, 'informe ao menos 1 item')
      .max(10, 'máximo de 10 itens por pedido'),
  })
  .strict();

export type CheckoutPayload = z.infer<typeof checkoutSchema>;
