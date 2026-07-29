// Backend/server.js

const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');

const connectDB = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const opportunityRouter = require('./routes/opportunity.routes');
const applicationRoutes = require('./routes/application.routes');

// ===== Milestone 3 Routes =====
// const messageRoutes = require('./routes/message.routes');
// const notificationRoutes = require('./routes/notification.routes');
// const matchingRoutes = require('./routes/matching.routes');

// ===== Socket =====
const { initSocket } = require('./sockets');

const errorHandler = require('./middlewares/error.middleware');
const { verifySmtpConnection } = require('./utils/sendEmail');

const app = express();

// ======================================================
// Security Headers
// ======================================================
app.use(helmet());

// ======================================================
// CORS
// ======================================================
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

// ======================================================
// Body Parsers
// ======================================================
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ======================================================
// Database
// ======================================================
connectDB();

// ======================================================
// SMTP Verification
// ======================================================
verifySmtpConnection();

// ======================================================
// API Routes
// ======================================================

app.use('/api/auth', authRoutes);

app.use('/api/users', userRoutes);

app.use('/api/opportunities', opportunityRouter);

app.use('/api/applications', applicationRoutes);

// ================= Milestone 3 =================

// app.use('/api/messages', messageRoutes);

// app.use('/api/notifications', notificationRoutes);

// app.use('/api/matching', matchingRoutes);

// ======================================================
// Health Check
// ======================================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WasteZero API is running.',
  });
});

// ======================================================
// 404 Handler
// ======================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
});

// ======================================================
// Global Error Handler
// ======================================================
app.use(errorHandler);

// ======================================================
// HTTP Server + Socket.IO
// ======================================================

const httpServer = http.createServer(app);

initSocket(httpServer);

// ======================================================
// Start Server
// ======================================================

const PORT = process.env.PORT || 5001;

httpServer.listen(PORT, () => {
  console.log(
    `WasteZero API running on port ${PORT} [${
      process.env.NODE_ENV || 'development'
    }]`
  );
});