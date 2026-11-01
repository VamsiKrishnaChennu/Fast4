import { S } from '../../utils/strings.js';
import Button from '../common/Button.jsx';
import Icon from '../common/Icon.jsx';
import GameHeader from './GameHeader.jsx';

const CONFETTI = [
  { left: '9%', top: '90px', color: 'var(--ff-name)' },
  { left: '82%', top: '62px', color: 'var(--ff-thing)' },
  { left: '20%', top: '150px', color: 'var(--ff-animal)' },
  { left: '74%', top: '170px', color: 'var(--ff-place)' },
];

/** Game over: total, personal best banner, round-by-round bars and three quick facts. */
export default function SummaryView({ game, onAgain, onHome, onClose, busy }) {
  const { summary } = game;
  const roundScores = game.results.map((r) => r.roundScore);
  const best = Math.max(0, ...roundScores);
  const bestIndex = roundScores.indexOf(best);
  return (
    <main className="ff-page ff-page--wide ff-grid2 ff-summary">
      <GameHeader title={S.single.gameOver} onLeave={onClose} />
      {summary.newPersonalBest && (
        <div className="ff-confetti" aria-hidden="true">
          {CONFETTI.map((c) => (
            <span key={c.left} style={{ left: c.left, top: c.top, background: c.color }} />
          ))}
        </div>
      )}
      <div className="ff-g-art ff-center ff-summary__hero">
        {summary.newPersonalBest && (
          <span className="ff-pill ff-pill--gold" data-testid="pb">
            <Icon name="bolt" size={14} />
            {S.single.newBest}
          </span>
        )}
        <div className="ff-summary__total" data-testid="final-score">
          {summary.totalScore}
        </div>
        <p className="ff-muted">{S.single.pointsIn(game.rounds)}</p>
      </div>
      <div className="ff-card ff-chart ff-g-main">
        <div className="ff-chart__head">
          <strong>{S.single.roundByRound}</strong>
          <span className="ff-muted">{S.single.bestRound(best)}</span>
        </div>
        <ol className="ff-chart__bars">
          {roundScores.map((score, i) => (
            <li key={i} className="ff-chart__col">
              <span
                className={`ff-chart__bar${i === bestIndex ? ' is-best' : ''}`}
                style={{ height: `${Math.max(6, (score / 50) * 100)}%` }}
                role="img"
                aria-label={`${S.single.roundOf(i + 1, game.rounds)}: ${score}`}
              />
              <span className="ff-chart__n">{i + 1}</span>
            </li>
          ))}
        </ol>
      </div>
      <dl className="ff-facts ff-g-main">
        <div>
          <dd>
            {summary.validAnswers}/{summary.possibleAnswers}
          </dd>
          <dt>{S.single.validAnswers}</dt>
        </div>
        <div>
          <dd>{summary.fastestRoundSeconds === null ? '–' : `${summary.fastestRoundSeconds}s`}</dd>
          <dt>{S.single.fastest}</dt>
        </div>
        <div>
          <dd>{summary.rankToday ? `#${summary.rankToday}` : '–'}</dd>
          <dt>{S.single.today}</dt>
        </div>
      </dl>
      <div className="ff-spacer ff-grow" />
      <div className="ff-g-main ff-stack">
        <Button onClick={onAgain} disabled={busy}>
          {S.single.playAgain}
        </Button>
        <Button variant="secondary" onClick={onHome}>
          {S.single.backHome}
        </Button>
      </div>
    </main>
  );
}
