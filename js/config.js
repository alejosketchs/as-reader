// AS READER — configuración (mismo Supabase del Suite)
export const SUPABASE_URL = 'https://derzetuipyugmrjaxcyu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_XC5v-_UBfrsnbTLIJPqe6w_xXz3tCA6';

export const TZ = 'America/Bogota';
export const APP_VERSION = '1.0.0';
export const BUILD_DATE = '2026-08-23';

/* Sesión compartida por todo el Suite: mismo esquema que AS HUB,
   así el PIN y el token de sesión funcionan igual en ambos sitios. */
export const SESSION_KEY = 'assuite:token';
export const SESSION_DAYS = 30;
export const PIN_SALT = 'as-suite';

export const XP_PER_LEVEL = 100;

export const ACHIEVEMENTS = [
  { key: 'abrir_mapa', title: 'Abrir el mapa', desc: 'Registra tu primera sesión de lectura.', icon: '✦' },
  { key: 'paso_firme', title: 'Paso firme', desc: 'Lee 50 páginas en total.', icon: '?' },
  { key: 'centenario', title: 'Centenario', desc: 'Lee 100 páginas en total.', icon: '?' },
  { key: 'cartografo', title: 'Cartógrafo', desc: 'Lee 500 páginas en total.', icon: '?' },
  { key: 'ruta_completa', title: 'Ruta completa', desc: 'Termina tu primer libro.', icon: '?' },
  { key: 'lector_habitual', title: 'Lector habitual', desc: 'Lee en 7 días distintos.', icon: '?' },
  { key: 'racha_encendida', title: 'Racha encendida', desc: 'Lee 7 días consecutivos.', icon: '?' },
  { key: 'trilogia', title: 'Trilogía', desc: 'Termina 3 libros.', icon: '?' },
  { key: 'campeon_season', title: 'Campeón de season', desc: 'Gana una season mensual.', icon: '?' },
];
