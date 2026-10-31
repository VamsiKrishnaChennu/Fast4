/** The 2x2 category board with the "?" token. Colours follow the light or dark theme. */
export default function BoardLogo({ size = 160 }) {
  return (
    <svg
      className="ff-board"
      width={size}
      height={size}
      viewBox="0 0 220 220"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="t-name"
        d="M46,0H89.5A15,15 0 0 1 104.5,15V89.5A15,15 0 0 1 89.5,104.5H15A15,15 0 0 1 0,89.5V46A46,46 0 0 1 46,0Z"
      />
      <g transform="translate(32.25 32.25) scale(1.66667)">
        <circle className="s" cx="12" cy="8" r="4" />
        <path className="s" d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
      </g>
      <path
        className="t-place"
        d="M130.5,0H174A46,46 0 0 1 220,46V89.5A15,15 0 0 1 205,104.5H130.5A15,15 0 0 1 115.5,89.5V15A15,15 0 0 1 130.5,0Z"
      />
      <g transform="translate(147.75 32.25) scale(1.66667)">
        <path className="s" d="M12 22s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z" />
        <circle className="s-place-dot" cx="12" cy="10" r="2.8" />
      </g>
      <path
        className="t-animal"
        d="M15,115.5H89.5A15,15 0 0 1 104.5,130.5V205A15,15 0 0 1 89.5,220H46A46,46 0 0 1 0,174V130.5A15,15 0 0 1 15,115.5Z"
      />
      <g transform="translate(32.25 147.75) scale(1.66667)">
        <ellipse className="s-paw" cx="12" cy="16" rx="5" ry="4.2" />
        <ellipse className="s-paw" cx="5.2" cy="11" rx="2.1" ry="2.8" />
        <ellipse className="s-paw" cx="9.2" cy="6.2" rx="2.1" ry="2.8" />
        <ellipse className="s-paw" cx="14.8" cy="6.2" rx="2.1" ry="2.8" />
        <ellipse className="s-paw" cx="18.8" cy="11" rx="2.1" ry="2.8" />
      </g>
      <path
        className="t-thing"
        d="M130.5,115.5H205A15,15 0 0 1 220,130.5V174A46,46 0 0 1 174,220H130.5A15,15 0 0 1 115.5,205V130.5A15,15 0 0 1 130.5,115.5Z"
      />
      <g transform="translate(147.75 147.75) scale(1.66667)">
        <path className="s" d="M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z" />
        <path
          className="s-thing-line"
          fill="none"
          strokeWidth="1.6"
          d="M12 12l8.2-4.6M12 12L3.8 7.4M12 12v9.2"
        />
      </g>
      <g transform="translate(110 110)">
        <circle className="token" r="47.5" strokeWidth="6" />
        <path
          className="q"
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M-11,-12 C-11,-27 12,-27 12,-13 C12,-3 0,-3 0,9"
        />
        <circle className="qdot" cx="0" cy="25" r="6.5" />
      </g>
    </svg>
  );
}
