const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/analyze',    require('./routes/analyze'));
app.use('/api/versions',   require('./routes/versions'));
app.use('/api/benchmarks', require('./routes/benchmarks'));
app.use('/api/clusters',   require('./routes/clusters'));
app.use('/api/safety',     require('./routes/safety'));
app.use('/api/overview',   require('./routes/overview'));
app.use('/api/drift',      require('./routes/drift'));
app.use('/api/compare', require('./routes/compare'));

app.get('/', (req, res) => res.json({ status: 'DriftLens backend running' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

