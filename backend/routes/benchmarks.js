const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { sendError, analysisLabel } = require('../lib/errors');

router.get('/', async (req, res) => {
  try {
    const analyses = await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        _count:  { select: { runs: true } },
        version: { select: { versionId: true } }
      }
    });

    const formatted = analyses.map(a => ({
      id:         '#' + String(a.id).padStart(3, '0'),
      analysisId: a.id,
      name:       a.incidentFlag ? 'Safety Regression Suite' : 'Full Behavioral Suite',
      model:      a.model,
      ver:        analysisLabel(a),
      status:     a.driftScore > 0.6 ? 'fail' : a.driftScore > 0.3 ? 'warn' : 'pass',
      score:      parseFloat((100 - a.driftScore * 100).toFixed(1)),
      time:       timeAgo(a.createdAt),
      questions:  a._count.runs
    }));

    res.json(formatted);
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid run id' });

  try {
    const analysis = await prisma.driftAnalysis.findUnique({
      where:   { id },
      include: {
        runs: {
          orderBy: { id: 'asc' },
          // everything except the embedding vectors
          select: {
            id: true, question: true, responseA: true, responseB: true,
            similarity: true, refusalA: true, refusalB: true,
            tokensA: true, tokensB: true, sentiment: true
          }
        }
      }
    });
    if (!analysis) return res.status(404).json({ error: 'Not found' });
    res.json(analysis);
  } catch (err) {
    sendError(res, err);
  }
});

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const min  = Math.max(0, Math.floor(diff / 60000));
  if (min < 1)   return 'just now';
  if (min < 60)  return min + ' min ago';
  const hr = Math.floor(min / 60);
  if (hr  < 24)  return hr  + 'h ago';
  return Math.floor(hr / 24) + 'd ago';
}

module.exports = router;
