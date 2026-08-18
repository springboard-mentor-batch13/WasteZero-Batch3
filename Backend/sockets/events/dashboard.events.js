// Backend/sockets/events/dashboard.events.js
//
// Emits a 'dashboard:refresh' event to every connected admin socket.
//
// USAGE (from any service or controller):
//   const { emitDashboardUpdate } = require('../sockets/events/dashboard.events');
//   emitDashboardUpdate('pickup:completed');
//
// FRONTEND:
//   socket.on('dashboard:refresh', ({ reason, timestamp }) => {
//     // Re-fetch /api/v1/admin/dashboard/stats (or whichever cards changed)
//   });
//
// DESIGN:
//   - Fire-and-forget — never throws, never blocks the caller.
//   - Graceful degradation: if Socket.IO is not yet initialized (unit tests,
//     startup race) the call is a safe no-op; a warning is logged instead.
//   - Uses lazy require to avoid the circular-dependency issue that affects
//     any module imported at the top level before initSocket() has run.

/**
 * Push a dashboard refresh signal to all connected admin sockets.
 *
 * @param {string} reason  Short descriptor of what changed, e.g. 'pickup:completed'.
 *                         The frontend can use this to decide which cards to re-fetch.
 */
const emitDashboardUpdate = (reason) => {
  try {
    // Lazy-require to avoid circular dependency during module load.
    const { getIO }       = require('../index');
    const { getAdminRoom } = require('../rooms');

    getIO().to(getAdminRoom()).emit('dashboard:refresh', {
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Socket.IO not initialized yet — safe to ignore (e.g. during tests or
    // very early startup). The HTTP response is never blocked by this.
    console.warn(`[DashboardEvents] Could not emit dashboard:refresh (${reason}) — Socket.IO not ready.`);
  }
};

module.exports = { emitDashboardUpdate };
