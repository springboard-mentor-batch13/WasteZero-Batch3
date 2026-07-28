// Backend/sockets/index.js
//
// Socket.IO server bootstrap. Exported as initSocket()/getIO() so
// server.js can create it once at startup, and any service (like
// notification.service.js) can reach the same instance later without a
// circular top-level require.

const { Server } = require('socket.io');
const socketAuthMiddleware = require('./socket.middleware');
const registerMessageEvents = require('./events/message.events');
const registerNotificationEvents = require('./events/notification.events');
const { getUserRoom } = require('./rooms');
const resolveCorsOrigin = require('../config/corsOrigin');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: resolveCorsOrigin(),
      credentials: true,
    },
  });

  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    socket.join(getUserRoom(socket.user.id));

    registerMessageEvents(io, socket);
    registerNotificationEvents(io, socket);
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocket(httpServer) first.');
  }
  return io;
};

module.exports = { initSocket, getIO };