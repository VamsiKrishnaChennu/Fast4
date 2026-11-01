import { useEffect } from 'react';
import { CATEGORIES } from '@fastfour/shared';
import { S } from '../../utils/strings.js';
import Button from '../common/Button.jsx';
import CategoryTile, { categoryLabel } from '../common/CategoryTile.jsx';
import Icon from '../common/Icon.jsx';
import GameHeader from './GameHeader.jsx';

/** How long the result card stays before the next round starts by itself. */
const AUTO_NEXT_MS = 6000;

function Verdict({ verdict }) {
  const ok = verdict.verdict === 'valid';
  return (
    <span className={`ff-verdict ${ok ? 'is-ok' : 'is-bad'}`} aria-hidden="true">
      <Icon name={ok ? 'check' : 'close'} size={16} />
    </span>
  );
}

/** The card shown after each round: verdicts, points, time bonus and the running total. */
export default function ResultView({ result, rounds, roundSeconds, onNext, onLeave, busy }) {
  const validCount = CATEGORIES.filter((c) => result.verdicts[c].verdict === 'valid').length;
  const allValid = validCount === CATEGORIES.length;
  const last = result.isLast;

  useEffect(() => {
    if (last) return undefined;
    const id = setTimeout(onNext, AUTO_NEXT_MS);
    return () => clearTimeout(id);
  }, [last, onNext]);

  const reason = (v) => {
    if (v.verdict === 'blank') return S.single.noAnswer;
    if (v.verdict === 'invalid')
      return S.single.reasons[v.reason] ?? S.single.reasons.not_in_dictionary;
    return '';
  };

  return (
    <main className="ff-page ff-page--wide ff-grid2 ff-result">
      <GameHeader title={S.single.roundOf(result.index + 1, rounds)} onLeave={onLeave} />
      <div className="ff-g-art ff-center ff-result__hero">
        <p className="ff-muted ff-result__label">{S.single.roundScore}</p>
        <div className="ff-result__score" data-testid="round-score">
          {result.roundScore}
        </div>
        <span className={`ff-pill ${allValid ? 'is-ok' : 'is-muted'}`}>
          {result.missed ? (
            S.single.missed
          ) : (
            <>
              {allValid && <Icon name="check" size={14} />}
              {allValid ? S.single.allValid : S.single.someValid(validCount)}
            </>
          )}
        </span>
      </div>
      <div className="ff-card ff-rows ff-g-main ff-result__rows">
        {CATEGORIES.map((c) => {
          const v = result.verdicts[c];
          const ok = v.verdict === 'valid';
          return (
            <div className="ff-result__row" key={c} data-testid={`row-${c}`}>
              <CategoryTile category={c} size={40} />
              <span className="ff-result__word">
                <span className="ff-result__text">{v.raw || '—'}</span>
                <span className="ff-result__cat">
                  {categoryLabel(c)}
                  {!ok && ` · ${reason(v)}`}
                </span>
              </span>
              <Verdict verdict={v} />
              <span className="ff-result__pts">{ok ? `+${result.points[c]}` : '+0'}</span>
            </div>
          );
        })}
      </div>
      {result.timeBonus > 0 ? (
        <div className="ff-bonus ff-g-main" data-testid="time-bonus">
          <span className="ff-bonus__icon">
            <Icon name="bolt" size={22} />
          </span>
          <span className="ff-bonus__body">
            <strong>{S.single.timeBonus}</strong>
            <span>
              {S.single.finishedWith(Math.max(0, Math.round(roundSeconds - result.secondsUsed)))}
            </span>
          </span>
          <strong className="ff-bonus__pts">+{result.timeBonus}</strong>
        </div>
      ) : (
        !allValid &&
        !result.missed && (
          <p className="ff-muted ff-g-main ff-result__note">{S.single.bonusNeeds}</p>
        )
      )}
      <div className="ff-total ff-g-main">
        <span>{S.single.totalSoFar}</span>
        <strong data-testid="total">{result.totalScore}</strong>
      </div>
      <div className="ff-spacer ff-grow" />
      <div className="ff-g-main">
        <Button onClick={onNext} disabled={busy}>
          {last ? S.single.seeResults : S.single.nextRound}
        </Button>
      </div>
    </main>
  );
}
