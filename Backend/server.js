const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors'); 
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes'); 
const userRoutes = require('./routes/users.routes');
const errorHandler = require('./middlewares/error.middleware');
const helmet = require("helmet");

const app = express();

// Security Middlewares
app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());
 

// Connect Database
connectDB();

dotenv.config();
console.log("ENV CHECK:", process.env.EMAIL, process.env.EMAIL_PASS ? "PASS SET" : "PASS MISSING");

// API Endpoints Mount
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

console.log("EMAIL:", process.env.EMAIL);
console.log("EMAIL_PASS loaded:", !!process.env.EMAIL_PASS);

//For system errors
app.use(errorHandler);
app.get('/', (req, res) => {
    res.send('WasteZero Backend API Engine is Running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server securely operating on port ${PORT}`);
});

