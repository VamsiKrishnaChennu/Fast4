import { useState } from 'react';
import { LIMITS } from '@fastfour/shared';
import { useRealtime } from '../../context/RealtimeContext.jsx';
import { S } from '../../utils/strings.js';
import Avatar from '../common/Avatar.jsx';
import Button from '../common/Button.jsx';
import Icon from '../common/Icon.jsx';
import Modal from '../common/Modal.jsx';
import ConnectionBanner from './ConnectionBanner.jsx';
import ScoringSheet from './ScoringSheet.jsx';
import SettingsFields from './SettingsFields.jsx';

function CodeTiles({ code }) {
  return (
    <div className="ff-tiles" role="img" aria-label={`${S.lobby.roomCode} ${[...code].join(' ')}`}>
      {[...code].map((c, i) => (
        <span key={i} className="ff-tiles__tile" aria-hidden="true">
          {c}
        </span>
      ))}
    </div>
  );
}

function PlayerAvatar({ player, size }) {
  return (
    <span className="ff-presence">
      <Avatar nickname={player.nickname} color={player.avatarColor} size={size} />
      <span className={`ff-presence__dot${player.connected ? ' is-on' : ''}`} aria-hidden="true" />
    </span>
  );
}

/** The lobby: room code, players, settings and the start button (host) or waiting bar (players). */
export default function Lobby({ room, me, onLeave, busy }) {
  const { updateSettings, kick, startGame } = useRealtime();
  const isHost = room.hostId === me;
  const host = room.players.find((p) => p.userId === room.hostId);
  const present = room.players.filter((p) => !p.left);
  const connected = present.filter((p) => p.connected).length;
  const canStart = connected >= LIMITS.PLAYERS_MIN;

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState('');
  const [removing, setRemoving] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [working, setWorking] = useState(false);

  const shareUrl = `${window.location.origin}/room/${room.code}`;

  async function copy(text, note) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(note);
    } catch {
      setMessage('');
      setError(S.errors.generic);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: S.appName,
          text: S.lobby.shareText(host?.nickname ?? ''),
          url: shareUrl,
        });
      } catch {
        // The player closed the share sheet; nothing to report.
      }
      return;
    }
    await copy(shareUrl, S.lobby.linkCopied);
  }

  async function start() {
    setWorking(true);
    setError('');
    try {
      await startGame();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function saveSettings() {
    setWorking(true);
    setEditError('');
    try {
      await updateSettings(editing);
      setEditing(null);
    } catch (err) {
      setEditError(err.details?.[0]?.message ?? err.message);
    } finally {
      setWorking(false);
    }
  }

  async function confirmRemove() {
    setWorking(true);
    try {
      await kick(removing.userId);
      setRemoving(null);
    } catch (err) {
      setError(err.message);
      setRemoving(null);
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="ff-page ff-page--wide ff-lobby">
      <ConnectionBanner />
      <header className="ff-lobby__head">
        <button
          type="button"
          className="ff-iconbtn"
          aria-label={S.lobby.leaveRoom}
          onClick={onLeave}
        >
          <Icon name="back" />
        </button>
        <h1 className="ff-lobby__title">{S.lobby.title}</h1>
        <button
          type="button"
          className="ff-iconbtn"
          aria-label={S.lobby.scoringButton}
          onClick={() => setScoring(true)}
        >
          <Icon name="list" />
        </button>
      </header>

      <div className="ff-lobby__grid">
        <section className="ff-card ff-codecard" aria-label={S.lobby.roomCode}>
          <div className="ff-codecard__top">
            <span>{S.lobby.roomCode}</span>
            <span>{isHost ? S.lobby.shareIt : S.lobby.hostedBy(host?.nickname ?? '')}</span>
          </div>
          <CodeTiles code={room.code} />
          {isHost && (
            <div className="ff-codecard__actions">
              <button
                type="button"
                className="ff-pillbtn"
                onClick={() => copy(room.code, S.lobby.copied)}
              >
                <Icon name="copy" size={20} />
                {S.lobby.copyCode}
              </button>
              <button type="button" className="ff-pillbtn" onClick={share}>
                <Icon name="share" size={20} />
                {S.lobby.shareLink}
              </button>
            </div>
          )}
          <div className="ff-sr" role="status">
            {message}
          </div>
        </section>

        <section className="ff-lobby__players" aria-labelledby="ff-players-title">
          <div className="ff-lobby__playershead">
            <h2 id="ff-players-title">{S.lobby.players}</h2>
            <span className="ff-muted" data-testid="player-count">
              {S.lobby.count(present.length, room.settings.maxPlayers)}
            </span>
          </div>
          {isHost ? (
            <ul className="ff-plist">
              {present.map((p) => (
                <li key={p.userId} className="ff-plist__row" data-testid="player-row">
                  <PlayerAvatar player={p} size={48} />
                  <span className="ff-plist__who">
                    <span className="ff-plist__name">
                      {p.nickname}
                      {p.userId === me && <span className="ff-muted"> {S.lobby.you}</span>}
                    </span>
                    {!p.connected && <span className="ff-plist__sub">{S.lobby.reconnecting}</span>}
                  </span>
                  {p.userId === room.hostId ? (
                    <span className="ff-badge ff-badge--host">
                      <Icon name="crown" size={14} />
                      {S.lobby.host}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ff-iconbtn ff-iconbtn--plain"
                      aria-label={S.lobby.playerMenu(p.nickname)}
                      onClick={() => setRemoving(p)}
                    >
                      <Icon name="dots" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="ff-avatarrow">
              {present.map((p) => (
                <li key={p.userId} data-testid="player-row">
                  <PlayerAvatar player={p} size={56} />
                  <span className="ff-avatarrow__name">
                    {p.userId === me ? S.lobby.youShort : p.nickname}
                  </span>
                  {!p.connected && <span className="ff-plist__sub">{S.lobby.reconnecting}</span>}
                </li>
              ))}
            </ul>
          )}

          {isHost ? (
            <div className="ff-settingsrow">
              <span>{S.lobby.settings(room.settings.rounds, room.settings.maxPlayers)}</span>
              <button
                type="button"
                className="ff-linkbtn"
                onClick={() => {
                  setEditError('');
                  setEditing({ ...room.settings });
                }}
              >
                {S.lobby.edit}
              </button>
            </div>
          ) : (
            <p className="ff-muted ff-settingsline">
              {S.lobby.settings(room.settings.rounds, room.settings.maxPlayers)}
            </p>
          )}
        </section>

        <footer className="ff-lobby__footer">
          {error && (
            <div className="ff-alert" role="alert">
              {error}
            </div>
          )}
          {isHost ? (
            <>
              <Button variant="red" onClick={start} disabled={!canStart || working || busy}>
                {working ? S.lobby.starting : S.lobby.start}
              </Button>
              {!canStart && <p className="ff-muted ff-center ff-lobby__hint">{S.lobby.needTwo}</p>}
            </>
          ) : (
            <div className="ff-waiting">
              <div>
                <strong>{S.lobby.waitingFor(host?.nickname ?? '')}</strong>
                <span className="ff-muted">{S.lobby.hostStarts}</span>
              </div>
              <Button variant="secondary" onClick={onLeave} disabled={busy}>
                {busy ? S.lobby.leaving : S.lobby.leave}
              </Button>
            </div>
          )}
        </footer>
      </div>

      {scoring && <ScoringSheet onClose={() => setScoring(false)} />}

      {editing && (
        <Modal
          title={S.lobby.editTitle}
          onClose={() => setEditing(null)}
          icon={<Icon name="list" size={30} />}
        >
          <SettingsFields
            settings={editing}
            onChange={setEditing}
            minPlayers={Math.max(LIMITS.PLAYERS_MIN, present.length)}
            playersError={editError && /player/i.test(editError) ? editError : undefined}
          />
          {editError && !/player/i.test(editError) && (
            <div className="ff-alert" role="alert">
              {editError}
            </div>
          )}
          <div className="ff-modal__actions">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {S.lobby.cancel}
            </Button>
            <Button onClick={saveSettings} disabled={working}>
              {working ? S.lobby.saving : S.lobby.save}
            </Button>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal title={S.lobby.removeTitle(removing.nickname)} onClose={() => setRemoving(null)}>
          <p className="ff-muted ff-modal__body">{S.lobby.removeBody}</p>
          <div className="ff-modal__actions">
            <Button variant="secondary" onClick={() => setRemoving(null)} data-autofocus>
              {S.lobby.cancel}
            </Button>
            <Button variant="red" onClick={confirmRemove} disabled={working}>
              {S.lobby.remove}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}
