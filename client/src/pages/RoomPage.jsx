import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { normalizeRoomCode } from '@fastfour/shared';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import Modal from '../components/common/Modal.jsx';
import ConnectionBanner from '../components/group/ConnectionBanner.jsx';
import GroupGame from '../components/group/game/GroupGame.jsx';
import Lobby from '../components/group/Lobby.jsx';
import { useBackGuard } from '../hooks/useBackGuard.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { S } from '../utils/strings.js';

const BLOCKED = {
  ROOM_FULL: S.group.full,
  ROOM_LOCKED: S.group.locked,
  FORBIDDEN: S.group.forbidden,
};

/** One screen for everything in a room: the lobby, then the screen for each game phase. */
export default function RoomPage() {
  const { code: rawCode } = useParams();
  const code = normalizeRoomCode(rawCode);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { room, notice, connection, joinRoom, leaveRoom, clearNotice } = useRealtime();
  const [problem, setProblem] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [askingBack, setAskingBack] = useState(false);
  const tried = useRef('');
  const inThisRoom = room?.code === code;
  const inPlay = inThisRoom && !notice && !problem;
  const exit = useBackGuard(true, (leaveNow) => {
    if (inPlay) setAskingBack(true);
    else leaveNow(() => navigate('/home', { replace: true }));
  });

  // Opening a share link (or reloading) puts the player in the room once the connection is up.
  useEffect(() => {
    if (inThisRoom || notice || connection !== 'connected' || tried.current === code) return;
    tried.current = code;
    joinRoom(code).catch((err) => setProblem(err.code));
  }, [inThisRoom, notice, connection, code, joinRoom]);

  async function leave() {
    setLeaving(true);
    try {
      await leaveRoom();
    } catch {
      // Leaving always works from the player's side; the server drops them on disconnect anyway.
    }
    setAskingBack(false);
    exit(() => navigate('/home', { replace: true }));
  }

  const goHome = () => {
    clearNotice();
    exit(() => navigate('/home', { replace: true }));
  };

  if (notice) {
    const text = {
      removed: [S.lobby.removedTitle, S.lobby.removedBody(notice.hostNickname)],
      takeover: [S.lobby.takeoverTitle, S.lobby.takeoverBody],
      closed: [S.lobby.closedTitle, S.lobby.closedBody],
    }[notice.type];
    return (
      <main className="ff-page ff-page--narrow">
        <Modal
          title={text[0]}
          icon={<Icon name="logout" size={32} />}
          tone={notice.type === 'removed' ? 'navy' : 'warning'}
        >
          <p className="ff-muted ff-modal__body">{text[1]}</p>
          <Button onClick={goHome} data-autofocus>
            {S.lobby.backHome}
          </Button>
        </Modal>
      </main>
    );
  }

  if (problem) {
    const notFound = problem === 'ROOM_NOT_FOUND';
    return (
      <main className="ff-page ff-page--narrow">
        <Modal
          title={notFound ? S.group.notFoundTitle : S.group.cannotJoinTitle}
          icon={<Icon name="warn" size={34} />}
          tone="warning"
        >
          <p className="ff-muted ff-modal__body">
            {notFound ? S.group.notFoundBody : (BLOCKED[problem] ?? S.errors.generic)}
          </p>
          <Button
            onClick={() =>
              exit(() => navigate(notFound ? '/group?tab=join' : '/group', { replace: true }))
            }
            data-autofocus
          >
            {notFound ? S.group.tryAgain : S.lobby.backHome}
          </Button>
        </Modal>
      </main>
    );
  }

  if (!inThisRoom) {
    return (
      <main className="ff-page ff-page--narrow ff-center" style={{ justifyContent: 'center' }}>
        <ConnectionBanner />
        <div className="ff-hero">
          <BoardLogo size={96} />
        </div>
        <p className="ff-muted" role="status">
          {S.group.joiningRoom}
        </p>
      </main>
    );
  }

  const backModal = askingBack && (
    <Modal
      title={S.room.backTitle}
      icon={<Icon name="logout" size={32} />}
      tone="warning"
      onClose={() => setAskingBack(false)}
    >
      <p className="ff-muted ff-modal__body">{S.room.backBody}</p>
      <div className="ff-modal__actions">
        <Button variant="secondary" onClick={() => setAskingBack(false)} data-autofocus>
          {S.game.stay}
        </Button>
        <Button variant="red" onClick={leave} disabled={leaving}>
          {S.room.backLeave}
        </Button>
      </div>
    </Modal>
  );

  return (
    <>
      {room.phase === 'LOBBY' ? (
        <Lobby room={room} me={user.id} onLeave={leave} busy={leaving} />
      ) : (
        <GroupGame room={room} me={user.id} onLeave={leave} />
      )}
      {backModal}
    </>
  );
}
