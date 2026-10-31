import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AVATAR_COLORS, signupSchema } from '@fastfour/shared';
import { readApiError } from '../api/axiosClient.js';
import AvatarPicker from '../components/common/AvatarPicker.jsx';
import Button from '../components/common/Button.jsx';
import PasswordStrength from '../components/common/PasswordStrength.jsx';
import SegmentedControl from '../components/common/SegmentedControl.jsx';
import TextField from '../components/common/TextField.jsx';
import TopBar from '../components/common/TopBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { issuesToFields } from '../utils/formErrors.js';
import { S } from '../utils/strings.js';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [mode, setMode] = useState('email');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const clear = (key) => setErrors((e) => ({ ...e, [key]: undefined }));

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const payload = {
      nickname,
      [mode]: contact,
      password,
      avatarColor,
      ageConfirmed: agree,
      termsAccepted: agree,
    };
    const parsed = signupSchema.safeParse(payload);
    const found = parsed.success ? {} : issuesToFields(parsed.error);
    if (!contact.trim()) found[mode] = mode === 'email' ? S.signup.needEmail : S.signup.needPhone;
    if (!agree) found.agree = S.signup.needAgree;
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await signup(parsed.data);
      navigate('/home', { replace: true });
    } catch (err) {
      const e = readApiError(err, S.errors.network, S.errors.generic);
      if (Object.keys(e.fields).length) setErrors(e.fields);
      else setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const contactField =
    mode === 'email'
      ? {
          icon: 'mail',
          type: 'email',
          autoComplete: 'email',
          placeholder: S.signup.emailPlaceholder,
          inputMode: 'email',
        }
      : {
          icon: 'phone',
          type: 'tel',
          autoComplete: 'tel',
          placeholder: S.signup.phonePlaceholder,
          inputMode: 'tel',
          help: S.signup.phoneHelp,
        };

  return (
    <main className="ff-page">
      <TopBar title={S.signup.title} to="/" />
      <form
        onSubmit={onSubmit}
        noValidate
        className="ff-grow"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {formError && (
          <p className="ff-alert" role="alert">
            {formError}
          </p>
        )}
        <TextField
          label={S.signup.nickname}
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            clear('nickname');
          }}
          error={errors.nickname}
          help={S.signup.nicknameHelp}
          autoComplete="nickname"
          autoCapitalize="words"
          maxLength={20}
        />
        <span className="ff-label">{S.signup.signUpWith}</span>
        <SegmentedControl
          label={S.signup.signUpWith}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setContact('');
            setErrors((e) => ({ ...e, email: undefined, phone: undefined }));
          }}
          options={[
            { value: 'email', label: S.signup.email },
            { value: 'phone', label: S.signup.phone },
          ]}
        />
        <TextField
          aria-label={mode === 'email' ? S.signup.email : S.signup.phone}
          value={contact}
          onChange={(e) => {
            setContact(e.target.value);
            clear(mode);
          }}
          error={errors[mode]}
          {...contactField}
        />
        <TextField
          label={S.signup.password}
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clear('password');
          }}
          error={errors.password}
          autoComplete="new-password"
        />
        <PasswordStrength password={password} />
        <div style={{ marginTop: 16 }}>
          <AvatarPicker
            label={S.signup.avatar}
            value={avatarColor}
            onChange={setAvatarColor}
            initial={nickname.trim().slice(0, 1)}
          />
        </div>
        <label className="ff-check">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => {
              setAgree(e.target.checked);
              clear('agree');
            }}
            aria-describedby={errors.agree ? 'agree-error' : undefined}
          />
          <span>
            {S.signup.agree}{' '}
            <Link className="ff-link" to="/terms">
              Terms
            </Link>{' '}
            and{' '}
            <Link className="ff-link" to="/privacy">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.agree && (
          <p className="ff-error" id="agree-error" role="alert">
            {errors.agree}
          </p>
        )}
        <div className="ff-grow" style={{ minHeight: 16 }} />
        <Button type="submit" disabled={busy}>
          {busy ? S.signup.submitting : S.signup.submit}
        </Button>
      </form>
    </main>
  );
}
