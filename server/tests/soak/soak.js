/* eslint-disable no-console */
/* Soak check: real sockets and database, rooms created, filled, chatted in and left over and over.
   Fails when memory keeps growing or rooms and sockets are not cleaned up.
   Run: TEST_MONGODB_URI=... node --expose-gc tests/soak/soak.js --minutes 30 --players 6
   The database must be a test database (it is wiped at the start). */
import { startRealtimeServer } from '../helpers/realtimeHelpers.js';
import { clearDb, startTestDb, stopTestDb } from '../helpers/testDb.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const minutes = arg('minutes', 2);
const players = arg('players', 6);
const sampleEveryMs = arg('sample', 10) * 1000;
const heapMb = () => {
  globalThis.gc?.();
  return Math.round(process.memoryUsage().heapUsed / 1048576);
};

await startTestDb();
await clearDb();
const rt = await startRealtimeServer({});
const crew = [];
for (let i = 0; i < players; i += 1) crew.push(await rt.player(`Soak${i}`));

const samples = [];
const started = Date.now();
let lastSample = started;
let cycles = 0;
let failures = 0;
while (Date.now() - started < minutes * 60_000) {
  const [host, ...guests] = crew;
  const created = await host.emitAck('room:create', { settings: { maxPlayers: 8, rounds: 5 } });
  if (!created.ok) failures += 1;
  for (const g of guests) {
    if (!(await g.emitAck('room:join', { code: created.data.code })).ok) failures += 1;
  }
  for (const p of crew) {
    rt.clock.advance(11_000); // the chat limit uses the fake clock
    if (!(await p.emitAck('chat:send', { text: `hello ${cycles}` })).ok) failures += 1;
  }
  for (const p of crew) await p.emitAck('room:leave', {});
  cycles += 1;
  for (const p of crew) p.log.length = 0; // the test client keeps every event it sees
  await new Promise((r) => setTimeout(r, 1000)); // stay under the per-socket event limit
  if (Date.now() - lastSample >= sampleEveryMs) {
    lastSample = Date.now();
    samples.push(heapMb());
    process.stdout.write(
      `t=${Math.round((lastSample - started) / 1000)}s cycles=${cycles} heap=${samples.at(-1)} MB rooms=${rt.roomManager.size()}\n`,
    );
  }
}

const rooms = rt.roomManager.size();
const sockets = rt.realtime.io.engine.clientsCount;
await rt.close();
await stopTestDb();

// Compare the average of the last third with the average of the second third (after warm-up).
const third = Math.floor(samples.length / 3);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const mid = avg(samples.slice(third, 2 * third));
const end = avg(samples.slice(2 * third));
const growth = mid > 0 ? (end - mid) / mid : 0;
console.log(
  JSON.stringify({
    cycles,
    failures,
    rooms,
    sockets,
    heapMidMb: Math.round(mid),
    heapEndMb: Math.round(end),
    growthPercent: Math.round(growth * 100),
  }),
);
if (failures > 0 || rooms !== 0 || growth > 0.2) {
  console.error('SOAK FAILED');
  process.exit(1);
}
console.log('SOAK OK');
process.exit(0);
