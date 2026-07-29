// Backend/sockets/rooms.js
//
// Every connected user joins exactly one room, regardless of how many
// tabs/devices they have open (a user with 3 open tabs has 3 sockets, all
// in the same room). This lets message/notification pushes be a single
// `io.to(getUserRoom(id)).emit(...)` call that works identically whether
// the user has 0, 1, or several active connections — no manual
// socket-id-to-user-id bookkeeping needed anywhere in the codebase.

const getUserRoom = (userId) => `user:${userId}`;

module.exports = { getUserRoom };