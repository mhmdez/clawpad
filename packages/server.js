/* eslint-disable @typescript-eslint/no-require-imports */
// ClawPad Cloud Relay Server (Prototype)
// Acts as a WebSocket tunnel between Cloud UI and Local Agent.

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('ClawPad Relay Active');
});

const wss = new WebSocket.Server({ server });

// Store active tunnels: Map<token, { agentSocket, clientSocket }>
const tunnels = new Map();

// Mock Validation (Replace with real DB check later)
const isValidToken = (token) => {
  return token && token.startsWith('relay_');
};

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type'); // 'agent' or 'client'
  const token = url.searchParams.get('token');

  if (!token || !isValidToken(token)) {
    ws.close(1008, 'Invalid Token');
    return;
  }

  console.log(`Connection: ${type} for token ${token}`);

  if (type === 'agent') {
    // Register agent
    const tunnel = tunnels.get(token) || {};
    if (tunnel.agentSocket) {
      console.log(`Agent reconnected: ${token}. Closing old socket.`);
      tunnel.agentSocket.terminate();
    }
    tunnel.agentSocket = ws;
    tunnels.set(token, tunnel);

    ws.on('message', (msg) => {
      // Forward agent response to client
      if (tunnel.clientSocket && tunnel.clientSocket.readyState === WebSocket.OPEN) {
        tunnel.clientSocket.send(msg);
      }
    });

    ws.on('close', () => {
      console.log(`Agent disconnected: ${token}`);
      if (tunnel.clientSocket) {
        // Notify client agent is gone?
        // For now, keep client open in case agent reconnects quickly
      }
      // Don't delete tunnel immediately to allow reconnect
    });

  } else if (type === 'client') {
    // Register client (Cloud UI)
    const tunnel = tunnels.get(token);
    
    // Client can connect even if agent isn't there yet (waiting for agent)
    const newTunnel = tunnel || {};
    newTunnel.clientSocket = ws;
    tunnels.set(token, newTunnel);

    ws.on('message', (msg) => {
      // Forward client request to agent
      if (newTunnel.agentSocket && newTunnel.agentSocket.readyState === WebSocket.OPEN) {
        newTunnel.agentSocket.send(msg);
      } else {
        ws.send(JSON.stringify({ type: 'error', error: 'Agent Offline' }));
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${token}`);
      newTunnel.clientSocket = null;
    });
  } else {
    ws.close(1008, 'Invalid type');
  }
});

server.listen(PORT, () => {
  console.log(`Relay listening on port ${PORT}`);
});
