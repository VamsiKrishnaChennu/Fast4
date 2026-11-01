import { useEffect, useRef } from 'react';

/**
 * A centred dialog over a dimmed page. Escape calls onClose (when given); focus moves into the
 * dialog and returns to where it was when the dialog closes.
 */
export default function Modal({ title, onClose, children, icon, labelledBy = 'ff-modal-title' }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const target = ref.current?.querySelector('[data-autofocus]') ?? ref.current;
    target?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="ff-overlay">
      <div
        className="ff-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={ref}
      >
        {icon && <div className="ff-modal__icon">{icon}</div>}
        <h2 className="ff-modal__title" id={labelledBy}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
