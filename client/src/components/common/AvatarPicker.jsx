import { AVATAR_COLORS } from '@fastfour/shared';
import { avatarTextColor } from '../../utils/avatar.js';

/** Radio group of colour swatches. The selected one shows the first letter of the nickname. */
export default function AvatarPicker({ label, value, onChange, initial }) {
  return (
    <div className="ff-field" role="radiogroup" aria-label={label}>
      <span className="ff-label">{label}</span>
      <div className="ff-swatches">
        {AVATAR_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value === color}
            aria-label={`Colour ${index + 1}`}
            className="ff-swatch"
            style={{ background: color, color: avatarTextColor(color) }}
            onClick={() => onChange(color)}
          >
            {value === color ? (initial || '?').toUpperCase() : null}
          </button>
        ))}
      </div>
    </div>
  );
}
