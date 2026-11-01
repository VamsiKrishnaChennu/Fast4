# Word-check accuracy results

**Status: three runs done on 1 Nov 2026 (owner's laptop). Name (run 1) and place (run 3) pass. Animal and thing miss the target; fixes for animal are in, and the Free Dictionary API behaviour for things is still unexplained. Run 4 is needed (see below).** The build sandbox cannot reach Wikidata or api.dictionaryapi.dev, so this test has to run on a machine with internet access.

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

### Run 2 (1 Nov 2026, owner's laptop, paced script)

| Category | Words | Correct | Wrong | Inconclusive | Errors | Accuracy % | Wrong % of all |
| -------- | ----- | ------- | ----- | ------------ | ------ | ---------- | -------------- |
| place    | 100   | 61      | 30    | 9            | 0      | 67.0       | 30.0           |
| animal   | 100   | 3       | 0     | 11           | 86     | 100.0      | 0.0            |
| thing    | 100   | 88      | 12    | 0            | 0      | 88.0       | 12.0           |

Notes after run 2:

- **Place: all 50 real places were accepted, but 30 everyday words were also accepted as places** (keyboard, mattress, tractor, staircase, blanket, pencil, bottle, fridge, chair, kitchen, sandwich, calendar, umbrella, ladder, scissors, kettle, compass, envelope, helmet, magnet, telescope, toothbrush, trumpet, wallet, lantern, teapot, hammer, pillow, mirror, quickly). The cause is the test question used in this run ("has map coordinates, a country or an administrative parent"), which any obscure village or landmark named "Kitchen" or "Blanket" passes. Some of these words really are place names somewhere, so the sample is also unfair, but the rule was too loose.
- **Animal: not measured.** 75 lookups timed out and 11 were paused after HTTP 429. The animal question (walk up the parent-taxon chain) is too slow for the 6 second limit as written.
- **Thing: 88% accurate, 12% wrong, below target.** The 4 invalid words judged valid (quite, beautiful, short, brave) have genuine noun meanings in a dictionary, so those samples were ambiguous and have been replaced. The 8 valid words judged invalid (table, window, bottle, piano, guitar, clock, mirror, envelope) are the same ones as run 1 and are everyday nouns, so the Free Dictionary API itself seems to answer "not found" or "no noun" for them. This is still unexplained; the raw reply for one of them is needed (see below).

### Run 3 (1 Nov 2026, owner's laptop, after the place and animal fixes)

| Category | Words | Correct | Wrong | Inconclusive | Errors | Accuracy % | Wrong % of all |
| -------- | ----- | ------- | ----- | ------------ | ------ | ---------- | -------------- |
| place    | 100   | 82      | 3     | 15           | 0      | 96.5       | 3.0            |
| animal   | 100   | 74      | 18    | 8            | 0      | 80.4       | 18.0           |
| thing    | 100   | 93      | 7     | 0            | 0      | 93.0       | 7.0            |

Notes after run 3:

- **Place: passes** (96.5% accurate, 3.0% wrong). The 3 "wrong" words (blanket, sandwich, magnet) are real places (Blanket in Texas, Sandwich in Kent), so the samples were ambiguous; they were replaced for future runs. 15 inconclusive are mostly nonsense words with no Wikidata match, which is the intended outcome.
- **Animal: fails** (80.4% accurate, 18.0% wrong). Seventeen real animals were judged invalid (elephant, wolf, cow, eagle, dolphin, kangaroo, otter, badger, cobra, salmon, trout, jellyfish, butterfly, mongoose, chameleon, flamingo, vulture): Wikidata's best three hits for a common name are often not the animal itself, and with only three candidates the real one was missed. `spatula` is the name of a genus of ducks, so it is a genuinely valid animal word; the sample was replaced.
- **Thing: accuracy passes, definitive errors do not** (93.0% accurate, but 7.0% wrong against a limit of 5%). `table` is now correct, so the Free Dictionary API is inconsistent, not simply missing words. The 7 still wrong (window, bottle, piano, guitar, clock, mirror, envelope) are everyday nouns judged invalid. The raw replies are still needed to say why.
- **Name** was last measured in run 1 (98.9%). The candidate window changed since, so it needs a re-run.

### What changed after runs 1 to 3

- The evaluate script waits between words (1.2 s), waits as long as a busy service asks (Retry-After) and retries, counts failures by reason, and with `--verbose` prints every wrong, inconclusive or failed word with the requests behind it. `npm run judge:probe -- <category> <word>` shows the full story for a single word.
- The word-check service retries once on a network failure or server error, and every failure carries a reason.
- **Place:** a place must be an instance of a place class (geographic location, administrative territorial entity, human settlement, geographic region, geographical feature, body of water, landform, territorial entity, country, sovereign state) or of a subclass up to three fixed steps away, and only the three best Wikidata matches are examined.
- **Animal:** the family-tree question carries Wikidata's forward-walk hint; names and animals now examine the ten best matches; and when Wikidata does not confirm an animal, the dictionary gets a say: a meaning that mentions mammal, bird, fish, insect and so on makes it valid.
- **Samples:** words that really are places, animals or have noun meanings were replaced (blanket, sandwich, magnet, spatula, quite, beautiful, short, brave).

### Run 4 (to do)

1. See what the dictionary API says about one of the failing things (it prints the HTTP status, the start of the reply and the parts of speech found):

```
npm run judge:probe -- thing window
npm run judge:probe -- thing piano
```

2. Re-run the categories and send back the output:

```
npm run judge:evaluate -- --category=name
npm run judge:evaluate -- --category=animal --verbose
npm run judge:evaluate -- --category=thing --verbose
```

Targets: at least 90% correct on definitive results and under 5% definitively wrong.

## What to tune if a category misses the target

- Names, places and animals look at the first 20 Wikidata search hits. A very common word may need a larger `limit` or a better filter in `wikidataCandidates`.
- Animals: the keyword list for the dictionary fallback is in `ANIMAL_WORDS` in `judgeService.js`.
- Things: the Free Dictionary API is a free community service with no guarantee; if it is often unavailable, set `JUDGE_ENABLED=false` as a temporary measure (every challenge then ends as inconclusive).
- If a category cannot reach the target, keep it, record the limitation in `docs/DECISIONS.md` and tell the owner. Inconclusive results simply leave the verdict unchanged.
