const PATHS: Record<string, JSX.Element> = {
  sidebar: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <path d="M8 3.5V16.5" />
    </>
  ),
  compose: (
    <>
      <path d="M14.5 3.5L16.5 5.5L8.5 13.5L5.5 14.5L6.5 11.5L14.5 3.5Z" />
      <path d="M3.5 16.5H16.5" />
    </>
  ),
  archive: (
    <>
      <rect x="2.5" y="4" width="15" height="4" rx="1.5" />
      <path d="M4 8V15C4 15.8 4.7 16.5 5.5 16.5H14.5C15.3 16.5 16 15.8 16 15V8" />
      <path d="M8 11H12" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 5.5H16.5" />
      <path d="M7 5.5V4C7 3.4 7.4 3 8 3H12C12.6 3 13 3.4 13 4V5.5" />
      <path d="M5 5.5L5.8 16C5.8 16.6 6.3 17 6.8 17H13.2C13.7 17 14.2 16.6 14.2 16L15 5.5" />
      <path d="M8.5 9V13.5M11.5 9V13.5" />
    </>
  ),
  reply: (
    <>
      <path d="M7.5 4L3 8.5L7.5 13" />
      <path d="M3 8.5H11.5C14.3 8.5 16.5 10.7 16.5 13.5V15.5" />
    </>
  ),
  replyAll: (
    <>
      <path d="M6 4L1.5 8.5L6 13" />
      <path d="M10 4L5.5 8.5L10 13" />
      <path d="M5.5 8.5H13C15.5 8.5 17.5 10.5 17.5 13V15" />
    </>
  ),
  forward: (
    <>
      <path d="M12.5 4L17 8.5L12.5 13" />
      <path d="M17 8.5H8.5C5.7 8.5 3.5 10.7 3.5 13.5V15.5" />
    </>
  ),
  flag: (
    <>
      <path d="M5 17V3.5C5 3.5 6.5 2.5 10 2.5C13.5 2.5 15 3.5 15 3.5V11C15 11 13.5 10 10 10C6.5 10 5 11 5 11" />
    </>
  ),
  envelope: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="M2.5 6.5L10 11.5L17.5 6.5" />
    </>
  ),
  envelopeOpen: (
    <>
      <path d="M2.5 8.5L10 3L17.5 8.5V14C17.5 14.8 16.8 15.5 16 15.5H4C3.2 15.5 2.5 14.8 2.5 14V8.5Z" />
      <path d="M2.5 8.5L10 13.5L17.5 8.5" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5L17 17" />
    </>
  ),
  close: (
    <>
      <path d="M5 5L15 15M15 5L5 15" />
    </>
  ),
  command: (
    <>
      <path d="M6.5 3.5C5.4 3.5 4.5 4.4 4.5 5.5C4.5 6.6 5.4 7.5 6.5 7.5H13.5C14.6 7.5 15.5 6.6 15.5 5.5C15.5 4.4 14.6 3.5 13.5 3.5C12.4 3.5 11.5 4.4 11.5 5.5V14.5C11.5 15.6 12.4 16.5 13.5 16.5C14.6 16.5 15.5 15.6 15.5 14.5C15.5 13.4 14.6 12.5 13.5 12.5H6.5C5.4 12.5 4.5 13.4 4.5 14.5C4.5 15.6 5.4 16.5 6.5 16.5C7.6 16.5 8.5 15.6 8.5 14.5V5.5C8.5 4.4 7.6 3.5 6.5 3.5Z" />
    </>
  ),
  refresh: (
    <>
      <path d="M16.5 10C16.5 13.6 13.6 16.5 10 16.5C6.4 16.5 3.5 13.6 3.5 10C3.5 6.4 6.4 3.5 10 3.5C12.3 3.5 14.3 4.7 15.4 6.5" />
      <path d="M16.5 3.5V7H13" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5V4M10 16V17.5M4.7 4.7L5.8 5.8M14.2 14.2L15.3 15.3M2.5 10H4M16 10H17.5M4.7 15.3L5.8 14.2M14.2 5.8L15.3 4.7" />
    </>
  ),
  attachment: (
    <>
      <path d="M14 6.5L7.5 13C6.4 14.1 4.6 14.1 3.5 13C2.4 11.9 2.4 10.1 3.5 9L10.5 2C11.2 1.3 12.3 1.3 13 2C13.7 2.7 13.7 3.8 13 4.5L6.5 11C6.2 11.3 5.8 11.3 5.5 11C5.2 10.7 5.2 10.3 5.5 10L11.5 4" />
    </>
  ),
  download: (
    <>
      <path d="M10 3V12.5M10 12.5L6.5 9M10 12.5L13.5 9" />
      <path d="M3.5 15.5H16.5" />
    </>
  ),
  pdf: (
    <>
      <path d="M6 2.5H11L16 7.5V16.5C16 17.3 15.3 18 14.5 18H6C5.2 18 4.5 17.3 4.5 16.5V4C4.5 3.2 5.2 2.5 6 2.5Z" />
      <path d="M11 2.5V7.5H16" />
      <path d="M7 12H13.5M7 14.5H11.5" />
    </>
  ),
  folder: (
    <>
      <path d="M2.5 5.5C2.5 4.7 3.2 4 4 4H7.5L9 6H16C16.8 6 17.5 6.7 17.5 7.5V14.5C17.5 15.3 16.8 16 16 16H4C3.2 16 2.5 15.3 2.5 14.5V5.5Z" />
    </>
  ),
  inbox: (
    <>
      <path d="M2.5 11.5L4.5 4.5C4.7 3.9 5.2 3.5 5.8 3.5H14.2C14.8 3.5 15.3 3.9 15.5 4.5L17.5 11.5" />
      <path d="M2.5 11.5V15C2.5 15.8 3.2 16.5 4 16.5H16C16.8 16.5 17.5 15.8 17.5 15V11.5H13.5L12.5 13.5H7.5L6.5 11.5H2.5Z" />
    </>
  ),
  sent: (
    <>
      <path d="M17.5 3L9 11.5" />
      <path d="M17.5 3L12.5 17L9 11.5L3.5 8L17.5 3Z" />
    </>
  ),
  draft: (
    <>
      <path d="M11 2.5H5.5C4.7 2.5 4 3.2 4 4V16C4 16.8 4.7 17.5 5.5 17.5H14.5C15.3 17.5 16 16.8 16 16V7.5L11 2.5Z" />
      <path d="M11 2.5V7.5H16" />
    </>
  ),
  junk: (
    <>
      <path d="M10 2.5L17.5 16H2.5L10 2.5Z" />
      <path d="M10 7.5V11.5M10 13.5V14" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M5 8L10 13L15 8" />
    </>
  ),
  chevronLeft: (
    <>
      <path d="M12 5L7 10L12 15" />
    </>
  ),
  chevronRight: (
    <>
      <path d="M8 5L13 10L8 15" />
    </>
  ),
  moon: (
    <>
      <path d="M16 11.5C15.2 14.7 12.3 17 9 17C5.1 17 2 13.9 2 10C2 6.7 4.3 3.8 7.5 3C6.8 4.1 6.5 5.4 6.5 6.75C6.5 10.5 9.5 13.5 13.25 13.5C14.6 13.5 15.9 13.1 16 11.5Z" />
    </>
  ),
};

interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
}

export function Icon({ name, size = 18, className, strokeWidth = 1.4, filled = false }: IconProps) {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
