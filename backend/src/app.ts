import express, { Express, Request, Response } from 'express';
import { AppError, OrderNotFoundError, ValidationError } from './domain/errors';
import { Order } from './domain/types';
import { cors, errorHandler, requestLogger, traceId } from './http/middleware';
import { checkoutSchema } from './http/validation';
import { CheckoutService } from './services/checkout';
import { ErpGateway, erpFromEnv } from './services/erp';
import { InventoryService } from './services/inventory';
import { OrderProcessor, ProcessorOptions } from './services/orderProcessor';
import { MemoryStore, seedProducts } from './store/memory';

export interface AppDeps {
  /** Permite injetar um ERP fake nos testes. */
  erp?: ErpGateway;
  processorOptions?: ProcessorOptions;
  reservationTtlMs?: number;
}

/**
 * A Idempotency-Key é um detalhe do protocolo (vai no header), não do
 * recurso: o contrato documentado (README/RESPOSTAS.md) e os tipos do
 * front não a expõem, então a API também não.
 */
function toPublicOrder(order: Order): Omit<Order, 'idempotencyKey'> {
  const { idempotencyKey: _internal, ...publicOrder } = order;
  return publicOrder;
}

export interface Container {
  store: MemoryStore;
  inventory: InventoryService;
  processor: OrderProcessor;
  checkout: CheckoutService;
}

/**
 * Fábrica do app. Cada chamada cria um estado isolado (store novo),
 * o que mantém os testes independentes entre si.
 */
export function createApp(deps: AppDeps = {}): { app: Express; container: Container } {
  const store = new MemoryStore();
  seedProducts(store);

  const inventory = new InventoryService(store, deps.reservationTtlMs);
  const erp = deps.erp ?? erpFromEnv();
  const processor = new OrderProcessor(store, inventory, erp, deps.processorOptions);
  const checkout = new CheckoutService(store, inventory, processor);

  const app = express();
  // traceId vem PRIMEIRO: assim toda requisição ganha traceId + header
  // X-Trace-Id, inclusive as que falham no parse do corpo (JSON malformado),
  // cujo erro é lançado pelo próprio express.json().
  app.use(traceId);
  app.use(cors);
  app.use(requestLogger);
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  // ── Catálogo ────────────────────────────────────────────────────────────
  app.get('/api/products', (_req: Request, res: Response) => {
    res.json({ products: [...store.products.values()] });
  });

  app.get('/api/products/:id', (req: Request, res: Response) => {
    const product = store.products.get(req.params.id);
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `Produto não encontrado: ${req.params.id}.`, {
        productId: req.params.id,
      });
    }
    res.json({ product });
  });

  // ── Checkout ────────────────────────────────────────────────────────────
  app.post('/api/orders', (req: Request, res: Response) => {
    const key = req.header('Idempotency-Key')?.trim();
    if (!key) {
      throw new ValidationError('O header Idempotency-Key é obrigatório.', {
        hint: 'Gere um UUID por tentativa de compra e reutilize-o nos retries da mesma compra.',
      });
    }
    // Limite defensivo: a chave é guardada no store de idempotência (sem TTL
    // neste mini-projeto) — sem limite, chaves arbitrariamente longas viram
    // vetor de consumo de memória. Um UUID tem 36 caracteres.
    if (key.length > 200) {
      throw new ValidationError('Idempotency-Key inválida: máximo de 200 caracteres.', {
        hint: 'Use um UUID (36 caracteres) por tentativa de compra.',
      });
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Payload inválido.', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    const { order, replayed } = checkout.createOrder(key, parsed.data);

    // 202: o pedido foi ACEITO; a confirmação no ERP é assíncrona.
    // O cliente acompanha em GET /api/orders/:id.
    res.status(202).json({ order: toPublicOrder(order), replayed });
  });

  // ── Status do pedido (bônus) ───────────────────────────────────────────
  app.get('/api/orders/:id', (req: Request, res: Response) => {
    const order = store.orders.get(req.params.id);
    if (!order) throw new OrderNotFoundError(req.params.id);
    res.json({ order: toPublicOrder(order) });
  });

  app.use((_req: Request, _res: Response) => {
    throw new AppError(404, 'NOT_FOUND', 'Rota não encontrada.');
  });

  app.use(errorHandler);

  return { app, container: { store, inventory, processor, checkout } };
}
