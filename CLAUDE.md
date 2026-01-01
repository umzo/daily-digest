# CLAUDE.md - AI Assistant Guide for Daily Digest

This document provides essential context for AI assistants working on the daily-digest codebase.

## Project Overview

**Daily Digest** is a serverless system that automates the collection, summarization, and publishing of articles from multiple sources (X/Twitter and Feedly) to an Obsidian Vault via GitHub.

### Core Workflow
1. **Collect**: Fetch articles from X (Twitter) and Feedly daily at 6:00 AM JST
2. **Summarize**: Use Claude 3.5 Haiku API to extract key points (3-5 bullets per article)
3. **Publish**: Generate Markdown and commit to GitHub repository
4. **Sync**: User pulls updates locally into Obsidian for note-taking

### Key Constraints
- Personal use case (single user)
- Target monthly cost: ~$2.50 (500 JPY or less)
- Handles 10-100 articles per day
- Must complete within Lambda timeout limits

## Project Status

**Current Phase**: Design documentation complete, pre-implementation

See `docs/DESIGN.md` for the comprehensive system design document (in Japanese).

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Runtime | Node.js 20.x |
| Build | esbuild |
| IaC | Terraform |
| Compute | AWS Lambda |
| Scheduler | AWS EventBridge |
| Secrets | AWS Secrets Manager |
| LLM | Claude 3.5 Haiku (Anthropic API) |
| Storage | GitHub Repository |
| Local | Obsidian + Git |

## Directory Structure (Planned)

```
daily-digest/
├── terraform/                 # Infrastructure as Code
│   ├── main.tf               # Provider configuration
│   ├── variables.tf          # Variable definitions
│   ├── secrets.tf            # Secrets Manager resources
│   ├── lambda.tf             # Lambda configuration
│   ├── eventbridge.tf        # Scheduler rules
│   ├── iam.tf                # IAM roles & policies
│   └── outputs.tf            # Output values
├── src/                       # TypeScript source code
│   ├── index.ts              # Lambda handler entry point
│   ├── fetchers/
│   │   ├── types.ts          # Common type definitions
│   │   ├── x.ts              # X (Twitter) API client
│   │   └── feedly.ts         # Feedly API client
│   ├── summarizer.ts         # Claude API wrapper
│   ├── formatter.ts          # Markdown generation
│   └── publisher.ts          # GitHub API wrapper
├── docs/
│   └── DESIGN.md             # System design document (Japanese)
├── package.json
├── tsconfig.json
├── esbuild.config.js         # Lambda bundling config
├── CLAUDE.md                 # This file
└── README.md
```

## Common Commands

```bash
# Install dependencies
npm install

# Build for Lambda
npm run build

# Run locally (development)
npm run dev

# Deploy infrastructure
cd terraform && terraform apply

# Lint & format
npm run lint
npm run format

# Run tests
npm test
```

## Key Type Definitions

### Article (unified input format)
```typescript
interface Article {
  id: string;
  source: 'x' | 'feedly';
  title: string;
  content: string;
  url: string;
  author?: string;
  publishedAt: Date;
  tags?: string[];
}
```

### Summary (output from summarizer)
```typescript
interface Summary {
  article: Article;
  bullets: string[];      // 3-5 key points
  category?: string;      // Auto-classified category
}
```

## Architecture Patterns

1. **Modular Fetchers**: Separate classes per data source, all outputting `Article[]`
2. **Batch Processing**: 10 articles in parallel × 10 batches to handle ~100/day
3. **Error Resilience**: Individual article failures don't block the pipeline
4. **Separation of Concerns**: Fetchers → Summarizer → Formatter → Publisher

## Code Conventions

### Naming
- File names: `snake_case` or `kebab-case` (e.g., `types.ts`, `feedly.ts`)
- Functions/variables: `camelCase`
- Interfaces/types: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` for environment variables

### Error Handling
- Use exponential backoff for API rate limits (max 3 retries)
- Skip individual failing articles (log error, continue processing)
- Wrap LLM failures with fallback message
- Critical failures (GitHub commit) should trigger CloudWatch alarms

### Markdown Output Format
```markdown
---
date: 2025-01-01
sources:
  - x
  - feedly
article_count: 42
tags:
  - digest
  - daily
---

# Daily Digest - 2025-01-01

## Tech

### Article Title
- Key point 1
- Key point 2
- Key point 3

> [Source](URL) via X (@handle)
```

## External APIs

| API | Auth Method | Key Secret Name |
|-----|-------------|-----------------|
| Anthropic | API Key | `ANTHROPIC_API_KEY` |
| X (Twitter) | Bearer Token | `X_BEARER_TOKEN` |
| Feedly | OAuth Token | `FEEDLY_ACCESS_TOKEN` |
| GitHub | PAT (Fine-grained) | `GITHUB_TOKEN` |

Secrets are stored in AWS Secrets Manager under `daily-digest-secrets`.

## AWS Resources

| Resource | Name | Purpose |
|----------|------|---------|
| Lambda | `daily-digest` | Main processing function |
| EventBridge | `daily-digest-schedule` | Cron: `0 21 * * ? *` (6 AM JST) |
| CloudWatch Logs | `/aws/lambda/daily-digest` | Logging |
| Secrets Manager | `daily-digest-secrets` | API credentials |
| IAM Role | `daily-digest-lambda-role` | Lambda execution role |

## Development Guidelines

### For AI Assistants

1. **Language**: The design document is in Japanese. Code comments and documentation may be in Japanese or English.

2. **Cost Awareness**: All design decisions should consider AWS free tier limits and minimize Anthropic API usage costs.

3. **Lambda Constraints**:
   - Keep bundle size minimal (use esbuild tree-shaking)
   - Design for potential timeout (10-15 min max)
   - Process articles in batches

4. **Testing**:
   - Unit test each component in isolation
   - Mock external APIs for testing
   - Test error handling paths

5. **Commits**: Use conventional commit format:
   - `feat:` new features
   - `fix:` bug fixes
   - `docs:` documentation changes
   - `refactor:` code refactoring
   - `test:` test additions/changes
   - `chore:` maintenance tasks

### Implementation Priority

1. **Phase 1 (MVP)**: Terraform setup, Feedly Fetcher, Summarizer, Formatter, Publisher
2. **Phase 2**: X API Fetcher integration
3. **Phase 3**: Error handling hardening, CloudWatch alarms, prompt tuning

## Future Extension Points

- Additional sources: RSS, Hacker News, Reddit
- Notifications: Slack, Discord, email
- Web UI: S3 + CloudFront static site
- Auto-tagging: LLM-based category/tag generation

## References

- [Design Document](docs/DESIGN.md) - Comprehensive system design (Japanese)
- [X API v2 Documentation](https://developer.x.com/en/docs/twitter-api)
- [Feedly API Documentation](https://developer.feedly.com/)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
