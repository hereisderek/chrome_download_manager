/**
 * A handful of fixed, functional line icons (not decorative illustration),
 * so a whole npm icon library isn't worth pulling into a browser extension
 * for ~8 glyphs. One consistent outline style: 24x24, currentColor, 1.75 stroke.
 */

const wrap = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICON_CLOUD_DOWNLOAD = wrap(
  '<path d="M7 18a5 5 0 0 1-1-9.9A6 6 0 0 1 17.6 9H18a4 4 0 0 1 0 8h-1"/><path d="M12 12v7"/><path d="m9 16 3 3 3-3"/>',
);

export const ICON_CLIPBOARD = wrap(
  '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9.5 11h5M9.5 15h5"/>',
);

export const ICON_TERMINAL = wrap('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>');

export const ICON_SERVER = wrap(
  '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
);

export const ICON_FILE = wrap(
  '<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/>',
);

export const ICON_CHECK_CIRCLE = wrap('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>');

export const ICON_ALERT_CIRCLE = wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/>');
