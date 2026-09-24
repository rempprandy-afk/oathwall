/** The oathwall mark — a sworn ring held shut by a wall. The ring is the oath,
 * the red bar through it is the limit the chain enforces. Original mark. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#15130f" />
      <circle cx="16" cy="16" r="8.25" stroke="#f4f0e6" strokeWidth="3.5" />
      <rect x="4" y="14.25" width="24" height="3.5" rx="1" fill="#d6431f" />
    </svg>
  );
}
