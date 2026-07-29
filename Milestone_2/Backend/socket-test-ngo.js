const { io } = require("socket.io-client");

// NGO (Nanu) ka JWT
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhNjI4NWQxNWE0MDJmNjM5ZTk4MTAxNSIsInJvbGUiOiJuZ28iLCJpYXQiOjE3ODUxNTIxODMsImV4cCI6MTc4NTc1Njk4M30.viK4KQ9Zk_wLDRGeiOLFTJ10_tW-mW6DjxnkdwZgUbc";

const socket = io("http://localhost:5001", {
  auth: {
    token: TOKEN,
  },
});

socket.on("connect", () => {
  console.log("✅ NGO Connected");
  console.log(socket.id);
});

socket.on("message:new", (message) => {
  console.log("📩 NEW MESSAGE");
  console.log(message);
});

socket.on("notification:new", (notification) => {
  console.log("🔔 NEW NOTIFICATION");
  console.log(notification);
});

socket.on("connect_error", (err) => {
  console.log(err.message);
});