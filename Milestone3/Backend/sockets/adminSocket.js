// Backend/sockets/adminSocket.js
//
// Admin Socket Integration — M4 Developer A
//
// PURPOSE:
//   Provides a server-side function that forces all active socket connections
//   belonging to a specific user to disconnect immediately.
//   This is called by admin.service.js after a successful user suspension.
//
// DESIGN:
//   - Uses the existing getUserRoom() room naming convention from sockets/rooms.js.
//   - Uses getIO() from sockets/index.js — safe to call after initSocket().
//   - Emits 'account:suspended' event to the user's room BEFORE disconnecting,
//     so the client can display a meaningful message before the connection drops.
//   - Does NOT redesign the Socket.IO authentication system.
//   - Does NOT require Redis — in-memory Socket.IO server rooms are sufficient
//     for a single-process deployment (Redis is a P3 upgrade).
//
// SECURITY:
//   - This function is ONLY callable from server-side code (admin.service.js).
//   - The targetUserId comes from the database record, not from req.body.
//   - Suspension is enforced at the HTTP layer (protect middleware) independently —
//     socket disconnect is an additional real-time UX enhancement, not the sole
//     enforcement mechanism.
//
// GRACEFUL DEGRADATION:
//   - If Socket.IO is not initialized (e.g. during unit tests), the function
//     logs a warning and returns without throwing.
//   - If the user has no active connections, the room is empty and the operation
//     is a safe no-op.

const { getUserRoom } = require('./rooms');

/**
 * Force-disconnect all active socket sessions for a given user.
 * Emits 'account:suspended' with reason before disconnecting.
 *
 * @param {string} targetUserId - The ObjectId string of the suspended user.
 * @param {string} [reason]     - Suspension reason to send to the client.
 * @returns {void}
 */
const forceDisconnectUser = (targetUserId, reason) => {
  let io;
  try {
    // Lazy-import to avoid circular dependency during module load.
    // sockets/index.js exports getIO() which returns the initialized Server instance.
    const { getIO } = require('./index');
    io = getIO();
  } catch {
    // Socket.IO not initialized (e.g. unit test environment without httpServer).
    // Log a warning and return — suspension is still enforced at the HTTP layer.
    console.warn(
      '[AdminSocket] Socket.IO not initialized — cannot force-disconnect user:',
      targetUserId
    );
    return;
  }

  const room = getUserRoom(targetUserId);

  // Emit suspension event to all sockets in the user's room.
  // The Angular client should listen for this event and redirect to a
  // "suspended" error page before the connection drops.
  io.to(room).emit('account:suspended', {
    message: reason
      ? `Account suspended: ${reason}`
      : 'Account suspended. Please contact support.',
  });

  // Fetch all socket instances in the room and disconnect each one.
  // Using adapter.rooms (Socket.IO v4) — works with the in-memory adapter.
  const socketsInRoom = io.sockets.adapter.rooms.get(room);
  if (socketsInRoom) {
    for (const socketId of socketsInRoom) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true); // true = close underlying connection
      }
    }
  }
};

module.exports = { forceDisconnectUser };
