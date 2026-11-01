import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, formatCheck, normalizeAnswer } from '@fastfour/shared';
import { useCountdown } from '../../hooks/useCountdown.js';
import { S } from '../../utils/strings.js';
import BoardLogo from '../common/BoardLogo.jsx';
import Button from '../common/Button.jsx';
import CategoryTile, { categoryLabel } from '../common/CategoryTile.jsx';
import Icon from '../common/Icon.jsx';
import Modal from '../common/Modal.jsx';
import GameHeader from './GameHeader.jsx';

const clock = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const isGood = (value, letter, category) =>
  formatCheck(normalizeAnswer(value), letter, category).result === 'ok';

/**
 * The writing screen: four answers against the clock. At zero the answers are sent by themselves.
 * `locked` is true while the answers are on their way to the server.
 */
export default function WritingView({
  round,
  rounds,
  roundSeconds,
  score,
  answers,
  onChange,
  onSubmit,
  onLeave,
  locked,
  error,
}) {
  const left = useCountdown(round.endsAt);
  const sent = useRef(false);
  const [timeUp, setTimeUp] = useState(false);
  const firstInput = useRef(null);
  const allGood = CATEGORIES.every((c) => isGood(answers[c], round.letter, c));

  useEffect(() => {
    firstInput.current?.focus();
  }, []);

  useEffect(() => {
    if (left === 0 && !sent.current) {
      sent.current = true;
      setTimeUp(true);
      onSubmit();
    }
  }, [left, onSubmit]);

  useEffect(() => {
    if (error) sent.current = false;
  }, [error]);

  const secondsLeft = Math.ceil(left / 1000);
  const announce = [30, 10, 5].includes(secondsLeft) ? S.single.timerAnnounce(secondsLeft) : '';

  const press = () => {
    if (allGood && !locked && !sent.current) {
      sent.current = true;
      onSubmit();
    }
  };

  const onKeyDown = (e, i) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (i < CATEGORIES.length - 1) {
      e.currentTarget.closest('form').elements[i + 1]?.focus();
    } else {
      press();
    }
  };

  return (
    <main className="ff-page ff-page--wide ff-write">
      <GameHeader
        title={S.single.roundOf(round.index + 1, rounds)}
        onLeave={onLeave}
        score={score}
      />
      <div className="ff-write__grid">
        <div className="ff-write__timer">
          <BoardLogo size={96} letter={round.letter} />
          <div className="ff-write__clock">
            <div className="ff-write__time" data-testid="clock">
              {clock(left)}
            </div>
            <div className="ff-write__sub">{S.single.secondsLeft}</div>
          </div>
          <div
            className="ff-progress"
            role="progressbar"
            aria-label={S.single.secondsLeft}
            aria-valuemin={0}
            aria-valuemax={roundSeconds}
            aria-valuenow={secondsLeft}
          >
            <div
              className="ff-progress__fill"
              style={{ width: `${Math.min(100, (left / (roundSeconds * 1000)) * 100)}%` }}
            />
          </div>
        </div>
        <form
          className="ff-write__form"
          onSubmit={(e) => {
            e.preventDefault();
            press();
          }}
        >
          {CATEGORIES.map((c, i) => {
            const good = isGood(answers[c], round.letter, c);
            return (
              <label key={c} className={`ff-answer ff-answer--${c}`}>
                <CategoryTile category={c} size={44} />
                <span className="ff-answer__body">
                  <span className="ff-answer__label">{categoryLabel(c)}</span>
                  <input
                    ref={i === 0 ? firstInput : undefined}
                    className="ff-answer__input"
                    type="text"
                    name={c}
                    value={answers[c]}
                    maxLength={30}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                    readOnly={locked}
                    aria-label={categoryLabel(c)}
                    onChange={(e) => onChange(c, e.target.value)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                  />
                </span>
                <span className={`ff-answer__check${good ? ' is-on' : ''}`} aria-hidden="true">
                  {good && <Icon name="check" size={16} />}
                </span>
              </label>
            );
          })}
          <p className="ff-write__hint">{S.single.mustStart(round.letter)}</p>
          {error && (
            <div className="ff-alert" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" disabled={!allGood || locked}>
            <span className="ff-btn__icon">
              <Icon name="check" size={20} />
            </span>
            {S.single.done}
          </Button>
        </form>
      </div>
      <div className="ff-sr" role="status" aria-live="polite">
        {announce}
      </div>
      {timeUp && !error && (
        <Modal title={S.single.timeUpTitle} icon={<Icon name="timer" size={34} />}>
          <p className="ff-muted ff-modal__body">{S.single.timeUpBody}</p>
          <div className="ff-dots ff-dots--color" aria-hidden="true">
            <span /> <span /> <span /> <span />
          </div>
        </Modal>
      )}
    </main>
  );
}
