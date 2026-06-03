const express = require('express');
const router  = express.Router();
const prisma  = require('../db');

// GET /api/versions — list all prompt versions
router.get('/', async (req, res) => {
  try {
    const versions = await prisma.promptVersion.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { runs: true } }
      }
    });
    res.json(versions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/versions — save a new version
router.post('/', async (req, res) => {
  const { versionId, slug, promptText, model, author, tag } = req.body;
  try {
    const version = await prisma.promptVersion.create({
      data: { versionId, slug, promptText, model, author, tag }
    });
    res.json({ success: true, version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/versions/:id — delete a version
router.delete('/:id', async (req, res) => {
  try {
    await prisma.promptVersion.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
