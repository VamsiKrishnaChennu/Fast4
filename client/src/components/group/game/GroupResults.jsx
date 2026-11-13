import { CATEGORIES } from '@fastfour/shared';
import { useCountdown } from '../../../hooks/useCountdown.js';
import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import CategoryTile from '../../common/CategoryTile.jsx';
import Icon from '../../common/Icon.jsx';
import GameHeader from '../../single/GameHeader.jsx';

function Move({ before, after }) {
  if (before === null || before === after) {
    return (
      <span className="ff-move" aria-label={S.game.rankSame}>
        –
      </span>
    );
  }
  const up = after < before;
  return (
    <span
      className={`ff-move ${up ? 'is-up' : 'is-down'}`}
      aria-label={up ? S.game.rankUp : S.game.rankDown}
    >
      {up ? '▲' : '▼'}
    </span>
  );
}

/** Standings after a round, your own round breakdown and a bar counting down to the next letter. */
export default function GroupResults({ room, me, onLeave }) {
  const { results } = room;
  const left = useCountdown(results.nextAt);
  const total = Math.max(1, results.nextAt - results.shownAt);
  const row = results.breakdown.find((b) => b.userId === me);
  const seconds = Math.max(0, Math.ceil(left / 1000));
  const previous = new Map(results.breakdown.map((b) => [b.userId, b.previousRank]));
  const gained = new Map(results.breakdown.map((b) => [b.userId, b]));
  const mineBonus = row?.firstFinisherBonus ?? 0;

  return (
    <main className="ff-page ff-page--wide ff-results">
      <GameHeader title={S.single.roundOf(results.index + 1, room.totalRounds)} onLeave={onLeave} />
      <div className="ff-results__cols">
        <div className="ff-results__board">
          <h2 className="ff-heading">{S.game.standings}</h2>
          <ol className="ff-card ff-standings">
            {results.standings.map((p) => (
              <li
                key={p.userId}
                className={`ff-standings__row${p.userId === me ? ' is-me' : ''}`}
                data-testid={`standing-${p.userId}`}
              >
                <span className="ff-standings__rank">{p.rank}</span>
                <Avatar nickname={p.nickname} color={p.avatarColor} size={34} />
                <span className="ff-standings__who">
                  <span className="ff-standings__name">
                    {p.userId === me ? S.game.you : p.nickname}
                  </span>
                  <span className="ff-standings__sub">
                    {S.game.thisRound(gained.get(p.userId)?.roundScore ?? 0)}
                  </span>
                </span>
                <Move before={previous.get(p.userId) ?? null} after={p.rank} />
                <strong className="ff-standings__score">{p.totalScore}</strong>
              </li>
            ))}
          </ol>
        </div>
        {row && (
          <div className="ff-card ff-yourround">
            <div className="ff-chart__head">
              <strong>{S.game.yourRoundCard}</strong>
              <strong data-testid="my-round-score">{row.roundScore}</strong>
            </div>
            <div className="ff-yourround__tiles">
              {CATEGORIES.map((c) => (
                <span key={c} className="ff-yourround__tile">
                  <CategoryTile category={c} size={32} />
                  <strong>+{row.answerPoints[c]}</strong>
                </span>
              ))}
            </div>
            {mineBonus > 0 && (
              <p className="ff-yourround__bonus">
                <Icon name="bolt" size={14} /> {S.game.firstBonus} +{mineBonus}
              </p>
            )}
          </div>
        )}
      </div>
      <footer className="ff-results__foot">
        <div className="ff-results__label">
          <span role="status">
            {results.isLast ? S.game.finalIn(seconds) : S.game.nextLetter(seconds)}
          </span>
          <span>{S.game.roundProgress(results.index + 1, room.totalRounds)}</span>
        </div>
        <div className="ff-progress" aria-hidden="true">
          <div
            className="ff-progress__fill"
            style={{ width: `${Math.min(100, (1 - left / total) * 100)}%` }}
          />
        </div>
      </footer>
    </main>
  );
}
