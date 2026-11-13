import { useEffect, useState } from 'react';
import { LETTER_POOL } from '@fastfour/shared';
import { prefersReducedMotion } from '../../../hooks/useCountdown.js';
import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import BoardLogo from '../../common/BoardLogo.jsx';
import GameHeader from '../../single/GameHeader.jsx';

/** The toss: the centre token cycles letters until the server sends the real one. */
export default function GroupToss({ room, onLeave }) {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(LETTER_POOL[0]);
  const index = room.round?.index ?? 0;

  useEffect(() => {
    if (reduced) return undefined;
    const id = setInterval(
      () => setShown(LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)]),
      90,
    );
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <main className="ff-page ff-page--narrow ff-center ff-toss">
      <GameHeader title={S.single.roundOf(index + 1, room.totalRounds)} onLeave={onLeave} />
      <p className="ff-muted ff-toss__lead">{S.game.everyoneLetter}</p>
      <div className="ff-toss__board">
        <BoardLogo size={280} letter={reduced ? undefined : shown} />
      </div>
      <h2 className="ff-heading ff-toss__title">{S.game.getReady}</h2>
      <p className="ff-muted" role="status">
        {S.game.startsSoon}
      </p>
      <div className="ff-avatars" aria-hidden="true">
        {room.players
          .filter((p) => !p.left)
          .map((p) => (
            <Avatar key={p.userId} nickname={p.nickname} color={p.avatarColor} size={32} />
          ))}
      </div>
    </main>
  );
}
