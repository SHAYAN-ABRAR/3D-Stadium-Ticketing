/**
 * Flags of the national teams in the sample events, for the match header on tickets. The images are in
 * public/flags (4:3 SVGs from the flag-icons set, MIT licence: public/flags/LICENSE.txt). A team without a
 * flag shows its colour instead.
 */
const FLAG_CODES: Readonly<Record<string, string>> = {
  Bangladesh: 'bd',
  India: 'in',
  Nepal: 'np',
  Bhutan: 'bt',
  Pakistan: 'pk',
  'Sri Lanka': 'lk',
  Maldives: 'mv',
};

/** The address of a team's flag image, or null when there is none. */
export function flagOf(team: string): string | null {
  const code = FLAG_CODES[team];
  return code ? `/flags/${code}.svg` : null;
}
