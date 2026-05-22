const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const http = require('http');
require('dotenv').config();

const { initializeDatabase } = require('./src/config/config');
const apiRoutes = require('./src/routes');

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/', express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'ai-chat',
    time: new Date().toISOString()
  });
});

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

const PORT = Number(process.env.PORT || 2053);

async function startServer() {
  await initializeDatabase();
  server.listen(PORT, () => {
    console.log(`AI Chat API listening on port ${PORT}`);
  });
}

startServer();

module.exports = { app, server };
