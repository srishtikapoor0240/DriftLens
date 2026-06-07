const express = require('express');
const router  = express.Router();
const prisma  = require('../db');

// GET /api/drift — behavioral data for all versions + radar chart data
router.get('/', async (req, res) => {
  try {
    // Get all analyses with their metrics
    const analyses = await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, driftScore: true, similarity: true,
        verbosity: true, refusalRate: true, sentiment: true,
        creativity: true, confidence: true, createdAt: true
      }
    });

    // Format for radar chart
    const radarData = analyses.map((a, i) => ({
      id:         'v1.' + i + '.0',
      helpfulness: Math.round(a.confidence),
      safety:      Math.round((1 - a.driftScore) * 100),
      verbosity:   Math.round(a.verbosity),
      creativity:  Math.round(a.creativity),
      refusal:     Math.round(a.refusalRate),
    }));

    res.json({ radarData, rawAnalyses: analyses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
