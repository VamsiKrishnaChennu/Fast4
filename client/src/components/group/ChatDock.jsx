import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LIMITS } from '@fastfour/shared';
import * as socialApi from '../../api/socialApi.js';
import { readApiError } from '../../api/axiosClient.js';
import { useRealtime } from '../../context/RealtimeContext.jsx';
import { S } from '../../utils/strings.js';
import Avatar from '../common/Avatar.jsx';
import Button from '../common/Button.jsx';
import Icon from '../common/Icon.jsx';
import Modal from '../common/Modal.jsx';

const CHAT_PHASES = ['LOBBY', 'REVIEW', 'ROUND_RESULT', 'GAME_OVER'];

/** Action sheet, block confirmation and report form for one chat message. */
function MessageActions({ message, onClose, onNotice }) {
  const { blockUser } = useRealtime();
  const [step, setStep] = useState('menu');
  const [reason, setReason] = useState('harassment');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function block() {
    setBusy(true);
    setError('');
    try {
      await blockUser(message.userId);
      onClose();
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.blocked.error).message);
      setBusy(false);
    }
  }
  async function report() {
    setBusy(true);
    setError('');
    try {
      await socialApi.sendReport({
        targetUserId: message.userId,
        context: 'chat',
        refId: message.id.startsWith('local-') ? undefined : message.id,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      onNotice(S.chat.reportSent);
      onClose();
    } catch (err) {
      setError(readApiError(err, S.errors.network, S.errors.generic).message);
      setBusy(false);
    }
  }

  if (step === 'block') {
    return (
      <Modal title={S.chat.blockTitle(message.nickname)} onClose={onClose}>
        <p className="ff-muted ff-modal__body">{S.chat.blockBody}</p>
        {error && (
          <div className="ff-alert" role="alert">
            {error}
          </div>
        )}
        <div className="ff-modal__actions">
          <Button variant="secondary" onClick={onClose} data-autofocus>
            {S.chat.cancel}
          </Button>
          <Button variant="red" onClick={block} disabled={busy}>
            {S.chat.blockConfirm}
          </Button>
        </div>
      </Modal>
    );
  }
  if (step === 'report') {
    return (
      <Modal title={S.chat.reportTitle} onClose={onClose}>
        <p className="ff-muted ff-modal__body">{S.chat.reportBody}</p>
        <div className="ff-reasons" role="radiogroup" aria-label={S.chat.reportTitle}>
          {LIMITS.REPORT_REASONS.map((r) => (
            <label key={r} className="ff-reason">
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span>{S.chat.reasons[r]}</span>
            </label>
          ))}
        </div>
        <textarea
          className="ff-input ff-textarea"
          aria-label={S.chat.reportNote}
          placeholder={S.chat.reportNote}
          maxLength={LIMITS.REPORT_DETAILS_MAX}
          rows={2}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
        {error && (
          <div className="ff-alert" role="alert">
            {error}
          </div>
        )}
        <div className="ff-modal__actions">
          <Button variant="secondary" onClick={onClose}>
            {S.chat.cancel}
          </Button>
          <Button variant="red" onClick={report} disabled={busy}>
            {S.chat.reportSend}
          </Button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={S.chat.actionsTitle(message.nickname)} onClose={onClose}>
      <p className="ff-chat__quote">{message.text}</p>
      <div className="ff-modal__actions ff-modal__actions--stack">
        <Button variant="secondary" onClick={() => setStep('report')} data-autofocus>
          {S.chat.report}
        </Button>
        <Button variant="secondary" onClick={() => setStep('block')}>
          {S.chat.block}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {S.chat.cancel}
        </Button>
      </div>
    </Modal>
  );
}

/** The messages, the write box and the Report / Block menu. */
export function ChatPanel({ me, phase }) {
  const { chat, blocked, sendChat } = useRealtime();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const open = CHAT_PHASES.includes(phase);
  const hidden = new Set(blocked.map((b) => b.userId));
  const visible = chat.filter((m) => !hidden.has(m.userId));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  async function submit(e) {
    e.preventDefault();
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || sending) return;
    setSending(true);
    setError('');
    try {
      await sendChat(clean);
      setText('');
    } catch (err) {
      setError(S.chat.errors[err.code] ?? err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="ff-chat" aria-label={S.chat.title}>
      <header className="ff-chat__head">
        <h2>{S.chat.title}</h2>
        <Link to="/terms" className="ff-linkbtn" target="_blank" rel="noreferrer">
          {S.chat.terms}
        </Link>
      </header>
      <ul className="ff-chat__list" ref={listRef} aria-live="polite" data-testid="chat-list">
        {visible.length === 0 && <li className="ff-muted ff-chat__empty">{S.chat.empty}</li>}
        {visible.map((m) => (
          <li key={m.id} className={`ff-chat__msg${m.userId === me ? ' is-me' : ''}`}>
            <Avatar nickname={m.nickname} color={m.avatarColor ?? '#FFC247'} size={32} />
            <span className="ff-chat__body">
              <span className="ff-chat__name">{m.userId === me ? S.chat.you : m.nickname}</span>
              {/* Plain text only: React escapes it, so any HTML shows as typed. */}
              <span className="ff-chat__text">{m.text}</span>
            </span>
            {m.userId !== me && (
              <button
                type="button"
                className="ff-iconbtn ff-iconbtn--plain"
                aria-label={S.chat.messageActions(m.nickname)}
                onClick={() => setActing(m)}
              >
                <Icon name="dots" size={20} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="ff-chat__notice" role="status">
        {notice}
      </p>
      {error && (
        <div className="ff-alert" role="alert">
          {error}
        </div>
      )}
      <form className="ff-chat__form" onSubmit={submit}>
        <input
          className="ff-input"
          aria-label={S.chat.placeholder}
          placeholder={S.chat.placeholder}
          maxLength={LIMITS.CHAT_MAX}
          value={text}
          disabled={!open}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!open || sending || text.trim() === ''}>
          {S.chat.send}
        </Button>
      </form>
      {acting && (
        <MessageActions
          message={acting}
          onClose={() => setActing(null)}
          onNotice={(note) => {
            setNotice(note);
            setTimeout(() => setNotice(''), 4000);
          }}
        />
      )}
    </section>
  );
}

/** A round chat button that opens the chat as a bottom sheet. Hidden while a round is running. */
export default function ChatDock({ me, phase }) {
  const { chat, blocked } = useRealtime();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const hidden = new Set(blocked.map((b) => b.userId));
  const total = chat.filter((m) => !hidden.has(m.userId) && m.userId !== me).length;
  const unread = open ? 0 : Math.max(0, total - seen);

  const openDock = () => setOpen(true);
  const closeDock = () => {
    setSeen(total);
    setOpen(false);
  };

  if (!CHAT_PHASES.includes(phase)) return null;
  return (
    <>
      <button
        type="button"
        className="ff-chatfab"
        aria-label={unread > 0 ? `${S.chat.open}, ${S.chat.unread(unread)}` : S.chat.open}
        onClick={openDock}
      >
        <Icon name="chat" size={26} />
        {unread > 0 && (
          <span className="ff-chatfab__count" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="ff-overlay ff-overlay--sheet" onClick={closeDock}>
          <div
            className="ff-sheet ff-chatsheet"
            role="dialog"
            aria-modal="true"
            aria-label={S.chat.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ff-sheet__grip" />
            <button
              type="button"
              className="ff-iconbtn ff-chatsheet__close"
              aria-label={S.chat.close}
              onClick={closeDock}
            >
              <Icon name="close" />
            </button>
            <ChatPanel me={me} phase={phase} />
          </div>
        </div>
      )}
    </>
  );
}
