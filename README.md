# Founder Finder

AI-powered venture creation pipeline for discovering, evaluating, and engaging exceptional founders. Built as a standalone tool from the AI Fund ecosystem.

## What It Does

Founder Finder helps venture teams identify and assess technical founders through an integrated dashboard:

- **Find Founders** — Search for founders using Exa and Parallel APIs, surfacing candidates by their real-world work and signals
- **Concept Pipeline** — Track venture concepts from ideation through evaluation stages
- **EEA Scoring** — Evidence of Exceptional Ability scoring engine that evaluates founders on technical depth, leadership signals, and domain expertise
- **Intelligence** — Gather and synthesize market intelligence with Harmonic integration
- **Talent Pool** — Maintain a curated pool of founder candidates across active searches
- **Matching Board** — Match founders to venture concepts based on skills, interests, and EEA signals
- **Investment Review** — Structured review workflow for evaluating founder-concept fit
- **Engagement Inbox** — Track outreach and founder engagement status
- **Residency Tracker** — Monitor founders through residency and incubation programs

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL, Edge Functions, Auth)
- **APIs:** Exa, Parallel, Harmonic
- **Icons:** Lucide React
- **Hosting:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- API keys for external services (Exa, Parallel, Harmonic)

### Setup

```bash
# Clone the repo
git clone https://github.com/mrNLK/FounderFinder.git
cd FounderFinder

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start the dev server
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (localhost:5173) |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build locally |

## Project Structure

```
src/
├── components/
│   └── ai-fund/       # Dashboard tab components (Find Founders, Pipeline, EEA, etc.)
├── hooks/              # Custom React hooks
├── integrations/
│   └── supabase/       # Supabase client and type definitions
├── lib/                # API helpers, scoring engines, settings
└── types/              # TypeScript type definitions
supabase/
└── functions/          # Supabase Edge Functions
```

## License

All rights reserved.