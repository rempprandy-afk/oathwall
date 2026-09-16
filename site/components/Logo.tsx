/** The oathwall mark — a sealed wall: a brass seal cut with courses of brick.
 * Original brand mark, reused across the product and this site. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="50" cy="50" r="44" fill="#d4a24c" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="#0b0d0f" strokeWidth="3.5" />
      <line x1="9" y1="35" x2="91" y2="35" stroke="#0b0d0f" strokeWidth="3.5" />
      <line x1="9" y1="65" x2="91" y2="65" stroke="#0b0d0f" strokeWidth="3.5" />
      <line x1="50" y1="8" x2="50" y2="35" stroke="#0b0d0f" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="28" y1="35" x2="28" y2="65" stroke="#0b0d0f" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="72" y1="35" x2="72" y2="65" stroke="#0b0d0f" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="50" y1="65" x2="50" y2="92" stroke="#0b0d0f" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
