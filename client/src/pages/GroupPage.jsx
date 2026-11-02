import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ROOM_CODE, ROOM_DEFAULTS } from '@fastfour/shared';
import { getRoomPreview } from '../api/roomApi.js';
import Button from '../components/common/Button.jsx';
import Icon from '../components/common/Icon.jsx';
import Modal from '../components/common/Modal.jsx';
import SegmentedControl from '../components/common/SegmentedControl.jsx';
import TopBar from '../components/common/TopBar.jsx';
import CodeInput from '../components/group/CodeInput.jsx';
import ConnectionBanner from '../components/group/ConnectionBanner.jsx';
import RoomPreviewCard from '../components/group/RoomPreviewCard.jsx';
import SettingsFields from '../components/group/SettingsFields.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { S } from '../utils/strings.js';

const SAME = [
  { icon: 'timer', color: 'var(--ff-name)', text: S.group.sameTime },
  { icon: 'flag', color: 'var(--ff-red)', text: S.group.sameChallenges },
  { icon: 'bolt', color: 'var(--ff-animal)', text: S.group.sameBonus },
];

const JOIN_MESSAGES = {
  ROOM_FULL: S.group.full,
  ROOM_LOCKED: S.group.locked,
  FORBIDDEN: S.group.forbidden,
};

/** Create a room or join one with its code. */
export default function GroupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { room, createRoom, joinRoom } = useRealtime();
  const [tab, setTab] = useState(params.get('tab') === 'join' ? 'join' : 'create');
  const [settings, setSettings] = useState({ ...ROOM_DEFAULTS });
  const [code, setCode] = useState('');
  const [found, setFound] = useState({ code: '', preview: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const ready = code.length === ROOM_CODE.LENGTH;
  const preview = ready && found.code === code ? found.preview : null;

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    getRoomPreview(code)
      .then((p) => live && setFound({ code, preview: p }))
      .catch(() => live && setFound({ code, preview: null }));
    return () => {
      live = false;
    };
  }, [code, ready]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const newCode = await createRoom(settings);
      navigate(`/room/${newCode}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setError('');
    try {
      const joined = await joinRoom(code);
      navigate(`/room/${joined}`);
    } catch (err) {
      if (err.code === 'ROOM_NOT_FOUND') setNotFound(true);
      else setError(JOIN_MESSAGES[err.code] ?? err.message);
      setBusy(false);
    }
  }

  return (
    <main className="ff-page ff-page--narrow ff-group">
      <ConnectionBanner />
      <TopBar title={S.group.title} to="/home" />
      {room && (
        <div className="ff-notice ff-group__inroom" role="status">
          <span>{S.group.inRoom(room.code)}</span>
          <Link className="ff-link" to={`/room/${room.code}`}>
            {S.group.backToRoom}
          </Link>
        </div>
      )}
      <SegmentedControl
        label={S.group.title}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setError('');
        }}
        options={[
          { value: 'create', label: S.group.create },
          { value: 'join', label: S.group.join },
        ]}
      />

      {tab === 'create' ? (
        <>
          <SettingsFields settings={settings} onChange={setSettings} />
          <h2 className="ff-heading ff-group__same">{S.group.sameTitle}</h2>
          <ul className="ff-same">
            {SAME.map((row) => (
              <li key={row.text}>
                <span className="ff-same__icon" style={{ background: row.color }}>
                  <Icon name={row.icon} size={20} />
                </span>
                {row.text}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h2 className="ff-heading ff-group__q">{S.group.enterCode}</h2>
          <p className="ff-muted ff-group__sub">{S.group.enterCodeSub}</p>
          <CodeInput value={code} onChange={setCode} autoFocus />
          {preview && <RoomPreviewCard preview={preview} />}
        </>
      )}

      <div className="ff-spacer ff-grow" />
      {error && (
        <div className="ff-alert" role="alert">
          {error}
        </div>
      )}
      {tab === 'create' ? (
        <Button variant="red" onClick={create} disabled={busy}>
          {busy ? S.group.creating : S.group.create}
        </Button>
      ) : (
        <Button variant="red" onClick={join} disabled={!ready || busy}>
          {busy ? S.group.joining : S.group.join}
        </Button>
      )}

      {notFound && (
        <Modal
          title={S.group.notFoundTitle}
          icon={<Icon name="warn" size={34} />}
          tone="warning"
          onClose={() => setNotFound(false)}
        >
          <p className="ff-muted ff-modal__body">{S.group.notFoundBody}</p>
          <Button onClick={() => setNotFound(false)} data-autofocus>
            {S.group.tryAgain}
          </Button>
        </Modal>
      )}
    </main>
  );
}
