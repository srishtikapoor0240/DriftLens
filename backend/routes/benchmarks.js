const express = require('express');
const router  = express.Router();
const prisma  = require('../db');

router.get('/', async (req, res) => {
  try {
    const analyses = await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { _count: { select: { runs: true } } }
    });

    const formatted = analyses.map((a, i) => ({
      id:        '#0' + String(42 - i).padStart(2, '0'),
      name:      a.incidentFlag ? 'Safety Regression Suite' : 'Full Behavioral Suite',
      model:     a.model,
      ver:       `v1.${analyses.length - 1 - i}.0`,  // was missing entirely
      status:    a.driftScore > 0.6 ? 'fail' : a.driftScore > 0.3 ? 'warn' : 'pass',
      score:     parseFloat((100 - a.driftScore * 100).toFixed(1)),
      time:      timeAgo(a.createdAt),
      questions: a._count.runs
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const analysis = await prisma.driftAnalysis.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { runs: true }
    });
    if (!analysis) return res.status(404).json({ error: 'Not found' });
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 60)  return min + ' min ago';
  const hr = Math.floor(min / 60);
  if (hr  < 24)  return hr  + 'h ago';
  return Math.floor(hr / 24) + 'd ago';
}

module.exports = router;