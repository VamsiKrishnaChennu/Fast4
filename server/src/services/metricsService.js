import { monitorEventLoopDelay } from 'node:perf_hooks';

/**
 * Numbers for the admin metrics endpoint and the once-a-minute log line.
 * @param {{ roomCount: () => number, socketCount: () => number }} sources
 */
export function createMetricsService({ roomCount, socketCount }) {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const counters = { gamesStarted: 0, gamesFinished: 0, gamesAbandoned: 0 };
  return {
    count(name) {
      if (name in counters) counters[name] += 1;
    },
    /** @returns {object} */
    snapshot() {
      const mem = process.memoryUsage();
      const out = {
        uptimeSeconds: Math.round(process.uptime()),
        rooms: roomCount(),
        sockets: socketCount(),
        eventLoopLagMs: { mean: round(loop.mean / 1e6), p99: round(loop.percentile(99) / 1e6) },
        memoryMb: { rss: mb(mem.rss), heapUsed: mb(mem.heapUsed) },
        games: { ...counters },
      };
      loop.reset();
      return out;
    },
    stop() {
      loop.disable();
    },
  };
}

const round = (n) => Math.round(n * 10) / 10;
const mb = (bytes) => Math.round(bytes / 1048576);
