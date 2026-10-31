import { useId, useState } from 'react';
import Icon from './Icon.jsx';

/**
 * Labelled input with optional leading icon, helper text and error. Password type gets a show toggle.
 */
export default function TextField({ label, error, help, icon, type = 'text', id, ...rest }) {
  const auto = useId();
  const inputId = id ?? auto;
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${inputId}-error` : help ? `${inputId}-help` : undefined;
  return (
    <div className="ff-field">
      {label && (
        <label className="ff-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="ff-inputwrap">
        {icon && (
          <span className="ff-inputwrap__icon">
            <Icon name={icon} size={20} />
          </span>
        )}
        <input
          id={inputId}
          className={`ff-input${icon ? ' ff-input--icon' : ''}${isPassword ? ' ff-input--end' : ''}`}
          type={isPassword && shown ? 'text' : type}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="ff-inputwrap__end"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
          >
            <Icon name={shown ? 'eyeOff' : 'eye'} size={22} />
          </button>
        )}
      </div>
      {error ? (
        <p className="ff-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : (
        help && (
          <p className="ff-help" id={`${inputId}-help`}>
            {help}
          </p>
        )
      )}
    </div>
  );
}
