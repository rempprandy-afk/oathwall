/** The oathwall mark — the split O. An O (the oath) held apart by a wall down
 * its middle: the limit the chain enforces, which nothing passes. Flat, no
 * gradients or filters, so it stays crisp at 16px and any number of copies
 * can share a page. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0c1a33" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#cfe6ff" strokeOpacity="0.16" />
      <path d="M12.6 8.1a8.6 8.6 0 0 0 0 15.8M19.4 8.1a8.6 8.6 0 0 1 0 15.8" stroke="#cfe6ff" strokeWidth="3" strokeLinecap="round" />
      <rect x="14.6" y="5.5" width="2.8" height="21" rx="1.4" fill="#6cb6ff" />
    </svg>
  );
}
