// AS READER — arranque y lógica de la app (vista única)
import { $, $$, html, raw, esc, num, todayISO, addDays, fmtDate, pct, sheet, confirmSheet, toast, buildDate } from './ui.js';
import { requireSession, perfilActivo, linkConSesion, cerrarSesion } from './session.js';
import { Books, Logs, Unlocks, Profiles } from './db.js';
import { APP_VERSION, BUILD_DATE, XP_PER_LEVEL, ACHIEVEMENTS } from './config.js';

const HUB_URL = 'https://as-hub-orpin.vercel.app/';

/* ---------------- cálculos de juego ---------------- */
function levelInfo(xpTotal) {
  const level = Math.floor(xpTotal / XP_PER_LEVEL) + 1;
  const into = xpTotal % XP_PER_LEVEL;
  return { level, into, need: XP_PER_LEVEL - into };
}

function distinctDates(logs) {
  return [...new Set(logs.map((l) => l.logged_date))].sort().reverse();
}

function computeStreak(logs, today) {
  const dates = distinctDates(logs);
  if (!dates.length) return 0;
  if (dates[0] !== today && dates[0] !== addDays(today, -1)) return 0;
  let streak = 1;
  let cursor = dates[0];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === addDays(cursor, -1)) { streak++; cursor = dates[i]; } else break;
  }
  return streak;
}

function monthKey(iso) { return (iso || '').slice(0, 7); }

function seasonPoints(allLogs, profileId, month) {
  return allLogs
    .filter((l) => l.profile_id === profileId && monthKey(l.logged_date) === month)
    .reduce((s, l) => s + Number(l.xp_earned), 0);
}

function wonAnyPastSeason(allLogs, profileId, currentMonth) {
  const byMonth = new Map();
  allLogs.forEach((l) => {
    const mk = monthKey(l.logged_date);
    if (!mk || mk >= currentMonth) return;
    if (!byMonth.has(mk)) byMonth.set(mk, new Map());
    const perProfile = byMonth.get(mk);
    perProfile.set(l.profile_id, (perProfile.get(l.profile_id) || 0) + Number(l.xp_earned));
  });
  for (const perProfile of byMonth.values()) {
    let best = null, bestPts = -1, tie = false;
    for (const [pid, pts] of perProfile) {
      if (pts > bestPts) { best = pid; bestPts = pts; tie = false; }
      else if (pts === bestPts) tie = true;
    }
    if (!tie && best === profileId && bestPts > 0) return true;
  }
  return false;
}

