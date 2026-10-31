const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  phone: (
    <path d="M6.5 3h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A15 15 0 014.5 5a2 2 0 012-2z" />
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A9.8 9.8 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-3.2 3.9M6.2 7.6A16.6 16.6 0 002 12s3.5 7 10 7a9.6 9.6 0 004.2-.9" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
    </>
  ),
  home: <path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-8z" />,
  ranks: <path d="M5 20V11M12 20V4M19 20v-7" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.5v4l2.5 1.5M9.5 2.5h5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.7a3.5 3.5 0 010 6.6M18 14.4c2.2.7 3.5 2.6 3.5 5.6" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" />,
  logout: (
    <>
      <path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  inbox: (
    <>
      <path d="M3 13l2.5-7.5A2 2 0 017.4 4h9.2a2 2 0 011.9 1.5L21 13v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5z" />
      <path d="M3 13h5a4 4 0 008 0h5" />
    </>
  ),
};

/** Small line icons. Decorative unless a label is passed. */
export default function Icon({ name, size = 24, label }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
