import http from 'node:http';

const port = Number(process.env.PORT) || 4000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }));
});

server.listen(port, () => {
  process.stdout.write(`Fast Four server listening on port ${port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
