/* AS READER — frases de los recordatorios de lectura.
   Estilo Duolingo: sarcasmo cariñoso, culpa medida y cero sermón.
   Placeholders disponibles: {name} {book} {days} {streak} {pages}
   ({book} cae a "ese libro" si el perfil no tiene ninguno en curso). */

export const POOLS = {
  /* Nunca ha registrado una sola página. */
  nuevo: [
    { title: 'Hola, soy tu app de lectura', body: 'Nos conocimos, me instalaste y desde entonces no me hablas. {name}, registra una página y hacemos las paces.' },
    { title: 'Cero páginas. Cero.', body: 'Tienes un tracker de lectura con más funciones que páginas leídas. Eso es arte moderno, {name}.' },
    { title: 'Estoy vacío por dentro', body: 'Y también por fuera: no hay ni un registro. Abre un libro cinco minutos y me arreglas el día.' },
    { title: 'Primera página, {name}', body: 'No pido una novela rusa. Pido UNA página. Después seguimos negociando.' },
  ],

  /* Leyó ayer o antier: empujón suave. */
  manana: [
    { title: 'Buenos días, lector legendario', body: '{book} sigue exactamente donde lo dejaste. No se movió. No se va a mover solo.' },
    { title: 'El día está nuevecito', body: 'Todavía no lo has arruinado, {name}. Aprovecha y lee unas páginas antes de que empiece el caos.' },
    { title: 'Tu libro te está mirando', body: 'Desde la mesa de noche. En silencio. Con esa mirada. Ya sabes cuál.' },
    { title: 'Recordatorio inofensivo', body: 'Leer 10 páginas hoy toma 12 minutos. Scrollear toma 12 minutos también, pero después te sientes raro.' },
    { title: '{book} no se lee solo', body: 'Créeme que lo intenté toda la noche. No funcionó. Te toca a ti, {name}.' },
    { title: 'Buenos días', body: 'Hoy es un excelente día para no romper la racha. También es un excelente día para romperla, pero no hagamos eso.' },
  ],

  /* Leyó ayer o antier: última llamada nocturna. */
  noche: [
    { title: 'Última llamada', body: 'El día se acaba y {book} tiene el mismo número de páginas leídas que en la mañana. Curioso.' },
    { title: 'Quedan pocas horas, {name}', body: 'Nadie te está juzgando. Yo sí, un poquito, pero nadie más.' },
    { title: 'Cinco minutos y listo', body: 'Lees unas páginas, las registras, duermes tranquilo y yo dejo de molestar. Todos ganamos.' },
    { title: 'Tu yo del futuro llamó', body: 'Dice que hoy sí leíste. No lo hagas quedar mal, {name}.' },
    { title: 'Antes de que te duermas', body: 'Una página cuenta. Media página cuenta. Mirar la portada con intención NO cuenta.' },
    { title: 'El día sin páginas', body: 'Suena a título de novela existencialista. Y de verdad, no tienes que protagonizarla hoy.' },
  ],

  /* Racha viva de 3+ días y todavía no lee hoy. */
  racha: [
    { title: '⚠️ Racha de {streak} días en peligro', body: 'Tanto esfuerzo para tirarlo por un día de pereza, {name}. Unas páginas y la salvas.' },
    { title: 'Tu racha está temblando', body: '{streak} días seguidos. Hoy: cero. Ahí te dejo la matemática.' },
    { title: '{streak} días. No hoy.', body: 'Bueno, todavía no. Corrige eso antes de medianoche y hacemos como que no pasó nada.' },
    { title: 'Casi pierdes {streak} días', body: 'Casi. Todavía estás a tiempo. Abre {book} y respira.' },
  ],

  /* 2 a 3 días sin leer. */
  perdido2a3: [
    { title: '{days} días sin leer', body: 'No es un drama todavía. Pero yo llevo la cuenta y tengo excelente memoria, {name}.' },
    { title: '{book} pregunta por ti', body: 'Le dije que estabas ocupado. Van {days} días de estar ocupado.' },
    { title: 'Se enfrió el libro', body: 'Van {days} días. Un par de páginas y vuelve a estar tibio. Es ciencia.' },
    { title: 'Reporte de lectura: vacío', body: '{days} días seguidos en blanco. Estoy actualizando mi lista de decepciones.' },
  ],

  /* 4 a 7 días sin leer. */
  perdido4a7: [
    { title: '{days} días. Ya es una racha.', body: 'Lástima que sea de no leer. Se puede arreglar hoy mismo, {name}.' },
    { title: '¿Nos conocemos?', body: 'Soy la app que instalaste para leer. Hace {days} días que no cruzamos palabra.' },
    { title: 'El marcapáginas echó raíces', body: '{days} días en la misma página. A esta altura ya es un monumento.' },
    { title: 'Alerta de polvo', body: '{book} lleva {days} días quieto. Sopla la portada y lee tres páginas. Con eso me conformo.' },
  ],

  /* 8 días o más sin leer. */
  perdido8mas: [
    { title: '{days} días. Impresionante.', body: 'De verdad, sostener esto tanto tiempo requiere disciplina. Imagínate si la usaras para leer, {name}.' },
    { title: 'Ya casi ni te escribo', body: 'Van {days} días. Uno se cansa de rogar. (Mentira, aquí sigo.)' },
    { title: 'Servicio de duelo literario', body: '{book} lleva {days} días sin abrirse. Vamos a fingir que fue un descanso planeado.' },
    { title: 'Última oferta', body: 'Una página. UNA. Van {days} días, {name}, no me obligues a ponerme creativo.' },
    { title: 'Ya me acostumbré', body: '{days} días sin leer. Casi que si lees hoy me desconciertas.' },
  ],

  /* Envío de prueba desde Ajustes. */
  test: [
    { title: '🔔 Funciona, {name}', body: 'Si estás viendo esto, las notificaciones quedaron bien. Ahora prepárate para que te moleste seguido.' },
  ],
};

/** Elige el tono según qué tan abandonado esté el hábito. */
export function pickPool({ slot, hasLogs, daysSince, streak }) {
  if (slot === 'test') return 'test';
  if (!hasLogs) return 'nuevo';
  if (daysSince >= 8) return 'perdido8mas';
  if (daysSince >= 4) return 'perdido4a7';
  if (daysSince >= 2) return 'perdido2a3';
  if (streak >= 3 && slot === 'noche') return 'racha';
  return slot === 'manana' ? 'manana' : 'noche';
}

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? '').toString());
}

/** Devuelve {title, body} ya con los datos del perfil dentro. */
export function buildMessage(stats) {
  const pool = POOLS[pickPool(stats)] || POOLS.noche;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const vars = {
    name: stats.name || 'lector',
    book: stats.book || 'ese libro',
    days: stats.daysSince,
    streak: stats.streak,
    pages: stats.pages,
  };
  return { title: fill(pick.title, vars), body: fill(pick.body, vars) };
}
