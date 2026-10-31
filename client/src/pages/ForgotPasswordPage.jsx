import { useState } from 'react';
import { forgotSchema } from '@fastfour/shared';
import { forgot } from '../api/authApi.js';
import { readApiError } from '../api/axiosClient.js';
import BoardLogo from '../components/common/BoardLogo.jsx';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import TextField from '../components/common/TextField.jsx';
import TopBar from '../components/common/TopBar.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { issuesToFields } from '../utils/formErrors.js';
import { S } from '../utils/strings.js';

export default function ForgotPasswordPage() {
  const meta = useMeta();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const support = meta?.supportEmail;

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(issuesToFields(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await forgot(parsed.data.email);
      setSentTo(parsed.data.email);
    } catch (err) {
      setFormError(readApiError(err, S.errors.network, S.errors.generic).message);
    } finally {
      setBusy(false);
    }
  }

  const supportLine = support && (
    <p className="ff-muted ff-center" style={{ fontWeight: 600 }}>
      {S.forgot.phoneOnly}{' '}
      <a className="ff-link" href={`mailto:${support}`}>
        {support}
      </a>{' '}
      {S.forgot.phoneOnlyEnd}
    </p>
  );

  if (sentTo) {
    return (
      <main className="ff-page">
        <TopBar title={S.forgot.title} to="/login" />
        <div className="ff-grow ff-center" style={{ paddingTop: 32 }}>
          <div className="ff-hero" style={{ color: 'var(--ff-link)' }}>
            <Icon name="inbox" size={72} />
          </div>
          <h2 className="ff-title">{S.forgot.sentTitle}</h2>
          <p className="ff-muted" role="status">
            {S.forgot.sentBody(sentTo)}
          </p>
          {supportLine}
        </div>
        <Button to="/login">{S.forgot.back}</Button>
      </main>
    );
  }

  return (
    <main className="ff-page">
      <TopBar title={S.forgot.title} to="/login" />
      <form
        onSubmit={onSubmit}
        noValidate
        className="ff-grow"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="ff-hero" style={{ marginTop: 0 }}>
          <BoardLogo size={96} />
        </div>
        <h2 className="ff-title ff-center" style={{ fontSize: 28, marginTop: 0 }}>
          {S.forgot.heading}
        </h2>
        <p className="ff-muted ff-center" style={{ marginBottom: 24 }}>
          {S.forgot.sub}
        </p>
        {formError && (
          <p className="ff-alert" role="alert">
            {formError}
          </p>
        )}
        <TextField
          label={S.forgot.email}
          icon="mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
          autoCapitalize="none"
          inputMode="email"
        />
        {supportLine}
        <div className="ff-grow" style={{ minHeight: 16 }} />
        <Button type="submit" disabled={busy}>
          {busy ? S.forgot.submitting : S.forgot.submit}
        </Button>
      </form>
    </main>
  );
}
