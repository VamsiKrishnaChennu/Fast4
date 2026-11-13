import { prefersReducedMotion } from '../../../hooks/useCountdown.js';
import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import Button from '../../common/Button.jsx';
import Icon from '../../common/Icon.jsx';
import GameHeader from '../../single/GameHeader.jsx';

const CONFETTI = [
  { left: '9%', top: '90px', color: 'var(--ff-name)' },
  { left: '82%', top: '62px', color: 'var(--ff-thing)' },
  { left: '20%', top: '150px', color: 'var(--ff-animal)' },
  { left: '74%', top: '170px', color: 'var(--ff-place)' },
];

/** Podium for the top three, everyone's final place and a few facts about your own game. */
export default function GroupGameOver({ room, me, isHost, onPlayAgain, onLeave, busy }) {
  const { standings, winnerIds, stats } = room.gameOver;
  const mine = standings.find((s) => s.userId === me);
  const winners = standings.filter((s) => winnerIds.includes(s.userId));
  const iWon = winnerIds.includes(me);
  const title = iWon
    ? S.game.youWon
    : winners.length === 1
      ? S.game.wins(winners[0].nickname)
      : S.game.tie;
  const rest = standings.slice(3);
  const podium = [standings[1], standings[0], standings[2]].filter(Boolean);
  const myStats = stats[me] ?? { uniqueAnswers: 0, firstFinisherCount: 0, failedChallenges: 0 };

  return (
    <main className="ff-page ff-page--wide ff-gameover">
      <GameHeader title={S.game.gameOver} onLeave={onLeave} />
      {iWon && !prefersReducedMotion() && (
        <div className="ff-confetti" aria-hidden="true">
          {CONFETTI.map((c) => (
            <span key={c.left} style={{ left: c.left, top: c.top, background: c.color }} />
          ))}
        </div>
      )}
      <div className="ff-center ff-gameover__hero">
        <h2 className="ff-title ff-title--lg" data-testid="game-over-title">
          {title}
        </h2>
        {mine && (
          <p className="ff-muted" data-testid="game-over-you">
            {S.game.youCame(S.game.places[mine.rank - 1] ?? `#${mine.rank}`, mine.totalScore)}
          </p>
        )}
      </div>
      <ol className="ff-podium" aria-label={S.game.standings}>
        {podium.map((p) => (
          <li key={p.userId} className={`ff-podium__slot ff-podium__slot--${p.rank}`}>
            {p.rank === 1 && <Icon name="crown" size={22} />}
            <Avatar nickname={p.nickname} color={p.avatarColor} size={p.rank === 1 ? 48 : 40} />
            <span className="ff-podium__name">{p.userId === me ? S.game.you : p.nickname}</span>
            <strong>{p.totalScore}</strong>
            <span className="ff-podium__step">{p.rank}</span>
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <ol className="ff-card ff-standings ff-gameover__rest" start={4}>
          {rest.map((p) => (
            <li key={p.userId} className={`ff-standings__row${p.userId === me ? ' is-me' : ''}`}>
              <span className="ff-standings__rank">{p.rank}</span>
              <Avatar nickname={p.nickname} color={p.avatarColor} size={30} />
              <span className="ff-standings__who">
                <span className="ff-standings__name">
                  {p.userId === me ? S.game.you : p.nickname}
                </span>
              </span>
              <strong className="ff-standings__score">{p.totalScore}</strong>
            </li>
          ))}
        </ol>
      )}
      <dl className="ff-facts">
        <div>
          <dd>{myStats.uniqueAnswers}</dd>
          <dt>{S.game.uniqueAnswers}</dt>
        </div>
        <div>
          <dd>{myStats.firstFinisherCount}</dd>
          <dt>{S.game.bonuses}</dt>
        </div>
        <div>
          <dd>{myStats.failedChallenges}</dd>
          <dt>{S.game.failedChallenges}</dt>
        </div>
      </dl>
      <div className="ff-gameover__actions">
        <Button variant="secondary" onClick={onLeave} disabled={busy}>
          {S.game.leave}
        </Button>
        {isHost ? (
          <Button onClick={onPlayAgain} disabled={busy}>
            {S.game.playAgain}
          </Button>
        ) : (
          <p className="ff-muted">{S.game.waitingHost}</p>
        )}
      </div>
    </main>
  );
}
