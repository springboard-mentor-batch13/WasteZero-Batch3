const { io } = require("socket.io-client");

// 👇 Mohan ka JWT yahan paste karna
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhNjRmNzE4ZDk1NmRhNTY5YzlmYTg2YiIsInJvbGUiOiJ2b2x1bnRlZXIiLCJpYXQiOjE3ODUxNTE1NDAsImV4cCI6MTc4NTc1NjM0MH0.Ou3Xq0OIiu4FHOlGAXyOn8Ic3fQok9qlkDoI_qGoeqk";

const socket = io("http://localhost:5001", {
  auth: {
    token: TOKEN,
  },
});

socket.on("connect", () => {
  console.log("✅ Connected!");
  console.log("Socket ID:", socket.id);

  socket.emit(
    "message:send",
    {
      receiverId: "6a6285d15a402f639e981015", // Nanu (NGO)
      content: "Hello from socket.io-client 🚀",
    },
    (ack) => {
      console.log("ACK:");
      console.log(JSON.stringify(ack, null, 2));
    }
  );
});