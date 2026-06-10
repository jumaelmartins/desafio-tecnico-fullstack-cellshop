/**
 * Logger estruturado mínimo: uma linha JSON por evento.
 *
 * Em produção trocaria por pino/winston + agregador (Loki, CloudWatch...),
 * mas o formato já permite rastrear por traceId e orderId — exatamente a
 * rastreabilidade "por pedido / por requisição" que falta no cenário do case.
 */

type Ctx = Record<string, unknown>;

function emit(level: 'info' | 'warn' | 'error', msg: string, ctx: Ctx = {}): void {
  // Silencia logs durante os testes para manter a saída do vitest limpa.
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...ctx });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, ctx?: Ctx) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit('error', msg, ctx),
};
