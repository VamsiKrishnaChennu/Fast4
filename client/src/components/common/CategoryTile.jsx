import { S } from '../../utils/strings.js';

const SYMBOLS = {
  name: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
    </>
  ),
  place: (
    <>
      <path d="M12 22s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" />
      <circle className="ff-sym-hole" cx="12" cy="10" r="2.8" />
    </>
  ),
  animal: (
    <>
      <ellipse className="ff-sym-paw" cx="12" cy="16" rx="5" ry="4.2" />
      <ellipse className="ff-sym-paw" cx="5.2" cy="11" rx="2.1" ry="2.8" />
      <ellipse className="ff-sym-paw" cx="9.2" cy="6.2" rx="2.1" ry="2.8" />
      <ellipse className="ff-sym-paw" cx="14.8" cy="6.2" rx="2.1" ry="2.8" />
      <ellipse className="ff-sym-paw" cx="18.8" cy="11" rx="2.1" ry="2.8" />
    </>
  ),
  thing: (
    <>
      <path d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z" />
      <path
        className="ff-sym-line"
        fill="none"
        strokeWidth="1.6"
        d="M12 12l8.2-4.6M12 12L3.8 7.4M12 12v9.2"
      />
    </>
  ),
};

/** A rounded square in the category colour with its symbol. Decorative: the label is next to it. */
export default function CategoryTile({ category, size = 44 }) {
  return (
    <span
      className={`ff-tile ff-tile--${category}`}
      style={{ width: size, height: size, flex: `0 0 ${size}px` }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" focusable="false">
        {SYMBOLS[category]}
      </svg>
    </span>
  );
}

/** Display names for the four categories. */
export const categoryLabel = (category) => S.categories[category];
