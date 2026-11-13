import { useState } from 'react';
import { useRealtime } from '../../../context/RealtimeContext.jsx';
import { S } from '../../../utils/strings.js';
import Button from '../../common/Button.jsx';
import Icon from '../../common/Icon.jsx';
import Modal from '../../common/Modal.jsx';
import ConnectionBanner from '../ConnectionBanner.jsx';
import GroupGameOver from './GroupGameOver.jsx';
import GroupResults from './GroupResults.jsx';
import GroupReview from './GroupReview.jsx';
import GroupToss from './GroupToss.jsx';
import GroupWriting from './GroupWriting.jsx';

/** Chooses the screen for the room's current phase and asks before the player leaves a game. */
export default function GroupGame({ room, me, onLeave }) {
  const { skipReview, playAgain } = useRealtime();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const isHost = room.hostId === me;
  const { phase } = room;

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } catch {
      // The room state that follows (or the next click) shows the real situation.
    } finally {
      setBusy(false);
    }
  };
  const askLeave = () => (phase === 'GAME_OVER' ? onLeave() : setConfirming(true));

  let screen;
  if (phase === 'WRITING' || phase === 'COLLECTING' || phase === 'JUDGING') {
    if (room.round?.letter) {
      screen = <GroupWriting room={room} me={me} onLeave={askLeave} />;
    }
  } else if (phase === 'REVIEW' && room.review) {
    screen = (
      <GroupReview
        room={room}
        me={me}
        isHost={isHost}
        busy={busy}
        onSkip={() => run(skipReview)}
        onLeave={askLeave}
      />
    );
  } else if (phase === 'ROUND_RESULT' && room.results) {
    screen = <GroupResults room={room} me={me} onLeave={askLeave} />;
  } else if (phase === 'GAME_OVER' && room.gameOver) {
    screen = (
      <GroupGameOver
        room={room}
        me={me}
        isHost={isHost}
        busy={busy}
        onPlayAgain={() => run(playAgain)}
        onLeave={onLeave}
      />
    );
  }
  screen ??= <GroupToss room={room} onLeave={askLeave} />;

  return (
    <>
      <ConnectionBanner />
      {screen}
      {confirming && (
        <Modal title={S.game.leaveTitle} icon={<Icon name="logout" size={32} />} tone="warning">
          <p className="ff-muted ff-modal__body">{S.game.leaveBody}</p>
          <div className="ff-modal__actions">
            <Button variant="secondary" onClick={() => setConfirming(false)} data-autofocus>
              {S.game.stay}
            </Button>
            <Button variant="red" onClick={onLeave}>
              {S.game.leave}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
