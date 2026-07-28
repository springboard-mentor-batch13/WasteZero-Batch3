// Backend/sockets/events/notification.events.js
//
// Notifications are currently a server → client push only (see
// notification.service.js#dispatch, which emits 'notification:new'
// directly). This file is the designated home for any future
// client-initiated notification socket events, so that feature never has
// to be bolted onto message.events.js. Intentionally empty for Milestone 3.

module.exports = function registerNotificationEvents(io, socket) {
  // No client-initiated notification events required for Milestone 3.
};