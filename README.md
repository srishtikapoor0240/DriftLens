# DriftLens

DriftLens is an AI observability and behavioral drift analysis platform designed for Large Language Models (LLMs).

The project focuses on tracking, analyzing, and visualizing how AI model behavior changes over time across prompts, responses, context, and system conditions. DriftLens aims to help developers and researchers better understand model consistency, response reliability, hallucination patterns, and behavioral drift in modern AI systems.

---

## Features (Planned)

- Behavioral drift detection for LLM responses
- Prompt-response comparison engine
- Response consistency analysis
- Hallucination and anomaly tracking
- Interactive analytics dashboard
- AI observability metrics and visualizations
- Multi-model comparison support
- Experiment logging and monitoring

---

## Tech Stack

### Frontend
- React.js
- Tailwind CSS

### Backend
- Python
- FastAPI / Flask

### AI & Data
- Transformers
- NLP pipelines
- Vector embeddings
- Data visualization tools

---

## Running Locally

The current implementation is a single-page dashboard (`frontend.html`) served by a Node.js + Express backend (`backend/`) that stores results in PostgreSQL through Prisma. You need Node.js 18 or newer.

```bash
cd backend
npm install
cp .env.example .env        # then put your OpenAI key in .env
npm run db:dev              # local PostgreSQL, leave it running (skip if you have your own)
npm run db:push             # in a second terminal: create the tables
npm run seed                # optional: three sample prompt versions
npm run dev                 # start the server
```

Then open http://localhost:5000. The backend serves the dashboard and the API from the same address, so there is nothing else to start.

- **Own PostgreSQL:** skip `npm run db:dev` and point `DATABASE_URL` in `.env` at your database.
- **No OpenAI key:** any OpenAI-compatible server works. For a local [Ollama](https://ollama.com), set `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_API_KEY=ollama`, and put the models you have pulled in `CHAT_MODELS` and `EMBEDDING_MODEL`. Keep the same `EMBEDDING_MODEL` once you have stored analyses.
- **Port 5000 taken** (macOS uses it for AirPlay Receiver): set `PORT=5001` in `.env` and open http://localhost:5001 instead.

Pages show a `DEMO DATA` tag whenever they are displaying built-in sample data instead of data from your database.

---

## Project Status

DriftLens is currently under active development.

The project is in its early foundational stage, and features, architecture, and workflows are continuously evolving. Upcoming updates will include the core drift analysis engine, dashboard UI, and model evaluation pipelines.

---

## Vision

Modern AI systems are powerful, but understanding *how* and *why* model behavior changes remains difficult.

DriftLens aims to bridge that gap by providing:
- transparency into LLM behavior
- observability tooling for AI systems
- meaningful behavioral analytics
- insights into model reliability and drift patterns

---

## Contributing

Contributions, ideas, and discussions are welcome as the project evolves.

---

## License

This project is licensed under the MIT License.
