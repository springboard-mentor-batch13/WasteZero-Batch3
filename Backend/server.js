const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/users.routes");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

/* ===========================
   Environment Debug
=========================== */

console.log("================================");
console.log("CLIENT_URL:", process.env.CLIENT_URL);
console.log("EMAIL:", process.env.EMAIL);
console.log(
  "EMAIL_PASS:",
  process.env.EMAIL_PASS ? "Loaded ✅" : "Missing ❌"
);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("================================");

/* ===========================
   Security
=========================== */

app.use(helmet());

/* ===========================
   CORS
=========================== */

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

/* ===========================
   Middleware
=========================== */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ===========================
   Database
=========================== */

connectDB();

/* ===========================
   Routes
=========================== */

app.get("/", (req, res) => {
  res.send("WasteZero Backend API Engine is Running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

/* ===========================
   Error Handler
=========================== */

app.use(errorHandler);

/* ===========================
   Server
=========================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server securely operating on port ${PORT}`);
});