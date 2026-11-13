import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readApiError } from '../../api/axiosClient.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { S } from '../../utils/strings.js';
import Button from './Button.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import TextField from './TextField.jsx';

/** Asks for the password, then deletes the account and shows the confirmation page. */
export default function DeleteAccountModal({ onClose }) {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = S.deleteAccount;

  async function submit(event) {
    event.preventDefault();
    if (password === '') {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await deleteAccount(password, () =>
        navigate('/delete-account', { replace: true, state: { deleted: true } }),
      );
    } catch (err) {
      const apiError = readApiError(err, S.errors.network, t.failed);
      setError(apiError.fields?.password ?? apiError.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={t.modalTitle} icon={<Icon name="logout" size={32} />} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="ff-muted ff-modal__body">{t.modalBody}</p>
        <TextField
          label={t.password}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          data-autofocus
        />
        {error && (
          <div className="ff-alert" role="alert">
            {error}
          </div>
        )}
        <div className="ff-modal__actions">
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="red" disabled={busy}>
            {busy ? t.deleting : t.confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