function bookGoal(book, today) {
  const pending = Math.max(0, book.total_pages - book.current_page);
  if (!book.deadline) return pending;
  const daysLeft = Math.max(1, Math.ceil((Date.parse(book.deadline + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 864e5));
  return Math.ceil(pending / daysLeft);
}

/* ---------------- armazón ---------------- */
function shell(perfil) {
  return html`
    <section class="rHead">
      <a class="rBack" href="${linkConSesion(HUB_URL)}">← AS HUB</a>
      <span class="tag">SEASON <b id="rSeasonLabel">…</b></span>
      <h1 class="display">LEE. AVANZA.<em>SUBE DE NIVEL.</em></h1>
      <p>Cada página suma XP permanente y puntos para la season. Tu progreso no se reinicia; la competencia sí empieza de nuevo cada mes.</p>
    </section>

    <div class="statGrid" id="rStats"></div>

    <section class="card rQuick" id="rQuickBox"></section>

    <section class="rLibrary">
      <div class="spread">
        <div>
          <span class="tag tag--blue">BIBLIOTECA DE ${(perfil.name || '').toUpperCase()}</span>
          <h3 class="secTitle" style="margin:6px 0 0">Mis rutas de lectura</h3>
        </div>
        <button class="btn btn--primary btn--sm" id="rNewBook" type="button">+ NUEVO LIBRO</button>
      </div>
      <div class="bookGrid" id="rBooks"></div>
    </section>

    <section class="rLog">
      <span class="tag tag--purple">BITÁCORA</span>
      <h3 class="secTitle" style="margin:6px 0 14px">Últimas lecturas</h3>
      <div class="logList" id="rLogList"></div>
    </section>

    <section class="rAch">
      <span class="tag">COLECCIÓN</span>
      <h3 class="secTitle" style="margin:6px 0 4px">Logros de ${perfil.name || ''}</h3>
      <p class="muted" id="rAchCount" style="font:800 11px var(--mono)"></p>
      <div class="achGrid" id="rAchGrid"></div>
    </section>

    <section class="rSeason">
      <span class="tag tag--lime">COMPETENCIA MENSUAL</span>
      <h3 class="secTitle" style="margin:6px 0 4px" id="rSeasonTitle">Season</h3>
      <p class="muted" style="font-size:12.5px">XP total permanece. Los puntos de season se reinician cada mes.</p>
      <div class="seasonTable" id="rSeasonTable"></div>
    </section>

    <footer class="hubFoot">
      <div><b>AS READER</b><small>Parte del Suite personal.</small></div>
      <div class="hubFootMeta">
        <span>versión <b>${APP_VERSION}</b></span>
        <span>actualizado <b id="rBuild">${BUILD_DATE}</b></span>
      </div>
    </footer>`;
}

/* ---------------- libros ---------------- */
function bookCard(book, today) {
  const percent = pct(book.current_page, book.total_pages);
  const goal = bookGoal(book, today);
  return html`
    <article class="bookCard" data-book="${book.id}">
      <button class="bookCover" type="button" data-open="${book.id}" aria-label="Abrir detalles de ${book.title}">
        ${book.cover_url
      ? raw(`<img src="${esc(book.cover_url)}" alt="Portada de ${esc(book.title)}">`)
      : raw(`<span>${esc(book.title.slice(0, 1).toUpperCase())}</span>`)}
      </button>
      <span class="bookMeta">${book.status === 'finished' ? 'TERMINADO' : (book.deadline ? 'META · ' + fmtDate(book.deadline, { withYear: true }) : 'SIN FECHA LÍMITE')}</span>
      <h4 class="bookTitle">${book.title}</h4>
      <div class="bookPct">${String(percent)}%</div>
      <div class="bar"><i style="width:${String(percent)}%"></i></div>
      <div class="bookRow">
        <div><span>PÁGINA</span><b>${num(book.current_page)} / ${num(book.total_pages)}</b></div>
        ${raw(book.status === 'finished'
      ? html`<div><span>TERMINADO</span><b>${fmtDate(book.finished_at ? book.finished_at.slice(0, 10) : '')}</b></div>`
      : html`<div><span>META DE HOY</span><b>${num(goal)} págs.</b></div>`)}
      </div>
      ${raw(book.status === 'finished'
      ? ''
      : html`<button class="btn btn--block" data-log="${book.id}" type="button">LEÍ HOY →</button>`)}
    </article>`;
}

/* ---------------- render principal ---------------- */
export async function render(root, perfil) {
  root.innerHTML = shell(perfil);

  buildDate(BUILD_DATE).then((d) => { const el = $('#rBuild', root); if (el) el.textContent = d; });

  const today = todayISO();
  const month = monthKey(today);

  let books = [];
  let myLogs = [];
  let allLogs = [];
  let unlocks = [];
  let profiles = [];

  try {
    [books, myLogs, allLogs, unlocks, profiles] = await Promise.all([
      Books.list(perfil.id),
      Logs.listByProfile(perfil.id),
      Logs.listAll(),
      Unlocks.listAll(),
      Profiles.list(),
    ]);
  } catch {
    root.querySelector('#rStats').innerHTML = '<div class="empty"><b>📡</b><p>Sin conexión: tu progreso vuelve cuando haya red.</p></div>';
    return;
  }

  paintAll();

  async function paintAll() {
    const xpTotal = myLogs.reduce((s, l) => s + Number(l.xp_earned), 0);
    const xpToday = myLogs.filter((l) => l.logged_date === today).reduce((s, l) => s + Number(l.xp_earned), 0);
    const { level, into, need } = levelInfo(xpTotal);
    const streak = computeStreak(myLogs, today);
    const mySeason = seasonPoints(allLogs, perfil.id, month);

    const others = profiles.filter((p) => p.id !== perfil.id);
    const rows = profiles.map((p) => ({
      profile: p,
      points: seasonPoints(allLogs, p.id, month),
      level: levelInfo(allLogs.filter((l) => l.profile_id === p.id).reduce((s, l) => s + Number(l.xp_earned), 0)).level,
    })).sort((a, b) => b.points - a.points);
    const myRank = rows.findIndex((r) => r.profile.id === perfil.id) + 1;

    $('#rSeasonLabel', root).textContent = `${MESES(month)}`.toUpperCase();
    $('#rSeasonTitle', root).textContent = `Season ${MESES(month)}`;

    $('#rStats', root).innerHTML = html`
      <article class="stat yellow">
        <span>NIVEL</span>
        <strong>${String(level)}</strong>
        <div class="bar"><i style="width:${String(pct(into, XP_PER_LEVEL))}%"></i></div>
        <small>${String(need)} XP para subir</small>
      </article>
      <article class="stat lime">
        <span>XP TOTAL</span>
        <strong>${num(xpTotal)}</strong>
        <div class="bar"><i style="width:${String(pct(into, XP_PER_LEVEL))}%"></i></div>
        <small>${num(into)} / ${num(XP_PER_LEVEL)} XP nivel ${String(level)}</small>
      </article>
      <article class="stat blue">
        <span>SEASON</span>
        <strong>${num(mySeason)}</strong>
        <div class="bar"><i style="width:${String(pct(mySeason, Math.max(1, ...rows.map((r) => r.points))))}%"></i></div>
        <small>Posición #${String(myRank || rows.length)}</small>
      </article>
      <article class="stat purple">
        <span>RACHA</span>
        <strong>${String(streak)}</strong>
        <div class="bar"><i style="width:${String(pct(Math.min(streak, 7), 7))}%"></i></div>
        <small>días seguidos</small>
      </article>
      <article class="stat pink">
        <span>XP HOY</span>
        <strong>+${num(xpToday)}</strong>
        <div class="bar"><i style="width:${String(pct(xpToday, Math.max(xpToday, 10)))}%"></i></div>
        <small>ganada hoy</small>
      </article>`;

    paintQuick();
    paintBooks();
    paintLog();
    paintAchievements(xpTotal);
    paintSeason(rows);

    await unlockNew({ xpTotal, streak, myLogs, books });
  }

  function paintQuick() {
    const box = $('#rQuickBox', root);
    const reading = books.filter((b) => b.status !== 'finished');
    if (!reading.length) {
      box.innerHTML = html`
        <span class="tag tag--pink">ACCIÓN RÁPIDA</span>
        <h3 class="secTitle" style="margin:6px 0 12px">Leí hoy</h3>
        <div class="empty"><b>📖</b><p>Aún no tienes libros en curso.</p>
          <button class="btn btn--primary" id="rQuickNew" type="button">CREAR PRIMER LIBRO →</button></div>`;
      $('#rQuickNew', box)?.addEventListener('click', openNewBook);
      return;
    }
    box.innerHTML = html`
      <span class="tag tag--pink">ACCIÓN RÁPIDA</span>
      <h3 class="secTitle" style="margin:6px 0 6px">Leí hoy</h3>
      <p class="muted" style="font-size:12.5px;margin-bottom:12px">Elige el libro y escribe la página donde vas. Calculamos el avance desde tu último registro.</p>
      <form class="field rQuickForm" id="rQuickForm">
        <div class="field"><label>Libro</label>
          <select class="select" id="rQuickBook">
            ${raw(reading.map((b) => `<option value="${esc(b.id)}">${esc(b.title)} · pág. ${esc(b.current_page)}</option>`).join(''))}
          </select></div>
        <div class="field"><label>Página actual</label>
          <input class="input" id="rQuickPage" type="number" min="1" placeholder="${reading[0].current_page + 1}"></div>
        <button class="btn btn--primary btn--block" type="submit">REGISTRAR LECTURA →</button>
      </form>`;
    $('#rQuickForm', box).addEventListener('submit', async (e) => {
      e.preventDefault();
      const bookId = $('#rQuickBook', box).value;
      const page = Number($('#rQuickPage', box).value);
      await logReading(bookId, page);
    });
  }

  function paintBooks() {
    const box = $('#rBooks', root);
    if (!books.length) {
      box.innerHTML = '<div class="empty"><b>📚</b><p>Todavía no agregas libros a tu ruta.</p></div>';
      return;
    }
    box.innerHTML = books.map((b) => bookCard(b, today)).join('');
    $$('[data-log]', box).forEach((btn) => btn.addEventListener('click', () => openLogSheet(btn.dataset.log)));
    $$('[data-open]', box).forEach((btn) => btn.addEventListener('click', () => openBookDetail(btn.dataset.open)));
  }

  function paintLog() {
    const box = $('#rLogList', root);
    const last = myLogs.slice(0, 8);
    if (!last.length) {
      box.innerHTML = '<div class="empty"><b>🗒️</b><p>Aún no hay páginas registradas.</p></div>';
      return;
    }
    box.innerHTML = last.map((l) => {
      const b = books.find((x) => x.id === l.book_id);
      return html`
        <article class="logRow">
          <span class="logDate">${fmtDate(l.logged_date)}</span>
          <b class="logTitle">${b ? b.title : 'Libro eliminado'}</b>
          <span class="logMeta">+${num(l.pages_read)} págs. · pág. ${num(l.page_at)}</span>
          <b class="logXp">+${num(l.xp_earned)} XP</b>
        </article>`;
    }).join('');
  }

  function paintAchievements(xpTotal) {
    const mine = new Map(unlocks.filter((u) => u.profile_id === perfil.id).map((u) => [u.achievement_key, u]));
    $('#rAchCount', root).textContent = `${mine.size} / ${ACHIEVEMENTS.length} desbloqueados`;
    $('#rAchGrid', root).innerHTML = ACHIEVEMENTS.map((a) => {
      const u = mine.get(a.key);
      return html`
        <article class="achCard ${u ? 'is-on' : ''}">
          <span class="achIcon">${u ? a.icon : '?'}</span>
          <b>${a.title}</b>
          <p>${a.desc}</p>
          <small>${u ? 'Desbloqueado · ' + fmtDate(u.unlocked_at.slice(0, 10)) : 'BLOQUEADO'}</small>
        </article>`;
    }).join('');
  }

  function paintSeason(rows) {
    $('#rSeasonTable', root).innerHTML = html`
      <div class="seasonHead"><span>POS.</span><span>JUGADOR</span><span>NIVEL</span><span>PUNTOS</span></div>
      ${raw(rows.map((r, i) => `
        <article class="seasonRow ${r.profile.id === perfil.id ? 'is-me' : ''}">
          <span>#${i + 1}</span>
          <span>${esc(r.profile.emoji || '👤')} ${esc(r.profile.name)}</span>
          <span>Nivel ${r.level}</span>
          <b>${num(r.points)}</b>
        </article>`).join(''))}`;
  }

  /* ---------------- acciones ---------------- */
  async function logReading(bookId, page) {
    const book = books.find((b) => b.id === bookId);
    if (!book) return toast('Libro no encontrado', 'err');
    if (!Number.isFinite(page) || page <= book.current_page) {
      return toast(`Escribe una página mayor a ${book.current_page}`, 'err');
    }
    if (page > book.total_pages) page = book.total_pages;
    const delta = page - book.current_page;
    try {
      await Logs.create({
        book_id: book.id, profile_id: perfil.id,
        pages_read: delta, page_at: page, xp_earned: delta, logged_date: today,
      });
      const finished = page >= book.total_pages;
      const patch = { current_page: page, updated_at: new Date().toISOString() };
      if (finished) { patch.status = 'finished'; patch.finished_at = new Date().toISOString(); }
      const updated = await Books.update(book.id, patch);
      books = books.map((b) => (b.id === book.id ? updated : b));
      myLogs = await Logs.listByProfile(perfil.id);
      allLogs = await Logs.listAll();
      toast(finished ? `¡Terminaste "${book.title}"! +${delta} XP` : `+${delta} XP registrada`);
      paintAll();
    } catch {
      toast('No se pudo registrar la lectura', 'err');
    }
  }

  function openLogSheet(bookId) {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    sheet({
      title: 'Leí hoy',
      body: html`
        <p class="sheetText">${book.title} · página ${num(book.current_page)} de ${num(book.total_pages)}</p>
        <div class="field"><label>Página actual</label>
          <input class="input" id="lgPage" type="number" min="${book.current_page + 1}" max="${book.total_pages}" placeholder="${book.current_page + 1}"></div>`,
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        {
          label: 'Registrar →', variant: 'primary',
          onClick: async ({ close, root: r }) => {
            const page = Number($('#lgPage', r).value);
            close();
            await logReading(bookId, page);
          },
        },
      ],
    });
  }

  function openNewBook() {
    sheet({
      title: 'Agregar un libro',
      body: html`
        <div class="field"><label>Título</label>
          <input class="input" id="nbTitle" placeholder="Ej. El imperio final"></div>
        <div class="grid2">
          <div class="field"><label>Total de páginas</label>
            <input class="input" id="nbTotal" type="number" min="1" placeholder="450"></div>
          <div class="field"><label>Página actual</label>
            <input class="input" id="nbPage" type="number" min="0" value="0"></div>
        </div>
        <div class="field"><label>Terminar antes del</label>
          <input class="input" id="nbDeadline" type="date" min="${today}"></div>
        <div class="field"><label>Portada (URL opcional)</label>
          <input class="input" id="nbCover" type="url" placeholder="https://…"></div>`,
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        {
          label: 'Crear ruta →', variant: 'primary',
          onClick: async ({ close, root: r }) => {
            const title = $('#nbTitle', r).value.trim();
            const total = Number($('#nbTotal', r).value);
            const page = Number($('#nbPage', r).value || 0);
            const deadline = $('#nbDeadline', r).value || null;
            const cover = $('#nbCover', r).value.trim() || null;
            if (!title) return toast('Escribe un título', 'err');
            if (!Number.isFinite(total) || total <= 0) return toast('Escribe el total de páginas', 'err');
            close();
            try {
              const created = await Books.create({
                profile_id: perfil.id, title, total_pages: total, current_page: Math.min(page, total),
                deadline, cover_url: cover, status: page >= total && total > 0 ? 'finished' : 'reading',
              });
              books = [created, ...books];
              toast('Libro agregado');
              paintAll();
            } catch { toast('No se pudo crear el libro', 'err'); }
          },
        },
      ],
    });
  }

  async function openBookDetail(bookId) {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    let logs = [];
    try { logs = await Logs.listByBook(bookId); } catch { /* noop */ }
    sheet({
      title: 'Detalle del libro',
      body: html`
        <h3 style="font:900 20px var(--sans)">${book.title}</h3>
        <p class="sheetText">Página ${num(book.current_page)} de ${num(book.total_pages)} · ${String(pct(book.current_page, book.total_pages))}%</p>
        <p class="muted" style="font-size:12px">Último registro: ${logs[0] ? fmtDate(logs[0].logged_date) : '—'}</p>
        <div class="field"><label>Portada (URL)</label>
          <input class="input" id="bdCover" type="url" value="${book.cover_url || ''}" placeholder="https://…"></div>
        <h4 style="font:900 12px var(--mono);letter-spacing:.6px;margin-top:6px">Historial de progreso</h4>
        <div class="logList">
          ${raw(logs.length ? logs.map((l) => `
            <article class="logRow">
              <span class="logDate">${fmtDate(l.logged_date)}</span>
              <b class="logTitle">+${l.pages_read} págs.</b>
              <span class="logMeta">+${l.xp_earned} XP · llegó a pág. ${l.page_at}</span>
            </article>`).join('') : '<div class="empty"><b>🗒️</b><p>Sin registros todavía.</p></div>')}
        </div>`,
      actions: [
        { label: 'Eliminar libro', variant: 'danger', onClick: ({ close }) => { close(); confirmRemoveBook(book); } },
        {
          label: 'Guardar portada', variant: 'primary',
          onClick: async ({ root: r }) => {
            const cover = $('#bdCover', r).value.trim() || null;
            try {
              const updated = await Books.update(book.id, { cover_url: cover, updated_at: new Date().toISOString() });
              books = books.map((b) => (b.id === book.id ? updated : b));
              toast('Portada guardada');
              paintBooks();
            } catch { toast('No se pudo guardar', 'err'); }
          },
        },
      ],
    });
  }

  function confirmRemoveBook(book) {
    confirmSheet('Eliminar libro', `¿Borrar "${book.title}" y toda su bitácora? Esta acción no se puede deshacer.`, async () => {
      try {
        await Books.remove(book.id);
        books = books.filter((b) => b.id !== book.id);
        myLogs = await Logs.listByProfile(perfil.id);
        allLogs = await Logs.listAll();
        toast('Libro eliminado');
        paintAll();
      } catch { toast('No se pudo eliminar', 'err'); }
    });
  }

  $('#rNewBook', root).addEventListener('click', openNewBook);

  async function unlockNew({ xpTotal, streak, myLogs: logs, books: myBooks }) {
    const mineKeys = new Set(unlocks.filter((u) => u.profile_id === perfil.id).map((u) => u.achievement_key));
    const pagesReadTotal = logs.reduce((s, l) => s + Number(l.pages_read), 0);
    const finishedCount = myBooks.filter((b) => b.status === 'finished').length;
    const distinctDays = distinctDates(logs).length;

    const checks = {
      abrir_mapa: logs.length >= 1,
      paso_firme: pagesReadTotal >= 50,
      centenario: pagesReadTotal >= 100,
      cartografo: pagesReadTotal >= 500,
      ruta_completa: finishedCount >= 1,
      lector_habitual: distinctDays >= 7,
      racha_encendida: streak >= 7,
      trilogia: finishedCount >= 3,
      campeon_season: wonAnyPastSeason(allLogs, perfil.id, month),
    };

    const toUnlock = Object.entries(checks).filter(([key, ok]) => ok && !mineKeys.has(key)).map(([key]) => key);
    if (!toUnlock.length) return;
    try {
      const created = await Promise.all(toUnlock.map((key) => Unlocks.unlock(perfil.id, key)));
      unlocks = [...unlocks, ...created];
      const def = ACHIEVEMENTS.find((a) => a.key === toUnlock[0]);
      toast(`🏆 Logro desbloqueado: ${def ? def.title : toUnlock[0]}`);
      paintAchievements(xpTotal);
    } catch { /* no bloquea la vista */ }
  }
}

