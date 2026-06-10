import { createApp } from './app';
import { log } from './lib/logger';

const { app, container } = createApp();

const port = Number(process.env.PORT ?? 3001);

// Sweeper: libera reservas HELD expiradas (worker que morreu, etc.).
const sweeper = setInterval(() => {
  const released = container.inventory.sweepExpired();
  if (released > 0) log.info('reservation_sweep', { released });
}, 10_000);
sweeper.unref();

app.listen(port, () => {
  log.info('server_started', {
    port,
    erp: {
      minLatencyMs: process.env.ERP_MIN_LATENCY_MS ?? '400 (padrão)',
      maxLatencyMs: process.env.ERP_MAX_LATENCY_MS ?? '2500 (padrão)',
      failureRate: process.env.ERP_FAILURE_RATE ?? '0.35 (padrão)',
    },
  });
});
