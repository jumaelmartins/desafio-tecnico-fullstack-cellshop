import { Order } from '../domain/types';
import { sleep } from '../lib/util';

/**
 * Porta de integração com o ERP. A loja só conhece esta interface —
 * trocar o simulador por um client HTTP real é uma mudança local.
 */
export interface ErpGateway {
  submitOrder(order: Order): Promise<{ erpOrderId: string }>;
}

/** Falha que VALE retry (timeout, indisponibilidade, deadlock...). */
export class ErpTransientError extends Error {
  constructor(message = 'Falha temporária na comunicação com o ERP') {
    super(message);
    this.name = 'ErpTransientError';
  }
}

const TRANSIENT_REASONS = [
  'timeout ao gravar faturamento (simulado)',
  'ERP indisponível — HTTP 503 (simulado)',
  'deadlock na tabela de estoque do ERP (simulado)',
];

export interface SimulatedErpOptions {
  minLatencyMs?: number;
  maxLatencyMs?: number;
  /** 0..1 — probabilidade de cada chamada falhar com erro transitório. */
  failureRate?: number;
}

/**
 * Simula o comportamento descrito no case: o ERP demora para processar o
 * pedido e às vezes falha. Latência e taxa de falha são configuráveis por
 * env (ver erpFromEnv), o que permite forçar cenários na demo:
 *
 *   ERP_FAILURE_RATE=0  → todo pedido confirma (após a latência)
 *   ERP_FAILURE_RATE=1  → todo pedido falha e o estoque é devolvido
 */
export class SimulatedErp implements ErpGateway {
  constructor(private readonly options: SimulatedErpOptions = {}) {}

  async submitOrder(_order: Order): Promise<{ erpOrderId: string }> {
    const min = this.options.minLatencyMs ?? 400;
    const max = this.options.maxLatencyMs ?? 2500;
    const failureRate = this.options.failureRate ?? 0.35;

    await sleep(min + Math.random() * Math.max(0, max - min));

    if (Math.random() < failureRate) {
      const reason = TRANSIENT_REASONS[Math.floor(Math.random() * TRANSIENT_REASONS.length)];
      throw new ErpTransientError(reason);
    }

    return { erpOrderId: `ERP-${Date.now()}-${Math.floor(Math.random() * 10_000)}` };
  }
}

export function erpFromEnv(): SimulatedErp {
  const num = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return new SimulatedErp({
    minLatencyMs: num(process.env.ERP_MIN_LATENCY_MS, 400),
    maxLatencyMs: num(process.env.ERP_MAX_LATENCY_MS, 2500),
    failureRate: num(process.env.ERP_FAILURE_RATE, 0.35),
  });
}
