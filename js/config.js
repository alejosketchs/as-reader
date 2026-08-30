// AS READER — configuración (mismo Supabase del Suite)
export const SUPABASE_URL = 'https://derzetuipyugmrjaxcyu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_XC5v-_UBfrsnbTLIJPqe6w_xXz3tCA6';

export const TZ = 'America/Bogota';
export const APP_VERSION = '1.4.0';
export const BUILD_DATE = '2026-08-29';

/* Sesión compartida por todo el Suite: mismo esquema que AS HUB,
   así el PIN y el token de sesión funcionan igual en ambos sitios. */
export const SESSION_KEY = 'assuite:token';
export const SESSION_DAYS = 30;
export const PIN_SALT = 'as-suite';

export const XP_PER_LEVEL = 100;

/* Nivel = meta de constancia, no de XP acumulado.
   Para subir de nivel N hace falta sostener una racha de "streakDays" días
   consecutivos leyendo al menos "dailyGoal" páginas cada día — si la racha
   se rompe, el conteo vuelve a cero. El nivel NO avanza solo por pasar tiempo:
   avanza por rachas. Cada nivel exige más páginas/día y una racha más larga,
   así que llegar a nivel 5 cuesta meses de constancia real. */
export const LEVEL_BASE_STREAK_DAYS = 21; // mínimo 3 semanas para subir del nivel 1
export const LEVEL_STREAK_STEP_DAYS = 14; // cada nivel exige 14 días más de racha

export function levelRequirement(level) {
  const dailyGoal = Math.max(1, level);
  const streakDays = LEVEL_BASE_STREAK_DAYS + (level - 1) * LEVEL_STREAK_STEP_DAYS;
  return { dailyGoal, streakDays };
}

export const LEVEL_TITLES = [
  'Aprendiz',
  'Lector Errante',
  'Explorador de Senderos',
  'Guardián de Páginas',
  'Cronista',
  'Trotamundos de Historias',
  'Buscador de Secretos',
  'Tejedor de Relatos',
  'Sabio de Bolsillo',
  'Sabio',
  'Archivista Mayor',
  'Leyenda Viviente',
];

export function titleForLevel(level) {
  const i = Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1;
  return LEVEL_TITLES[i];
}

/* Tabla informativa: cuánto cuesta llegar a cada nivel si la racha nunca se rompe
   (el camino más corto posible). "pagesToReach" es lo acumulado al llegar a ese nivel. */
export function levelTableRows(count = LEVEL_TITLES.length) {
  const rows = [];
  let pagesToReach = 0;
  for (let level = 1; level <= count; level++) {
    const { dailyGoal, streakDays } = levelRequirement(level);
    rows.push({ level, title: titleForLevel(level), dailyGoal, streakDays, pagesToReach });
    pagesToReach += dailyGoal * streakDays;
  }
  return rows;
}

/* Frase del día en Inicio: rotan por fecha (misma frase todo el día, cambia al día siguiente). */
export const QUOTES = [
  { text: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.', author: 'Miguel de Cervantes', source: 'Don Quijote de la Mancha' },
  { text: 'Un libro es un sueño que sostienes en tus manos.', author: 'Neil Gaiman', source: 'Discurso "Make Good Art", 2012' },
  { text: 'No hay mejor amigo que un libro.', author: 'Simón Bolívar', source: 'Atribuida' },
  { text: 'Leer es la única forma de vivir mil vidas.', author: 'George R. R. Martin', source: 'Atribuida' },
  { text: 'La lectura de todos los buenos libros es como una conversación con las personas más notables de siglos pasados.', author: 'René Descartes', source: 'Discurso del método' },
  { text: 'Hoy un lector, mañana un líder.', author: 'Margaret Fuller', source: 'Atribuida' },
  { text: 'Un libro abierto es un cerebro que habla; cerrado, un amigo que espera.', author: 'Anónimo', source: 'Proverbio popular' },
  { text: 'La lectura hace al hombre completo.', author: 'Francis Bacon', source: 'Ensayos, "De los estudios"' },
  { text: 'Nunca sabemos cuáles libros van a cambiar nuestra vida.', author: 'Emma Watson', source: 'Entrevista, 2015' },
  { text: 'Leer es soñar de la mano de otro.', author: 'Anónimo', source: 'Proverbio popular' },
  { text: 'Cada libro es un pedazo de tiempo humano.', author: 'Marguerite Yourcenar', source: 'Con los ojos abiertos' },
  { text: 'El hábito de la lectura es el mayor regalo que los maestros pueden darles a sus alumnos.', author: 'Mary Poplin', source: 'Atribuida' },
  { text: 'Los libros son abejas que llevan el polen de una mente a otra.', author: 'James Russell Lowell', source: 'Atribuida' },
  { text: 'Leer no es un lujo, es una necesidad.', author: 'Toni Morrison', source: 'Atribuida' },
  { text: 'Una habitación sin libros es como un cuerpo sin alma.', author: 'Marco Tulio Cicerón', source: 'Atribuida' },
  { text: 'Quien no lee vive una sola vida; quien lee vive miles antes de morir.', author: 'George R. R. Martin', source: 'Danza de dragones' },
  { text: 'El lector vive mil vidas antes de morir. El que no lee vive solo una.', author: 'Jojen Reed', source: 'Danza de dragones, George R. R. Martin' },
  { text: 'Los libros son espejos: solo ves en ellos lo que ya llevas dentro.', author: 'Carlos Ruiz Zafón', source: 'La sombra del viento' },
];

export function quoteOfDay(dateISO) {
  let hash = 0;
  for (let i = 0; i < dateISO.length; i++) hash = (hash * 31 + dateISO.charCodeAt(i)) >>> 0;
  return QUOTES[hash % QUOTES.length];
}

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
