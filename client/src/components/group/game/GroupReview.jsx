import { useEffect, useState } from 'react';
import { CATEGORIES } from '@fastfour/shared';
import { useRealtime } from '../../../context/RealtimeContext.jsx';
import { useCountdown } from '../../../hooks/useCountdown.js';
import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import Button from '../../common/Button.jsx';
import CategoryTile, { categoryLabel } from '../../common/CategoryTile.jsx';
import Icon from '../../common/Icon.jsx';
import GameHeader from '../../single/GameHeader.jsx';
import ChallengeConfirm from './ChallengeConfirm.jsx';

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

/** The flag, the Appeal button, the Checking state or the result of a check for one answer. */
function ChallengeControl({ answer, category, mine, left, open, pending, done, onPick }) {
  if (pending) {
    return (
      <span className="ff-review__check" role="status" data-testid={`checking-${category}`}>
        {S.game.checking}
      </span>
    );
  }
  if (done) {
    return (
      <span className="ff-badge ff-badge--challenge" data-testid={`checked-${category}`}>
        {S.game.checkedLabels[`${done.type}:${done.outcome}`]}
      </span>
    );
  }
  if (!open || left <= 0) return null;
  if (mine && answer.verdict === 'invalid' && answer.reason === 'not_in_dictionary') {
    return (
      <button
        type="button"
        className="ff-flagbtn ff-flagbtn--text"
        onClick={onPick}
        aria-label={S.game.appealAction(answer.raw)}
        data-testid={`appeal-${category}`}
      >
        {S.game.appeal}
      </button>
    );
  }
  if (!mine && answer.verdict === 'valid') {
    return (
      <button
        type="button"
        className="ff-flagbtn"
        onClick={onPick}
        aria-label={S.game.challengeAction(answer.raw)}
        data-testid={`flag-${category}`}
      >
        <Icon name="flag" size={18} />
      </button>
    );
  }
  return null;
}

/** Everyone's answers with the verdict and points for each, plus the first-finisher bonus holder. */
export default function GroupReview({ room, me, isHost, onSkip, onLeave, busy }) {
  const { review } = room;
  const timeLeft = useCountdown(review.reviewEndsAt);
  const { challenge, checkError, clearCheckError } = useRealtime();
  const [pick, setPick] = useState(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const left = room.challengesLeft ?? 0;
  const pending = room.openChallenges ?? [];
  const checked = room.checked ?? [];
  const open = !review.closing;
  const find = (list, userId, category) =>
    list.find((c) => c.targetUserId === userId && c.category === category);
  const showError =
    checkError && checkError.initiatorId === me && checkError.roundIndex === review.index;
  // The error notice goes away by itself, and when the next round begins.
  useEffect(() => {
    if (!checkError) return undefined;
    const id = setTimeout(clearCheckError, 6000);
    return () => clearTimeout(id);
  }, [checkError, clearCheckError]);
  useEffect(() => clearCheckError, [clearCheckError]);

  const send = async () => {
    setSending(true);
    setProblem('');
    try {
      await challenge(review.index, pick.userId, pick.category);
      setPick(null);
    } catch (err) {
      setProblem(S.game.challengeErrors[err.code] ?? S.game.sendError);
    } finally {
      setSending(false);
    }
  };
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
          {clock(timeLeft)}
        </span>
        <span className="ff-pill is-muted" data-testid="challenges-left">
          <Icon name="flag" size={14} />
          {S.game.challengesLeft(left)}
        </span>
      </div>
      <p className="ff-muted ff-review__help">{S.game.challengeHelp}</p>
      {showError && (
        <p className="ff-review__toast" role="status" data-testid="check-error">
          {S.game.checkFailed}
        </p>
      )}
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
                    <ChallengeControl
                      row={row}
                      category={c}
                      answer={a}
                      mine={mineRow}
                      left={left}
                      open={open}
                      pending={find(pending, row.userId, c)}
                      done={find(checked, row.userId, c)}
                      onPick={() =>
                        setPick({
                          userId: row.userId,
                          category: c,
                          word: a.raw,
                          type: mineRow ? 'appeal' : 'challenge',
                        })
                      }
                    />
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
        {review.closing && (
          <p className="ff-muted ff-review__note ff-review__note--show">{S.game.reviewClosing}</p>
        )}
        {isHost ? (
          <Button variant="secondary" onClick={onSkip} disabled={busy || pending.length > 0}>
            {pending.length > 0 ? S.game.skipWaiting : S.game.skipReview}
          </Button>
        ) : null}
        {isHost && <p className="ff-muted ff-review__note">{S.game.skipNote}</p>}
      </footer>
      {pick && (
        <ChallengeConfirm
          pick={pick}
          left={left}
          busy={sending}
          error={problem}
          onCancel={() => {
            setPick(null);
            setProblem('');
          }}
          onConfirm={send}
        />
      )}
    </main>
  );
}
