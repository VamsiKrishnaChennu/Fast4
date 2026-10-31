# Word-check accuracy results

**Status: not measured yet.** The build sandbox cannot reach Wikidata or api.dictionaryapi.dev, so the accuracy spike (Development Playbook section 8.5) must be run once on a machine with internet access.

## How to run it

```
npm run judge:evaluate
```

(Add `-- --category=place` to run one category.) The script:

1. Fetches the English label of every Wikidata class id used by the checks and stops with a clear message if one does not match. **These ids were written from memory and have not been verified yet.**
2. Runs the 400 samples in `server/tests/fixtures/judge-samples.json` (100 per category, half clearly valid and half clearly invalid) through the real `judgeService` and prints, per category: correct, wrong, inconclusive, errors, accuracy on definitive results, and the percentage definitively wrong.

Targets: at least 90% correct on definitive results and under 5% definitively wrong.

## Results

| Category | Words | Correct | Wrong | Inconclusive | Errors | Accuracy % | Wrong % of all |
| -------- | ----- | ------- | ----- | ------------ | ------ | ---------- | -------------- |
| name     |       |         |       |              |        |            |                |
| place    |       |         |       |              |        |            |                |
| animal   |       |         |       |              |        |            |                |
| thing    |       |         |       |              |        |            |                |

Notes after the run (list words that came out wrong, what was tuned, and any category below target): _pending_

## What to tune if a category misses the target

- Names, places and animals look at the first 20 Wikidata search hits. A very common word may need a larger `limit` or a better filter in `wikidataCandidates`.
- Animals: the keyword list for the dictionary fallback is in `ANIMAL_WORDS` in `judgeService.js`.
- Things: the Free Dictionary API is a free community service with no guarantee; if it is often unavailable, set `JUDGE_ENABLED=false` as a temporary measure (every challenge then ends as inconclusive).
- If a category cannot reach the target, keep it, record the limitation in `docs/DECISIONS.md` and tell the owner. Inconclusive results simply leave the verdict unchanged.
