/**
 * 管理端 WebSocket 实时推送
 */
const WebSocket = require('ws');

let wss = null;
let getPayload = null;

function attach(server, payloadFn) {
  getPayload = payloadFn;
  wss = new WebSocket.Server({ server: server, path: '/api/admin/ws' });
  wss.on('connection', function (socket) {
    socket.isAlive = true;
    socket.on('pong', function () { socket.isAlive = true; });
    try {
      if (getPayload) {
        socket.send(JSON.stringify({
          code: 0,
          message: 'ok',
          data: getPayload()
        }));
      }
    } catch (e) { /* ignore */ }
  });
  const interval = setInterval(function () {
    if (!wss) return;
    wss.clients.forEach(function (socket) {
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);
  wss.on('close', function () { clearInterval(interval); });
  return wss;
}

function broadcast(payload) {
  if (!wss) return;
  const msg = JSON.stringify({
    code: 0,
    message: 'ok',
    data: payload || (getPayload ? getPayload() : null)
  });
  wss.clients.forEach(function (client) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) { /* ignore */ }
    }
  });
}

function connectionCount() {
  if (!wss) return 0;
  var n = 0;
  wss.clients.forEach(function () { n++; });
  return n;
}

module.exports = {
  attach: attach,
  broadcast: broadcast,
  connectionCount: connectionCount
};
