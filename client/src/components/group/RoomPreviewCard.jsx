import { S } from '../../utils/strings.js';
import Avatar from '../common/Avatar.jsx';
import BoardLogo from '../common/BoardLogo.jsx';

/** "Maya's room, 10 rounds, 3 of 8 players" with the first few avatars. */
export default function RoomPreviewCard({ preview }) {
  return (
    <div className="ff-card ff-preview" data-testid="preview">
      <BoardLogo size={52} />
      <div className="ff-preview__text">
        <div className="ff-preview__title">{S.group.roomOf(preview.hostNickname)}</div>
        <div className="ff-preview__meta">
          {S.group.roomMeta(preview.rounds, preview.playerCount, preview.maxPlayers)}
        </div>
      </div>
      <div className="ff-avatars" aria-hidden="true">
        {preview.players.slice(0, 3).map((p) => (
          <Avatar key={p.nickname} nickname={p.nickname} color={p.avatarColor} size={34} />
        ))}
      </div>
    </div>
  );
}
