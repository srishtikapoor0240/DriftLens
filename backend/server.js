const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
// Middleware — these lines run on EVERY request
app.use(cors()); // allow frontend to talk to us
app.use(express.json()); // understand JSON data sent from frontend
// Import all feature routes
app.use('/api/analyze', require('./routes/analyze'));
app.use('/api/versions', require('./routes/versions'));
app.use('/api/benchmarks', require('./routes/benchmarks'));
app.use('/api/clusters', require('./routes/clusters'));
app.use('/api/safety', require('./routes/safety'));
app.use('/api/overview', require('./routes/overview'));
// Health check — open http://localhost:5000 to confirm it runs
app.get('/', (req, res) => res.json({ status: 'DriftLens backend running' }));
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});