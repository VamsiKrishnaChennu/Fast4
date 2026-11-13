import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import DeleteAccountModal from '../components/common/DeleteAccountModal.jsx';
import LegalLayout from '../components/common/LegalLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { S } from '../utils/strings.js';

/**
 * Public page, also linked from the Play Store listing: explains deletion and lets a signed-in
 * player do it. Anyone who cannot log in is pointed to the support email.
 */
export default function DeleteAccountPage() {
  const t = S.deleteAccount;
  const { status, user } = useAuth();
  const meta = useMeta();
  const location = useLocation();
  const [asking, setAsking] = useState(false);
  const email = meta?.supportEmail ?? S.legal.supportFallback;

  if (location.state?.deleted && status !== 'authed') {
    return (
      <LegalLayout title={t.doneTitle} testId="deleted">
        <p>{t.doneBody}</p>
        <p>
          <Button to="/">{t.home}</Button>
        </p>
      </LegalLayout>
    );
  }

  return (
    <LegalLayout title={t.title} testId="delete-account">
      <p>{t.intro}</p>
      <h2>{t.deletedTitle}</h2>
      <ul>
        {t.deleted.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h2>{t.keptTitle}</h2>
      <ul>
        {t.kept.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {status === 'authed' ? (
        user.role === 'admin' ? (
          <p className="ff-muted">{t.adminNote}</p>
        ) : (
          <p>
            <Button variant="red" onClick={() => setAsking(true)}>
              {t.button}
            </Button>
          </p>
        )
      ) : (
        <>
          <p>{t.loginFirst}</p>
          <p>
            <Button to="/login" state={{ from: '/delete-account' }}>
              {t.login}
            </Button>
          </p>
          <p className="ff-muted">{t.cannotLogin(email)}</p>
        </>
      )}
      <p className="ff-muted">
        {t.legalLinks}{' '}
        <Link className="ff-link" to="/privacy">
          {S.legal.privacy}
        </Link>{' '}
        &middot;{' '}
        <Link className="ff-link" to="/terms">
          {S.legal.terms}
        </Link>
      </p>
      {asking && <DeleteAccountModal onClose={() => setAsking(false)} />}
    </LegalLayout>
  );
}
