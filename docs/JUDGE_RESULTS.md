# Word-check accuracy results

**Status: first run done on 1 Nov 2026 (owner's laptop); only the name category was measured properly.** Place, animal and thing mostly failed with "service unavailable" errors, so they must be run again with the improved script (see below). The build sandbox cannot reach Wikidata or api.dictionaryapi.dev, so this test has to run on a machine with internet access.

## How to run it

```
npm run judge:evaluate
```

(Add `-- --category=place` to run one category, `-- --verbose` for details, `-- --delay=2000` to go slower.) The script:

1. Fetches the English label of every Wikidata class id used by the checks and stops with a clear message if one does not match. **These ids were written from memory and have not been verified yet.**
2. Runs the 400 samples in `server/tests/fixtures/judge-samples.json` (100 per category, half clearly valid and half clearly invalid) through the real `judgeService` and prints, per category: correct, wrong, inconclusive, errors, accuracy on definitive results, and the percentage definitively wrong.

Targets: at least 90% correct on definitive results and under 5% definitively wrong.

## Results

### Run 1 (1 Nov 2026, owner's laptop, old script without pacing)

| Category | Words | Correct | Wrong | Inconclusive | Errors | Accuracy % | Wrong % of all |
| -------- | ----- | ------- | ----- | ------------ | ------ | ---------- | -------------- |
| name     | 100   | 91      | 1     | 8            | 0      | 98.9       | 1.0            |
| place    | 100   | 0       | 0     | 11           | 89     | n/a        | 0.0            |
| animal   | 100   | 0       | 0     | 0            | 100    | n/a        | 0.0            |
| thing    | 100   | 13      | 7     | 0            | 80     | 65.0       | 7.0            |

Notes after the run: **name passes the target** (98.9% accurate, 1.0% wrong). The one wrong name is `hammer` (expected invalid; Wikidata probably lists Hammer as a given name or surname, so the sample is ambiguous rather than the check being wrong). **Place, animal and thing are not measured yet.** Their errors are "service unavailable": the old script asked about 100 words in a few seconds, the services answered "too many requests" (HTTP 429) or timed out, and the service's back-off then made every remaining word fail at once. The 7 wrong things are table, window, bottle, piano, guitar, clock and mirror, all expected valid and judged invalid. These are everyday nouns, so the Free Dictionary API probably answered "not found" or an odd reply while under load; the next run must show the raw replies to confirm. The 11 inconclusive places (the first 11 words, including paris and london) also need a look at the raw search replies.

### What changed after run 1

- The evaluate script now waits between words (1.2 s by default), waits and retries when a service is busy, counts failures by reason (timeout, network, http 429, http 5xx), and with `--verbose` prints every wrong, inconclusive or failed word together with the requests behind it.
- The word-check service now retries once on a network failure or server error, and the place and animal Wikidata questions are lighter (a place has coordinates, a country or an administrative parent; an animal has a parent-taxon chain ending at Animalia). The old whole-tree walk was likely too slow to finish inside the 6 second limit.

### Run 2 (to do)

Run the categories one at a time with the details switched on and send the output back:

```
npm run judge:evaluate -- --category=place --verbose
npm run judge:evaluate -- --category=animal --verbose
npm run judge:evaluate -- --category=thing --verbose
```

Then replace the run 1 table with the new rows and update the notes. Targets: at least 90% correct on definitive results and under 5% definitively wrong.

## What to tune if a category misses the target

- Names, places and animals look at the first 20 Wikidata search hits. A very common word may need a larger `limit` or a better filter in `wikidataCandidates`.
- Animals: the keyword list for the dictionary fallback is in `ANIMAL_WORDS` in `judgeService.js`.
- Things: the Free Dictionary API is a free community service with no guarantee; if it is often unavailable, set `JUDGE_ENABLED=false` as a temporary measure (every challenge then ends as inconclusive).
- If a category cannot reach the target, keep it, record the limitation in `docs/DECISIONS.md` and tell the owner. Inconclusive results simply leave the verdict unchanged.
