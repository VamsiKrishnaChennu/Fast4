import { S } from '../../../utils/strings.js';
import Avatar from '../../common/Avatar.jsx';
import Icon from '../../common/Icon.jsx';

/** One line per other player: who has pressed Done and who is still writing. */
export default function PlayerStatus({ room, me }) {
  const done = new Map((room.round?.finished ?? []).map((f) => [f.userId, f.order]));
  const others = room.players.filter((p) => p.userId !== me);
  return (
    <ul className="ff-plist ff-statuslist" aria-label={S.game.waitingFor}>
      {others.map((p) => {
        const finished = done.has(p.userId);
        let label = finished ? S.game.statusFinished : S.game.statusWriting;
        if (p.left) label = S.game.statusLeft;
        else if (!p.connected && !finished) label = S.game.statusAway;
        return (
          <li key={p.userId} className="ff-plist__row">
            <span className="ff-plist__who">
              <Avatar nickname={p.nickname} color={p.avatarColor} size={32} />
              <span className="ff-plist__name">{p.nickname}</span>
            </span>
            <span className={`ff-pill ${finished ? 'is-ok' : 'is-muted'}`}>
              {finished && <Icon name="check" size={12} />}
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
