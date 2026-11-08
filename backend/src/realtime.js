// Socket.IO (WebSocket) layer: pushes live traffic, alerts and signal changes to dashboards.
const { Server } = require('socket.io');

let io = null;

function init(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[ws] client connected ${socket.id} (${io.engine.clientsCount} online)`);
    socket.emit('hello', { serverTime: new Date().toISOString() });

    // dashboards can focus on one intersection (room) or listen to all
    socket.on('subscribe', (intersectionId) => {
      if (typeof intersectionId === 'string') socket.join(`int:${intersectionId}`);
    });
    socket.on('unsubscribe', (intersectionId) => socket.leave(`int:${intersectionId}`));

    socket.on('disconnect', () => console.log(`[ws] client disconnected ${socket.id}`));
  });
  return io;
}

function emit(event, data) {
  if (!io) return;
  io.emit(event, data);
  if (data && data.intersectionId) io.to(`int:${data.intersectionId}`).emit(`${event}:focused`, data);
}

function clients() {
  return io ? io.engine.clientsCount : 0;
}

module.exports = { init, emit, clients };
