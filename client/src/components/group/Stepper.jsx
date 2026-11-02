import Icon from '../common/Icon.jsx';

/** A row with a title, a hint and minus and plus buttons around the value. */
export default function Stepper({
  id,
  label,
  sub,
  value,
  min,
  max,
  onChange,
  lessLabel,
  moreLabel,
  error,
}) {
  return (
    <div className="ff-stepper" role="group" aria-labelledby={`${id}-label`}>
      <div className="ff-stepper__text">
        <div className="ff-stepper__label" id={`${id}-label`}>
          {label}
        </div>
        <div className="ff-stepper__sub">{sub}</div>
        {error && (
          <div className="ff-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        className="ff-stepper__btn"
        aria-label={`${lessLabel} ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" size={22} />
      </button>
      <output className="ff-stepper__value" aria-live="polite" data-testid={`${id}-value`}>
        {value}
      </output>
      <button
        type="button"
        className="ff-stepper__btn"
        aria-label={`${moreLabel} ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" size={22} />
      </button>
    </div>
  );
}
