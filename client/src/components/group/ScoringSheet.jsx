import { useEffect, useRef } from 'react';
import { S } from '../../utils/strings.js';
import Button from '../common/Button.jsx';
import Icon from '../common/Icon.jsx';

const ROWS = [
  { cls: 'unique', badge: S.lobby.unique, title: S.lobby.uniqueTitle, sub: S.lobby.uniqueSub },
  { cls: 'shared', badge: S.lobby.shared, title: S.lobby.sharedTitle, sub: S.lobby.sharedSub },
  { cls: 'invalid', badge: S.lobby.invalid, title: S.lobby.invalidTitle, sub: S.lobby.invalidSub },
  {
    cls: 'bonus',
    badge: S.lobby.bonus,
    title: S.lobby.bonusTitle,
    sub: S.lobby.bonusSub,
    icon: 'bolt',
  },
  {
    cls: 'challenge',
    badge: S.lobby.challenges,
    title: S.lobby.challengesTitle,
    sub: S.lobby.challengesSub,
    icon: 'flag',
  },
];

/** The "How scoring works" bottom sheet. */
export default function ScoringSheet({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="ff-overlay ff-overlay--sheet" onClick={onClose}>
      <div
        className="ff-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ff-sheet-title"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ff-sheet__grip" aria-hidden="true" />
        <h2 className="ff-sheet__title" id="ff-sheet-title">
          {S.lobby.scoringTitle}
        </h2>
        <ul className="ff-sheet__list">
          {ROWS.map((r) => (
            <li key={r.cls} className="ff-sheet__row">
              <span className={`ff-badge ff-badge--${r.cls}`}>
                {r.icon && <Icon name={r.icon} size={14} />}
                {r.badge}
              </span>
              <span>
                <strong>{r.title}</strong>
                <span className="ff-sheet__sub">{r.sub}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="ff-muted ff-sheet__ties">{S.lobby.ties}</p>
        <Button onClick={onClose}>{S.lobby.gotIt}</Button>
      </div>
    </div>
  );
}
