// Decorative line icons, built with DOM calls (no innerHTML). Always aria-hidden.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-5', 'M12 8h.01'],
  access: ['M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M4 8l8 2 8-2', 'M12 10v5', 'M9 22l3-7 3 7'],
  person: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  phone: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z', 'M11 18h2'],
  calendar: ['M4 5h16v16H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  language: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  location: ['M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  'id-card': ['M3 5h18v14H3z', 'M8 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M5 17a3 3 0 0 1 6 0', 'M14 10h4', 'M14 14h4'],
  partner: ['M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M2 20a6 6 0 0 1 12 0', 'M10 20a6 6 0 0 1 12 0'],
  course: ['M2 8l10-5 10 5-10 5z', 'M6 10v5c3 3 9 3 12 0v-5'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
};

export function icon(name) {
  const paths = PATHS[name];
  if (!paths) return null;
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: '1.5em', height: '1.5em', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', focusable: 'false', class: 'op-icon',
  })) svg.setAttribute(k, v);
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
