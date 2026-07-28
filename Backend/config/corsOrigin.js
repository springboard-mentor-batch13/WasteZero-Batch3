// Backend/config/corsOrigin.js
//
// Resolves the CORS origin used by both the Express app (server.js) and
// the Socket.IO server (sockets/index.js), so the two can never drift out
// of sync.
//
// Fail-closed by design: passing `origin: undefined` to the `cors`
// package (which is what `process.env.CLIENT_URL` becomes if the env var
// is unset) does NOT mean "no CORS" — the package treats a missing/falsy
// origin option as "reflect the request's Origin header", which allows
// requests from ANY origin. That's the opposite of what an unset
// CLIENT_URL should mean in a credentialed API (credentials: true).
// Here, a missing CLIENT_URL resolves to `false` (block all cross-origin
// requests) instead, with a loud startup warning so misconfiguration is
// obvious rather than silently permissive.

const resolveCorsOrigin = () => {
  const clientUrl = process.env.CLIENT_URL;

  if (!clientUrl) {
    console.warn(
      '[CORS] CLIENT_URL is not set — failing closed and blocking all cross-origin requests. ' +
        'Set CLIENT_URL in your environment to allow your frontend to connect.'
    );
    return false;
  }

  return clientUrl;
};

module.exports = resolveCorsOrigin;
