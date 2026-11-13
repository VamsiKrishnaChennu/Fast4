import { CATEGORIES } from '@fastfour/shared';
import { useCountdown } from '../../../hooks/useCountdown.js';
import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import Button from '../../common/Button.jsx';
import CategoryTile, { categoryLabel } from '../../common/CategoryTile.jsx';
import Icon from '../../common/Icon.jsx';
import GameHeader from '../../single/GameHeader.jsx';

const clock = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Badge({ answer }) {
  if (answer.verdict === 'blank')
    return <span className="ff-badge ff-badge--invalid">{S.game.blank}</span>;
  if (answer.verdict === 'invalid')
    return <span className="ff-badge ff-badge--invalid">{S.game.invalid}</span>;
  return answer.count > 1 ? (
    <span className="ff-badge ff-badge--shared">{S.game.shared(answer.points)}</span>
  ) : (
    <span className="ff-badge ff-badge--unique">{S.game.unique(answer.points)}</span>
  );
}

/** Everyone's answers with the verdict and points for each, plus the first-finisher bonus holder. */
export default function GroupReview({ room, me, isHost, onSkip, onLeave, busy }) {
  const { review } = room;
  const left = useCountdown(review.reviewEndsAt);
  const bySeat = new Map(room.players.map((p) => [p.userId, p]));
  const bonus = bySeat.get(review.bonusWinnerId);
  const myRow = review.submissions.find((s) => s.userId === me);
  const ordered = [...review.submissions].sort((a, b) =>
    a.userId === me ? -1 : b.userId === me ? 1 : 0,
  );

  return (
    <main className="ff-page ff-page--wide ff-review">
      <GameHeader title={S.game.reviewTitle(review.index + 1)} onLeave={onLeave} />
      <div className="ff-review__chips">
        <span className="ff-pill ff-pill--gold" data-testid="review-bonus">
          <Icon name="bolt" size={14} />
          {bonus ? S.game.bonus(bonus.userId === me ? S.game.you : bonus.nickname) : S.game.noBonus}
        </span>
        <span className="ff-pill is-muted" data-testid="review-timer">
          <Icon name="timer" size={14} />
          {clock(left)}
        </span>
      </div>
      <div className="ff-review__cards">
        {CATEGORIES.map((c) => (
          <section key={c} className="ff-card ff-review__card" aria-label={categoryLabel(c)}>
            <h2 className="ff-review__cat">
              <CategoryTile category={c} size={28} />
              {categoryLabel(c)}
            </h2>
            <ul className="ff-review__rows">
              {ordered.map((row) => {
                const seat = bySeat.get(row.userId);
                const a = row.answers[c];
                const mineRow = row.userId === me;
                return (
                  <li
                    key={row.userId}
                    className="ff-review__row"
                    data-testid={`review-${c}-${row.userId}`}
                  >
                    <Avatar nickname={seat?.nickname} color={seat?.avatarColor} size={30} />
                    <span className="ff-review__who">
                      <span className="ff-review__name">
                        {mineRow ? S.game.you : (seat?.nickname ?? '')}
                        {row.firstFinisherBonus > 0 && c === 'name' && (
                          <span className="ff-review__first"> +5 {S.game.first}</span>
                        )}
                      </span>
                      <span className={`ff-review__word${a.verdict === 'valid' ? '' : ' is-bad'}`}>
                        {a.raw || '—'}
                      </span>
                      {a.verdict === 'invalid' && (
                        <span className="ff-review__reason">
                          {S.single.reasons[a.reason] ?? S.single.reasons.not_in_dictionary}
                        </span>
                      )}
                    </span>
                    <Badge answer={a} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <footer className="ff-review__foot">
        <div className="ff-total">
          <span>{S.game.yourRound}</span>
          <strong data-testid="my-round-score">{myRow?.roundScore ?? 0}</strong>
        </div>
        {isHost ? (
          <Button variant="secondary" onClick={onSkip} disabled={busy}>
            {S.game.skipReview}
          </Button>
        ) : null}
        {isHost && <p className="ff-muted ff-review__note">{S.game.skipNote}</p>}
      </footer>
    </main>
  );
}
