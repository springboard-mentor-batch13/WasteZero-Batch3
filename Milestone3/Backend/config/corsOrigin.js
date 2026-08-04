// Backend/config/corsOrigin.js

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
