import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '@fastfour/shared';
import { useRealtime } from '../../../context/RealtimeContext.jsx';
import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import Icon from '../../common/Icon.jsx';
import WritingView from '../../single/WritingView.jsx';
import PlayerStatus from './PlayerStatus.jsx';

const DRAFT_DELAY_MS = 500;
const DRAFT_MAX_MS = 2000;
const EMPTY = Object.fromEntries(CATEGORIES.map((c) => [c, '']));

/**
 * Writing in a group room. Typed answers are saved to the server a moment after typing stops
 * (and at least every two seconds), so a reload or lost connection keeps them.
 */
export default function GroupWriting({ room, me, onLeave }) {
  const { sendDraft, submitAnswers } = useRealtime();
  const { round } = room;
  const mine = room.standings.find((s) => s.userId === me);
  const [answers, setAnswers] = useState({ ...EMPTY, ...room.myDraft });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(answers);
  const timer = useRef(null);
  const lastSent = useRef(0);
  const submitted = Boolean(room.mySubmitted);
  const first = round.finished[0]?.userId === me;

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    lastSent.current = Date.now();
    sendDraft(round.index, latest.current);
  }, [sendDraft, round.index]);

  const change = (category, value) => {
    const next = { ...latest.current, [category]: value };
    latest.current = next;
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    const wait = Math.min(
      DRAFT_DELAY_MS,
      Math.max(0, lastSent.current + DRAFT_MAX_MS - Date.now()),
    );
    timer.current = setTimeout(flush, wait);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const submit = useCallback(async () => {
    setSending(true);
    setError('');
    try {
      await submitAnswers(round.index, latest.current);
    } catch (err) {
      setError(err.code === 'ROUND_EXPIRED' ? '' : S.game.sendError);
    } finally {
      setSending(false);
    }
  }, [submitAnswers, round.index]);

  const others = room.players.filter((p) => p.userId !== me && !p.left);
  const side = submitted ? (
    <>
      <div className="ff-bonus ff-write__banner" data-testid="finished-banner">
        <span className="ff-bonus__icon">
          <Icon name="bolt" size={22} />
        </span>
        <span className="ff-bonus__body">
          <strong>{first ? S.game.finishedFirst : S.game.finished}</strong>
          <span>{first ? S.game.finishedFirstBody : S.game.finishedBody}</span>
        </span>
      </div>
      <div className="ff-desktop-only ff-write__waiting">
        <h2 className="ff-label">{S.game.waitingFor}</h2>
        <PlayerStatus room={room} me={me} />
      </div>
    </>
  ) : (
    <div className="ff-write__strip" role="status">
      <span className="ff-avatars" aria-hidden="true">
        {others.map((p) => (
          <Avatar key={p.userId} nickname={p.nickname} color={p.avatarColor} size={24} />
        ))}
      </span>
      <span>{S.game.stillWriting}</span>
    </div>
  );

  return (
    <WritingView
      key={round.index}
      round={{ index: round.index, letter: round.letter, endsAt: round.endsAt }}
      rounds={room.totalRounds}
      roundSeconds={round.roundMs / 1000}
      score={mine?.totalScore ?? 0}
      answers={answers}
      onChange={change}
      onSubmit={submit}
      onLeave={onLeave}
      locked={submitted || sending}
      error={error}
      autoSubmit={false}
      onTimeUp={flush}
      hideTimeUp={submitted}
      side={side}
      bottom={
        submitted ? (
          <div className="ff-mobile-only ff-write__waiting">
            <h2 className="ff-label">{S.game.waitingFor}</h2>
            <PlayerStatus room={room} me={me} />
          </div>
        ) : null
      }
    />
  );
}
