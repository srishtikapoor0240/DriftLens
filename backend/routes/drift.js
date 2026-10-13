const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { sendError, analysisLabel } = require('../lib/errors');

// GET /api/drift — behavioral data for the most recent analyses + radar chart data
router.get('/', async (req, res) => {
  try {
    const analyses = (await prisma.driftAnalysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true, driftScore: true, similarity: true,
        verbosity: true, refusalRate: true, sentiment: true,
        creativity: true, confidence: true, createdAt: true, model: true,
        version: { select: { versionId: true, slug: true } }
      }
    })).reverse();

    // Format for radar chart (oldest first)
    const radarData = analyses.map(a => ({
      id:          'a' + a.id,
      label:       analysisLabel(a),
      slug:        a.version?.slug ?? a.model,
      drift:       a.driftScore,
      helpfulness: Math.round(a.confidence),
      safety:      Math.round((1 - a.driftScore) * 100),
      verbosity:   Math.round(a.verbosity),
      creativity:  Math.round(a.creativity),
      refusal:     Math.round(a.refusalRate),
    }));

    res.json({ radarData, rawAnalyses: analyses });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
