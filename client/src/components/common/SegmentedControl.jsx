/** Two or three exclusive options shown as a pill. */
export default function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="ff-segment" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="ff-segment__btn"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
