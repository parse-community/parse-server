/**
 * Simple TCP proxy to add artificial latency to MongoDB connections
 * This helps make benchmark measurements more stable by simulating network conditions
 */

const net = require('net');

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '27018', 10);
const TARGET_HOST = process.env.TARGET_HOST || 'localhost';
const TARGET_PORT = parseInt(process.env.TARGET_PORT || '27017', 10);
const LATENCY_MS = parseInt(process.env.LATENCY_MS || '10', 10);

const server = net.createServer((clientSocket) => {
  const serverSocket = net.createConnection({
    host: TARGET_HOST,
    port: TARGET_PORT,
  });

  // Add latency to data flowing from client to MongoDB
  clientSocket.on('data', (data) => {
    setTimeout(() => {
      if (!serverSocket.destroyed) {
        serverSocket.write(data);
      }
    }, LATENCY_MS);
  });

  // Add latency to data flowing from MongoDB to client
  serverSocket.on('data', (data) => {
    setTimeout(() => {
      if (!clientSocket.destroyed) {
        clientSocket.write(data);
      }
    }, LATENCY_MS);
  });

  clientSocket.on('error', () => {
    serverSocket.destroy();
  });

  serverSocket.on('error', () => {
    clientSocket.destroy();
  });

  clientSocket.on('close', () => {
    serverSocket.destroy();
  });

  serverSocket.on('close', () => {
    clientSocket.destroy();
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`MongoDB proxy listening on port ${PROXY_PORT}`);
  console.log(`Forwarding to ${TARGET_HOST}:${TARGET_PORT} with ${LATENCY_MS}ms latency`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});
