require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });
const prisma = require('./db');

async function seed() {
  await prisma.promptVersion.createMany({
    data: [
      { versionId: 'v1.0.0', slug: 'genesis', promptText: 'You are a helpful assistant.', model: 'gpt-4o-mini', author: 'alex.kim', tag: 'baseline' },
      { versionId: 'v1.2.0', slug: 'concise-v2', promptText: 'You are a helpful assistant. Answer concisely.', model: 'gpt-4o-mini', author: 'dan.wu', tag: 'warning' },
      { versionId: 'v1.4.2', slug: 'verbose-prod', promptText: 'You are an expert AI assistant. Provide comprehensive responses.', model: 'gpt-4o', author: 'sara.jones', tag: 'alert' },
    ],
    skipDuplicates: true
  });
  console.log('Seeded!');
  await prisma.$disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
