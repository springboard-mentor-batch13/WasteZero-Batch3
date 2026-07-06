const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); 
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes'); 
const userRoutes = require('./routes/users.routes');
const errorHandler = require('./middlewares/error.middleware');

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json()); 

// Connect Database
connectDB();

// API Endpoints Mount
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);


//For system errors
app.use(errorHandler);
app.get('/', (req, res) => {
    res.send('WasteZero Backend API Engine is Running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server securely operating on port ${PORT}`);
});