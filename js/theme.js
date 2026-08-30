// AS READER — paletas de acento (energía Splatoon: saturado, oscuro, contraste alto)
export const DEFAULT_PALETTE = 'lima-morado';

export const PALETTES = [
  { id: 'lima-morado', label: 'Lima + Morado', primary: '#c8ff2e', secondary: '#b026ff' },
  { id: 'magenta-cian', label: 'Magenta + Cian', primary: '#ff4fc3', secondary: '#12e0e0' },
  { id: 'naranja-azul', label: 'Naranja + Azul', primary: '#ff8a1e', secondary: '#2f7bff' },
  { id: 'amarillo-violeta', label: 'Amarillo ácido + Violeta', primary: '#e6ff2e', secondary: '#9b30ff' },
  { id: 'verde-rosa', label: 'Verde + Rosa', primary: '#39ff8a', secondary: '#ff4fc3' },
];

const IDS = new Set(PALETTES.map((p) => p.id));

export function validPalette(id) {
  return IDS.has(id) ? id : DEFAULT_PALETTE;
}

export function applyPalette(id) {
  document.documentElement.dataset.palette = validPalette(id);
}
