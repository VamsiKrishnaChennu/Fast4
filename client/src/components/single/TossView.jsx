import { useEffect, useState } from 'react';
import { LETTER_POOL } from '@fastfour/shared';
import { prefersReducedMotion, useCountdown } from '../../hooks/useCountdown.js';
import { S } from '../../utils/strings.js';
import BoardLogo from '../common/BoardLogo.jsx';
import GameHeader from './GameHeader.jsx';

/** How long before writing starts the real letter settles in the centre of the board. */
const SETTLE_MS = 1800;

/** The letter toss: the centre token cycles letters, then lands on the real one. */
export default function TossView({ round, rounds, onLeave }) {
  const left = useCountdown(round.startedAt);
  const reduced = prefersReducedMotion();
  const spinning = !reduced && left > SETTLE_MS;
  const [shown, setShown] = useState(LETTER_POOL[0]);

  useEffect(() => {
    if (!spinning) return undefined;
    const id = setInterval(
      () => setShown(LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)]),
      90,
    );
    return () => clearInterval(id);
  }, [spinning]);

  const seconds = Math.max(1, Math.ceil(left / 1000));
  return (
    <main className="ff-page ff-page--narrow ff-center ff-toss">
      <GameHeader title={S.single.roundOf(round.index + 1, rounds)} onLeave={onLeave} />
      <p className="ff-muted ff-toss__lead">{S.single.yourLetter}</p>
      <div className="ff-toss__board">
        <BoardLogo size={280} letter={spinning ? shown : round.letter} />
      </div>
      <h2 className="ff-heading ff-toss__title">{S.single.getReady}</h2>
      <p className="ff-muted" role="status">
        {S.single.startsIn(seconds)}
      </p>
      <div className="ff-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`ff-dots__dot${seconds <= 3 - i ? ' is-on' : ''}`} />
        ))}
      </div>
    </main>
  );
}
