import { S } from '../../../utils/strings.js';
import Button from '../../common/Button.jsx';
import Icon from '../../common/Icon.jsx';
import Modal from '../../common/Modal.jsx';

/** Asks before a challenge or an appeal is sent, and says how many are left. */
export default function ChallengeConfirm({ pick, left, busy, error, onCancel, onConfirm }) {
  const appeal = pick.type === 'appeal';
  return (
    <Modal
      title={appeal ? S.game.appealTitle : S.game.challengeTitle}
      icon={<Icon name="flag" size={32} />}
      tone="warning"
      onClose={busy ? undefined : onCancel}
    >
      <p className="ff-muted ff-modal__body">
        {appeal ? S.game.appealBody(pick.word, left) : S.game.challengeBody(pick.word, left)}
      </p>
      {error && (
        <p className="ff-field__error" role="alert">
          {error}
        </p>
      )}
      <div className="ff-modal__actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>
          {S.game.cancel}
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {S.game.checkIt}
        </Button>
      </div>
    </Modal>
  );
}
