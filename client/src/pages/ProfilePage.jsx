import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readApiError } from '../api/axiosClient.js';
import * as socialApi from '../api/socialApi.js';
import Avatar from '../components/common/Avatar.jsx';
import AvatarPicker from '../components/common/AvatarPicker.jsx';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import Modal from '../components/common/Modal.jsx';
import TextField from '../components/common/TextField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { S } from '../utils/strings.js';

function EditProfile({ onClose }) {
  const { user, updateProfile } = useAuth();
  const [nickname, setNickname] = useState(user.nickname);
  const [color, setColor] = useState(user.avatarColor);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const changes = {};
    if (nickname.trim() !== user.nickname) changes.nickname = nickname.trim();
    if (color !== user.avatarColor) changes.avatarColor = color;
    try {
      if (Object.keys(changes).length > 0) await updateProfile(changes);
      onClose(true);
    } catch (err) {
      const apiError = readApiError(err, S.errors.network, S.profile.saveError);
      setError(apiError.fields?.nickname ?? apiError.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={S.profile.editProfile} onClose={() => onClose(false)}>
      <form onSubmit={save} className="ff-editprofile">
        <TextField
          label={S.profile.nickname}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          autoComplete="off"
          data-autofocus
        />
        <AvatarPicker
          label={S.profile.avatar}
          value={color}
          onChange={setColor}
          initial={nickname.trim()[0] ?? user.nickname[0]}
        />
        {error && (
          <div className="ff-alert" role="alert">
            {error}
          </div>
        )}
        <div className="ff-modal__actions">
          <Button variant="secondary" onClick={() => onClose(false)}>
            {S.profile.cancel}
          </Button>
          <Button type="submit" disabled={busy || nickname.trim().length < 3}>
            {S.profile.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GameRow({ game }) {
  const date = new Date(game.endedAt).toLocaleDateString('en', { day: 'numeric', month: 'short' });
  const title =
    game.mode === 'group'
      ? S.profile.groupGame(game.players, game.rounds)
      : S.profile.solo(game.rounds);
  return (
    <li className="ff-game" data-testid="game-row">
      <span className="ff-game__main">
        <strong>{title}</strong>
        <span className="ff-muted">
          {date}
          {game.rank ? ` · ${S.profile.place(game.rank)}` : ''}
        </span>
      </span>
      <strong className="ff-game__score">{S.profile.points(game.score)}</strong>
    </li>
  );
}

/** Identity, stats, recent games, profile editing, blocked players, dark mode and log out. */
export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { blocked } = useRealtime();
  const meta = useMeta();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [games, setGames] = useState({ list: [], next: null, error: '', loaded: false });
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    socialApi
      .gameHistory()
      .then(
        (res) =>
          live && setGames({ list: res.games, next: res.nextCursor, error: '', loaded: true }),
      )
      .catch(
        (err) =>
          live &&
          setGames({
            list: [],
            next: null,
            error: readApiError(err, S.errors.network, S.profile.historyError).message,
            loaded: true,
          }),
      );
    return () => {
      live = false;
    };
  }, []);

  async function loadMore() {
    setMore(true);
    try {
      const res = await socialApi.gameHistory({ cursor: games.next });
      setGames((g) => ({ ...g, list: [...g.list, ...res.games], next: res.nextCursor }));
    } catch (err) {
      setGames((g) => ({
        ...g,
        error: readApiError(err, S.errors.network, S.profile.historyError).message,
      }));
    } finally {
      setMore(false);
    }
  }

  const since = new Date(user.createdAt).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });
  const stats = user.stats ?? {};

  return (
    <main className="ff-page ff-page--nav ff-grid2 ff-profile">
      <h1 className="ff-wordmark ff-g-head" style={{ fontSize: 28 }}>
        {S.profile.title}
      </h1>
      <div className="ff-center ff-g-art" style={{ margin: '16px 0 24px' }}>
        <Avatar nickname={user.nickname} color={user.avatarColor} size={96} />
        <h2 className="ff-title ff-title--sm" style={{ margin: '12px 0 2px' }}>
          {user.nickname}
        </h2>
        <p className="ff-muted" style={{ fontSize: 14, fontWeight: 600 }}>
          {S.profile.since(since)}
        </p>
        <button type="button" className="ff-linkbtn" onClick={() => setEditing(true)}>
          {S.profile.editProfile}
        </button>
        {saved && (
          <p className="ff-chat__notice" role="status">
            {S.profile.saved}
          </p>
        )}
      </div>

      <h3 className="ff-label" style={{ fontSize: 18, fontFamily: 'var(--ff-font-heading)' }}>
        {S.profile.statsTitle}
      </h3>
      <dl className="ff-statgrid" data-testid="stats">
        {Object.entries(S.profile.stats).map(([key, label]) => (
          <div key={key} className="ff-card ff-stat">
            <dd>{stats[key] ?? 0}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>

      <h3 className="ff-label" style={{ fontSize: 18, fontFamily: 'var(--ff-font-heading)' }}>
        {S.profile.recent}
      </h3>
      <div className="ff-card ff-games">
        {games.error && (
          <div className="ff-alert" role="alert">
            {games.error}
          </div>
        )}
        {games.loaded && !games.error && games.list.length === 0 && (
          <p className="ff-muted ff-center">{S.profile.noGames}</p>
        )}
        {games.list.length > 0 && (
          <ul className="ff-games__list" aria-label={S.profile.recent}>
            {games.list.map((g) => (
              <GameRow key={g.id} game={g} />
            ))}
            {games.next && (
              <li>
                <button type="button" className="ff-linkbtn" onClick={loadMore} disabled={more}>
                  {S.profile.more}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      <h3 className="ff-label" style={{ fontSize: 18, fontFamily: 'var(--ff-font-heading)' }}>
        {S.profile.settings}
      </h3>
      <div className="ff-card ff-rows">
        <div className="ff-row">
          <span className="ff-row__icon">
            <Icon name="moon" size={22} />
          </span>
          <span className="ff-row__label" id="dark-label">
            {S.profile.darkMode}
          </span>
          <span className="ff-switch-hit">
            <button
              type="button"
              role="switch"
              className="ff-switch"
              aria-checked={theme === 'dark'}
              aria-labelledby="dark-label"
              onClick={toggle}
            />
          </span>
        </div>
        <Link to="/profile/blocked" className="ff-row">
          <span className="ff-row__icon">
            <Icon name="lock" size={22} />
          </span>
          <span className="ff-row__label">{S.profile.blockedPlayers}</span>
          <span className="ff-muted">{blocked.length}</span>
        </Link>
        <button type="button" className="ff-row" onClick={logout}>
          <span className="ff-row__icon">
            <Icon name="logout" size={22} />
          </span>
          <span className="ff-row__label">{S.profile.logout}</span>
        </button>
      </div>
      <p className="ff-center ff-muted" style={{ fontSize: 13, marginTop: 12 }}>
        {S.profile.version(meta?.appVersion ?? '')}
      </p>
      {editing && (
        <EditProfile
          onClose={(didSave) => {
            setEditing(false);
            if (didSave) {
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
            }
          }}
        />
      )}
    </main>
  );
}