function MESES(monthKeyStr) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[m - 1]} de ${y}`;
}

/* ---------------- estado de conexión ---------------- */
function paintSync() {
  const pill = $('#syncPill');
  const text = $('#syncText');
  if (!pill) return;
  const on = navigator.onLine;
  pill.classList.toggle('pill--off', !on);
  text.textContent = on ? 'EN LÍNEA' : 'SIN CONEXIÓN';
}

function paintWho() {
  const p = perfilActivo();
  if (!p) return;
  $('#whoEmoji').textContent = p.emoji || '👤';
  $('#whoName').textContent = p.name || '';
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* no bloquea la app */ });
  });
}

async function boot() {
  registerSW();
  const { profile } = await requireSession();
  paintSync();
  paintWho();

  $('#shell').classList.remove('hide');
  window.addEventListener('online', () => { paintSync(); render($('#app'), profile); });
  window.addEventListener('offline', paintSync);

  $('#btnWho').addEventListener('click', () => {
    sheet({
      title: 'Tu sesión',
      body: html`<div class="userSummary"><i>${profile.emoji || '👤'}</i>
        <div><b>${profile.name}</b><small>Perfil del Suite</small></div></div>`,
      actions: [
        { label: 'Cerrar sesión', variant: 'danger', onClick: async ({ close }) => { await cerrarSesion(); close(); location.reload(); } },
      ],
    });
  });

  await render($('#app'), profile);
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `
    <section style="min-height:100dvh;display:grid;place-items:center;padding:28px;text-align:center">
      <div style="max-width:360px;display:grid;gap:14px;justify-items:center">
        <div style="font-size:44px">📡</div>
        <h1 style="font:1000 22px 'Geist Mono',monospace">AS READER no pudo iniciar</h1>
        <p style="font-size:14px;font-weight:650;color:#9aa2b5;line-height:1.6">
          Casi siempre es la conexión. Revisa que tengas internet y vuelve a abrir.
        </p>
        <button onclick="location.reload()"
          style="padding:13px 18px;font:1000 11px 'Geist Mono',monospace;background:#a8ff1e;color:#111;
                 border:3px solid #111;box-shadow:4px 4px 0 #111;cursor:pointer">REINTENTAR</button>
      </div>
    </section>`;
});
