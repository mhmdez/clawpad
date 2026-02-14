const WebSocket = require('ws');
const http = require('http');
const assert = require('assert');

// Mock Relay Server logic for testing (copy-paste of logic or import if refactored)
// For this test, we assume the server is running on localhost:8080 or we spawn it.

const PORT = 8081;
let server;
let wss;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer();
    wss = new WebSocket.Server({ server });
    
    const tunnels = new Map();

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const type = url.searchParams.get('type');
      const token = url.searchParams.get('token');

      if (type === 'agent') {
        const tunnel = tunnels.get(token) || {};
        tunnel.agentSocket = ws;
        tunnels.set(token, tunnel);
        ws.on('message', (msg) => {
          if (tunnel.clientSocket) tunnel.clientSocket.send(msg);
        });
      } else if (type === 'client') {
        const tunnel = tunnels.get(token) || {};
        tunnel.clientSocket = ws;
        tunnels.set(token, tunnel);
        ws.on('message', (msg) => {
          if (tunnel.agentSocket) tunnel.agentSocket.send(msg);
        });
      }
    });

    server.listen(PORT, resolve);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    wss.close(() => server.close(resolve));
  });
}

async function runTest() {
  await startServer();
  console.log('Test Server Started');

  const token = "test_token_123";
  
  // 1. Connect Agent
  const agentWs = new WebSocket(`ws://localhost:${PORT}?type=agent&token=${token}`);
  await new Promise(r => agentWs.on('open', r));
  console.log('Agent Connected');

  // 2. Connect Client
  const clientWs = new WebSocket(`ws://localhost:${PORT}?type=client&token=${token}`);
  await new Promise(r => clientWs.on('open', r));
  console.log('Client Connected');

  // 3. Test Client -> Agent
  const clientMsg = "Hello Agent";
  clientWs.send(clientMsg);
  
  const receivedByAgent = await new Promise(r => agentWs.once('message', d => r(d.toString())));
  assert.strictEqual(receivedByAgent, clientMsg);
  console.log('PASS: Client -> Agent');

  // 4. Test Agent -> Client
  const agentMsg = "Hello Client";
  agentWs.send(agentMsg);

  const receivedByClient = await new Promise(r => clientWs.once('message', d => r(d.toString())));
  assert.strictEqual(receivedByClient, agentMsg);
  console.log('PASS: Agent -> Client');

  agentWs.close();
  clientWs.close();
  await stopServer();
  console.log('ALL TESTS PASSED');
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
