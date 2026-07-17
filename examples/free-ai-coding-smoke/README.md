# Free AI Coding Smoke Project

Tiny sample project used to verify the smejj.com free AI-coding workflow without
starting GLM inference or Salad GPU workers.

## User Task

Build a small Todo statistics helper that:

- counts total, open, done and overdue items,
- groups items by priority,
- never mutates the input list,
- rejects invalid input clearly.

## Run

```bash
node --test examples/free-ai-coding-smoke/todoStats.test.mjs
```
