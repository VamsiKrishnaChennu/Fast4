import { ROOM_CODE, normalizeRoomCode } from '@fastfour/shared';
import { S } from '../../utils/strings.js';

/** Keeps only the characters a room code can have, upper-cased, at most six. */
export const cleanCode = (text) =>
  [...normalizeRoomCode(text)]
    .filter((c) => ROOM_CODE.ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE.LENGTH);

/**
 * Six boxes for the room code. One real text field sits on top, so typing, pasting and the
 * phone keyboard all work. Lower case becomes upper case and stray characters are dropped.
 */
export default function CodeInput({ value, onChange, invalid, autoFocus }) {
  const boxes = Array.from({ length: ROOM_CODE.LENGTH }, (_, i) => value[i] ?? '');
  const active = Math.min(value.length, ROOM_CODE.LENGTH - 1);
  return (
    <div className="ff-code">
      <div className="ff-code__boxes" aria-hidden="true">
        {boxes.map((c, i) => (
          <span key={i} className={`ff-code__box${i === active ? ' is-active' : ''}`}>
            {c}
          </span>
        ))}
      </div>
      <input
        className="ff-code__input"
        type="text"
        value={value}
        aria-label={S.group.codeLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={64}
        autoFocus={autoFocus}
        onChange={(e) => onChange(cleanCode(e.target.value))}
      />
    </div>
  );
}
