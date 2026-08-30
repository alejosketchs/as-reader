// AS READER — arranque y lógica de la app (3 pestañas: Inicio · Glosario · Comunidad)
import { $, $$, html, raw, esc, num, todayISO, addDays, fmtDate, pct, sheet, confirmSheet, toast, buildDate, normalizeWord, autoGrow } from './ui.js';
import { requireSession, perfilActivo, linkConSesion, cerrarSesion, actualizarPerfilActivo, hashPin } from './session.js';
import { Books, Logs, Unlocks, ReaderUsers, Glossary, Quotes } from './db.js';
import { APP_VERSION, BUILD_DATE, ACHIEVEMENTS, titleForLevel, levelRequirement, levelTableRows, quoteOfDay } from './config.js';
import { PALETTES, applyPalette, validPalette } from './theme.js';
import { initInstall, handleInstallClick } from './install.js';

const HUB_URL = 'https://as-hub-orpin.vercel.app/';
const TABS = ['inicio', 'glosario', 'comunidad'];

/* ---------------- cálculos de juego ---------------- */
/* Recorre día por día desde la primera lectura hasta hoy: si el día cumple la
   meta de páginas del nivel actual, la racha sube; si no, se rompe y vuelve a
   cero. Al llegar a la racha exigida, sube de nivel y la exigencia crece.
   Así el nivel se gana con constancia (rachas), no por acumular tiempo o XP. */
function computeLevelProgress(logs, today) {
  const byDate = new Map();
  logs.forEach((l) => byDate.set(l.logged_date, (byDate.get(l.logged_date) || 0) + Number(l.pages_read)));
  const dates = [...byDate.keys()].sort();
  let level = 1;
  let streak = 0;
  if (dates.length) {
    let cursor = dates[0];
    while (cursor <= today) {
      const req = levelRequirement(level);
      const pages = byDate.get(cursor) || 0;
      const metGoal = pages >= req.dailyGoal;
      /* El día de hoy aún no terminó: si no se ha cumplido la meta todavía,
         no se rompe la racha ganada hasta ayer — solo se detiene el conteo. */
      if (cursor === today && !metGoal) break;
      streak = metGoal ? streak + 1 : 0;
      if (streak >= req.streakDays) { level++; streak = 0; }
      cursor = addDays(cursor, 1);
    }
  }
  return { level, streak, ...levelRequirement(level) };
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

/** Agrupa palabras/citas por libro (carpetas). Sin libro asignado cae en "General". */
function groupByBook(items) {
  const map = new Map();
  items.forEach((it) => {
    const key = it.book_id || '__general__';
    if (!map.has(key)) map.set(key, { id: key, title: it.book_title || 'General', items: [] });
    map.get(key).items.push(it);
  });
  return [...map.values()].sort((a, b) => {
    if (a.id === '__general__') return 1;
    if (b.id === '__general__') return -1;
    return b.items.length - a.items.length;
  });
}

function bookGoal(book, today) {
  const pending = Math.max(0, book.total_pages - book.current_page);
  if (!book.deadline) return pending;
  const daysLeft = Math.max(1, Math.ceil((Date.parse(book.deadline + 'T12:00:00') - Date.parse(today + 'T12:00:00')) / 864e5));
  return Math.ceil(pending / daysLeft);
}

function MESES(monthKeyStr) {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[m - 1]} de ${y}`;
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
      ${raw(book.author || book.year ? html`<p class="bookAuthor">${[book.author, book.year].filter(Boolean).join(' · ')}</p>` : '')}
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

/* ---------------- armazón ---------------- */
function shell() {
  return html`
    <section class="rHead">
      <a class="rBack" href="${linkConSesion(HUB_URL)}">← AS HUB</a>
      <h1 class="display">LEE. AVANZA.<em>SUBE DE NIVEL.</em></h1>
      <p>Cada página suma XP permanente y puntos para la season. Tu progreso no se reinicia; la competencia sí empieza de nuevo cada mes.</p>
    </section>

    <nav class="tabBar" id="rTabs">
      <button class="tabBtn" type="button" data-tab="inicio"><i>🏠</i><span>Inicio</span></button>
      <button class="tabBtn" type="button" data-tab="glosario"><i>📖</i><span>Glosario</span></button>
      <button class="tabBtn" type="button" data-tab="comunidad"><i>🏆</i><span>Comunidad</span></button>
    </nav>

    <div id="rBody"></div>

    <footer class="hubFoot">
      <div><b>AS READER</b><small>Parte del Suite personal.</small></div>
      <div class="hubFootMeta">
        <span>versión <b>${APP_VERSION}</b></span>
        <span>actualizado <b id="rBuild">${BUILD_DATE}</b></span>
      </div>
    </footer>`;
}

/* ---------------- render principal ---------------- */
export async function render(root, perfil) {
  root.innerHTML = shell();

  buildDate(BUILD_DATE).then((d) => { const el = $('#rBuild', root); if (el) el.textContent = d; });

  const today = todayISO();
  const month = monthKey(today);

  let books = [];
  let allBooks = [];
  let myLogs = [];
  let allLogs = [];
  let unlocks = [];
  let users = [];
  let myGlossary = [];
  let allGlossary = [];
  let myQuotes = [];

  try {
    [books, allBooks, myLogs, allLogs, unlocks, users, myGlossary, allGlossary, myQuotes] = await Promise.all([
      Books.list(perfil.id),
      Books.listAll(),
      Logs.listByProfile(perfil.id),
      Logs.listAll(),
      Unlocks.listAll(),
      ReaderUsers.list(),
      Glossary.listByProfile(perfil.id),
      Glossary.listAll(),
      Quotes.listByProfile(perfil.id),
    ]);
  } catch {
    root.querySelector('#rBody').innerHTML = '<div class="empty"><b>📡</b><p>Sin conexión: tu progreso vuelve cuando haya red.</p></div>';
    return;
  }

  /* ---------------- helpers ligados a los datos cargados ---------------- */
  const logsFor = (pid) => allLogs.filter((l) => l.profile_id === pid);
  const glossaryFor = (pid) => allGlossary.filter((g) => g.profile_id === pid);
  const seasonPointsFor = (pid, mk) => {
    const logPts = logsFor(pid).filter((l) => monthKey(l.logged_date) === mk).reduce((s, l) => s + Number(l.xp_earned), 0);
    const glossPts = glossaryFor(pid).filter((g) => monthKey(g.learned_date) === mk).length;
    return logPts + glossPts;
  };
  const streakFor = (pid) => computeStreak(logsFor(pid), today);
  const currentBookFor = (pid) => {
    const mine = allBooks.filter((b) => b.profile_id === pid && b.status !== 'finished');
    mine.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return mine[0] || null;
  };
  const monthlyPointsMap = () => {
    const byMonth = new Map();
    const add = (mk, pid, pts) => {
      if (!mk) return;
      if (!byMonth.has(mk)) byMonth.set(mk, new Map());
      const m = byMonth.get(mk);
      m.set(pid, (m.get(pid) || 0) + pts);
    };
    allLogs.forEach((l) => add(monthKey(l.logged_date), l.profile_id, Number(l.xp_earned)));
    allGlossary.forEach((g) => add(monthKey(g.learned_date), g.profile_id, 1));
    return byMonth;
  };
  const wonAnyPastSeason = (pid) => {
    const byMonth = monthlyPointsMap();
    for (const [mk, perProfile] of byMonth) {
      if (mk >= month) continue;
      let best = null, bestPts = -1, tie = false;
      for (const [p, pts] of perProfile) {
        if (pts > bestPts) { best = p; bestPts = pts; tie = false; }
        else if (pts === bestPts) tie = true;
      }
      if (!tie && best === pid && bestPts > 0) return true;
    }
    return false;
  };

  let tab = TABS.includes((location.hash || '').replace('#', '')) ? location.hash.replace('#', '') : 'inicio';
  let glossFolder = null; // null = ver carpetas · si no, book_id o '__general__'
  let quoteFolder = null;

  const totalXpFor = (pid) => logsFor(pid).reduce((s, l) => s + Number(l.xp_earned), 0);
  const finishedCountFor = (pid) => allBooks.filter((b) => b.profile_id === pid && b.status === 'finished').length;

  function setTab(t) {
    tab = t;
    history.replaceState(null, '', '#' + t);
    $$('.tabBtn', root).forEach((b) => b.classList.toggle('is-on', b.dataset.tab === t));
    paintBody();
  }

  $('#rTabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  $$('.tabBtn', root).forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));

  function paintBody() {
    if (tab === 'glosario') return paintGlosario();
    if (tab === 'comunidad') return paintComunidad();
    return paintInicio();
  }

  /* ---------------- INICIO ---------------- */
  function paintInicio() {
    const box = $('#rBody', root);
    box.innerHTML = html`
      <section class="notebook paper">
        <div class="rGoal" id="rGoal"></div>
        <div class="rQuote" id="rQuote"></div>
      </section>
      <section class="passport paper" id="rStats"></section>
      <section class="card rQuick" id="rQuickBox"></section>
      <section class="rLibrary">
        <div class="spread">
          <div>
            <span class="tag tag--blue">BIBLIOTECA DE ${(perfil.name || '').toUpperCase()}</span>
            <h3 class="secTitle" style="margin:6px 0 0">Mis rutas de lectura</h3>
          </div>
          <button class="btn btn--primary btn--sm" id="rNewBook" type="button">+ NUEVO LIBRO</button>
        </div>
        <div class="shelf" id="rShelf"></div>
        <div class="shelf-board" id="rShelfBoard"></div>
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
      </section>`;

    paintGoal();
    paintQuote();
    paintStats();
    paintQuick();
    paintBooks();
    paintLog();
    paintAchievements();
    $('#rNewBook', root).addEventListener('click', openNewBook);
  }

  function paintGoal() {
    const pagesToday = logsFor(perfil.id).filter((l) => l.logged_date === today).reduce((s, l) => s + Number(l.pages_read), 0);
    const { level, streak, dailyGoal, streakDays } = computeLevelProgress(logsFor(perfil.id), today);
    const unidad = (n) => (n === 1 ? 'página' : 'páginas');
    const done = pagesToday >= dailyGoal;
    const goalCard = done
      ? html`<div class="goal-card goal-card--done"><span class="ico">🔥</span><div><b>¡Meta de hoy cumplida!</b><small>${num(pagesToday)} / ${num(dailyGoal)} ${unidad(dailyGoal)} · racha protegida</small></div></div>`
      : html`<div class="goal-card"><span class="ico">📖</span><div><b>Te faltan ${num(dailyGoal - pagesToday)} ${unidad(dailyGoal - pagesToday)} hoy</b><small>para conservar tu racha</small></div></div>`;
    $('#rGoal', root).innerHTML = html`
      <div class="goal-row">
        ${raw(goalCard)}
        <div class="streak-card">
          <b>Racha hacia Nivel ${String(level + 1)}</b>
          <div class="streak-track"><div class="streak-fill" style="width:${String(pct(streak, streakDays))}%"></div></div>
          <div class="streak-nums"><span>${String(streak)} días</span><span>meta: ${String(streakDays)} días</span></div>
        </div>
      </div>`;
  }

  function paintQuote() {
    const q = quoteOfDay(today);
    $('#rQuote', root).innerHTML = html`
      <div class="sticky-wrap">
        <blockquote class="sticky">
          <p>&ldquo;${q.text}&rdquo;</p>
          <footer>${q.author} — ${q.source}</footer>
        </blockquote>
      </div>`;
  }

  function paintStats() {
    const { level, streak, dailyGoal, streakDays } = computeLevelProgress(logsFor(perfil.id), today);
    const streakAny = streakFor(perfil.id);
    const mySeason = seasonPointsFor(perfil.id, month);
    const myRank = [...users].map((u) => ({ id: u.id, pts: seasonPointsFor(u.id, month) }))
      .sort((a, b) => b.pts - a.pts).findIndex((r) => r.id === perfil.id) + 1;
    const remainingPages = (streakDays - streak) * dailyGoal;

    $('#rStats', root).innerHTML = html`
      <div class="passport-id">
        <span class="stamp">Nivel actual</span>
        <h3>${String(level)}</h3>
        <div class="title-role">${titleForLevel(level)}</div>
        <div class="xp-ring" style="--pct:${String(pct(streak, streakDays))}">
          <span>${String(streak)}/${String(streakDays)}<br>días</span>
        </div>
      </div>
      <div class="stat-list">
        <div class="stat-line"><span>Season</span><b>${num(mySeason)} pts</b></div>
        <div class="stat-line"><span>Posición</span><b>#${String(myRank || users.length)}</b></div>
        <div class="stat-line"><span>Racha activa</span><b>${String(streakAny)} 🔥</b></div>
        <div class="stat-line"><span>Págs. para subir</span><b>${num(remainingPages)}</b></div>
      </div>`;
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
    const shelf = $('#rShelf', root);
    const shelfBoard = $('#rShelfBoard', root);
    if (!books.length) {
      shelf.classList.add('hide');
      shelfBoard.classList.add('hide');
      box.innerHTML = '<div class="empty"><b>📚</b><p>Todavía no agregas libros a tu ruta.</p></div>';
      return;
    }
    shelf.classList.remove('hide');
    shelfBoard.classList.remove('hide');
    const spineColors = ['pink', 'blue', 'purple', 'yellow', 'lime'];
    shelf.innerHTML = books.map((b, i) => html`
      <div class="spine" style="background:linear-gradient(180deg,var(--${spineColors[i % spineColors.length]}),var(--wood-deep))"><span>${b.title}</span></div>`).join('');
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

  function paintAchievements() {
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

  /* ---------------- GLOSARIO (carpetas por libro) ---------------- */
  function paintGlosario() {
    const box = $('#rBody', root);
    box.innerHTML = html`
      <section class="rGlossary">
        <div class="spread">
          <div>
            <span class="tag tag--blue">TU COLECCIÓN</span>
            <h3 class="secTitle" style="margin:6px 0 0">Glosario de ${perfil.name || ''}</h3>
          </div>
          <button class="btn btn--primary btn--sm" id="gNewWord" type="button">+ NUEVA PALABRA</button>
        </div>
        <div id="gArea" style="margin-top:16px"></div>
      </section>
      <section class="rGlossary rQuotes">
        <div class="spread">
          <div>
            <span class="tag">TUS HALLAZGOS</span>
            <h3 class="secTitle" style="margin:6px 0 0">Citas y frases</h3>
          </div>
          <button class="btn btn--primary btn--sm" id="qNewQuote" type="button">+ NUEVA CITA</button>
        </div>
        <div id="qArea" style="margin-top:16px"></div>
      </section>`;

    $('#gNewWord', box).addEventListener('click', openNewWordSheet);
    $('#qNewQuote', box).addEventListener('click', openNewQuoteSheet);

    /* ----- palabras ----- */
    const gArea = $('#gArea', box);
    const wordFolders = groupByBook(myGlossary);
    if (glossFolder && !wordFolders.some((f) => f.id === glossFolder)) glossFolder = null;

    if (!glossFolder) {
      if (!wordFolders.length) {
        gArea.innerHTML = '<div class="empty"><b>📖</b><p>Aún no guardas palabras. ¡Busca la primera!</p></div>';
      } else {
        gArea.innerHTML = `<div class="folderGrid">${wordFolders.map((f) => `
          <button class="folderCard" type="button" data-folder="${esc(f.id)}">
            <span class="folderIcon">📁</span>
            <b>${esc(f.title)}</b>
            <small>${f.items.length} ${f.items.length === 1 ? 'palabra' : 'palabras'}</small>
          </button>`).join('')}</div>`;
        $$('[data-folder]', gArea).forEach((btn) => btn.addEventListener('click', () => { glossFolder = btn.dataset.folder; paintGlosario(); }));
      }
    } else {
      const folder = wordFolders.find((f) => f.id === glossFolder);
      const list = folder ? folder.items : [];
      gArea.innerHTML = html`
        <div class="row" style="margin-bottom:12px">
          <button class="btn btn--sm" id="gBack" type="button">← Carpetas</button>
          <b style="font-family:var(--display)">${folder ? folder.title : ''}</b>
        </div>
        <div class="field"><input class="input" id="gSearch" placeholder="Buscar en esta carpeta…"></div>
        <div class="glossGrid" id="gGrid" style="margin-top:14px"></div>`;
      $('#gBack', gArea).addEventListener('click', () => { glossFolder = null; paintGlosario(); });

      const paintGrid = (filter) => {
        const f = normalizeWord(filter || '');
        const filtered = f ? list.filter((w) => normalizeWord(w.word).includes(f)) : list;
        const gridEl = $('#gGrid', gArea);
        if (!filtered.length) {
          gridEl.innerHTML = `<div class="empty"><b>📖</b><p>${f ? 'No hay palabras que coincidan.' : 'Esta carpeta está vacía.'}</p></div>`;
          return;
        }
        gridEl.innerHTML = filtered.map((w) => html`
          <article class="glossCard" data-word="${w.id}">
            ${raw(w.image_url ? `<img class="glossThumb" src="${esc(w.image_url)}" alt="">` : '')}
            <b class="glossWord">${w.word}</b>
            <p class="glossDef">${w.definition}</p>
            <div class="glossMeta">
              <span>${fmtDate(w.learned_date)}</span>
              <span>${w.book_title || 'General'}</span>
            </div>
            <span class="glossMore">LEER FICHA →</span>
          </article>`).join('');
        $$('[data-word]', gridEl).forEach((card) => {
          card.addEventListener('click', () => {
            const w = filtered.find((x) => x.id === card.dataset.word);
            if (w) openWordDetail(w);
          });
        });
      };
      paintGrid();
      $('#gSearch', gArea).addEventListener('input', (e) => paintGrid(e.target.value));
    }

    /* ----- citas ----- */
    const qArea = $('#qArea', box);
    const quoteFolders = groupByBook(myQuotes);
    if (quoteFolder && !quoteFolders.some((f) => f.id === quoteFolder)) quoteFolder = null;

    if (!quoteFolder) {
      if (!quoteFolders.length) {
        qArea.innerHTML = '<div class="empty"><b>✒️</b><p>Aún no guardas citas. ¡Anota la primera frase que te marque!</p></div>';
      } else {
        qArea.innerHTML = `<div class="folderGrid">${quoteFolders.map((f) => `
          <button class="folderCard" type="button" data-folder="${esc(f.id)}">
            <span class="folderIcon">📁</span>
            <b>${esc(f.title)}</b>
            <small>${f.items.length} ${f.items.length === 1 ? 'cita' : 'citas'}</small>
          </button>`).join('')}</div>`;
        $$('[data-folder]', qArea).forEach((btn) => btn.addEventListener('click', () => { quoteFolder = btn.dataset.folder; paintGlosario(); }));
      }
    } else {
      const folder = quoteFolders.find((f) => f.id === quoteFolder);
      const list = folder ? folder.items : [];
      qArea.innerHTML = html`
        <div class="row" style="margin-bottom:12px">
          <button class="btn btn--sm" id="qBack" type="button">← Carpetas</button>
          <b style="font-family:var(--display)">${folder ? folder.title : ''}</b>
        </div>
        <div class="glossGrid" id="qGrid"></div>`;
      $('#qBack', qArea).addEventListener('click', () => { quoteFolder = null; paintGlosario(); });
      const gridEl = $('#qGrid', qArea);
      if (!list.length) {
        gridEl.innerHTML = '<div class="empty"><b>✒️</b><p>Esta carpeta está vacía.</p></div>';
      } else {
        gridEl.innerHTML = list.map((q) => html`
          <article class="glossCard quoteCard" data-quote="${q.id}">
            <b class="quoteText">&ldquo;${q.quote}&rdquo;</b>
            <p class="glossDef">${q.meaning}</p>
            <div class="glossMeta">
              <span>${fmtDate(q.learned_date)}</span>
              <span>${q.book_title || 'General'}</span>
            </div>
            <span class="glossMore">LEER FICHA →</span>
          </article>`).join('');
        $$('[data-quote]', gridEl).forEach((card) => {
          card.addEventListener('click', () => {
            const q = list.find((x) => x.id === card.dataset.quote);
            if (q) openQuoteDetail(q);
          });
        });
      }
    }
  }

  function openWordDetail(w) {
    sheet({
      title: 'Ficha del glosario',
      body: html`
        <article class="glossFicha glossFicha--big">
          ${raw(w.image_url ? `<img class="glossFichaImg" src="${esc(w.image_url)}" alt="Imagen para ${esc(w.word)}">` : '')}
          <b class="glossFichaWord">${w.word}</b>
          <p class="glossFichaDef">${w.definition}</p>
          <div class="glossMeta">
            <span>${fmtDate(w.learned_date)}</span>
            <span>${w.book_title || 'General'}</span>
          </div>
        </article>`,
      actions: [
        { label: 'Eliminar', variant: 'danger', onClick: ({ close }) => { close(); confirmRemoveWord(w); } },
        { label: 'Editar', variant: 'primary', onClick: ({ close }) => { close(); editWordSheet(w); } },
        { label: 'Cerrar', onClick: ({ close }) => close() },
      ],
    });
  }

  function editWordSheet(w) {
    sheet({
      title: 'Editar palabra',
      body: html`
        <div class="field"><label>Libro</label>
          <select class="select" id="ewBook">
            <option value="">General (sin libro)</option>
            ${raw(books.map((b) => `<option value="${esc(b.id)}" ${w.book_id === b.id ? 'selected' : ''}>${esc(b.title)}</option>`).join(''))}
          </select></div>
        <div class="field"><label>Definición</label>
          <textarea class="textarea" id="ewDef" rows="6">${w.definition}</textarea></div>
        <div class="field"><label>Imagen (URL opcional)</label>
          <input class="input" id="ewImg" type="url" value="${w.image_url || ''}" placeholder="https://…"></div>`,
      onOpen: ({ root: r }) => {
        const def = $('#ewDef', r);
        autoGrow(def);
        def.addEventListener('input', () => autoGrow(def));
      },
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        {
          label: 'Guardar →', variant: 'primary',
          onClick: async ({ close, root: r }) => {
            const definition = $('#ewDef', r).value.trim();
            if (!definition) return toast('Escribe una definición', 'err');
            const bookId = $('#ewBook', r).value || null;
            const book = bookId ? books.find((b) => b.id === bookId) : null;
            const image_url = $('#ewImg', r).value.trim() || null;
            try {
              const updated = await Glossary.update(w.id, {
                definition, book_id: bookId, book_title: book ? book.title : null, image_url,
              });
              myGlossary = myGlossary.map((x) => (x.id === w.id ? updated : x));
              allGlossary = allGlossary.map((x) => (x.id === w.id ? updated : x));
              toast('Palabra actualizada');
              close();
              paintBody();
            } catch { toast('No se pudo guardar', 'err'); }
          },
        },
      ],
    });
  }

  function confirmRemoveWord(w) {
    confirmSheet('Eliminar palabra', `¿Borrar "${w.word}" de tu glosario? Esta acción no se puede deshacer.`, async () => {
      try {
        await Glossary.remove(w.id);
        myGlossary = myGlossary.filter((x) => x.id !== w.id);
        allGlossary = allGlossary.filter((x) => x.id !== w.id);
        toast('Palabra eliminada');
        paintBody();
      } catch { toast('No se pudo eliminar', 'err'); }
    });
  }

  function openNewWordSheet() {
    const lastBook = currentBookFor(perfil.id);
    sheet({
      title: 'Nueva palabra',
      body: html`
        <div class="field"><label>Libro</label>
          <select class="select" id="gwBook">
            <option value="">General (sin libro)</option>
            ${raw(books.map((b) => `<option value="${esc(b.id)}" ${lastBook && b.id === lastBook.id ? 'selected' : ''}>${esc(b.title)}</option>`).join(''))}
          </select></div>
        <div class="field"><label>Palabra</label>
          <input class="input" id="gwWord" placeholder="Escribe la palabra…" autocomplete="off"></div>
        <button class="btn btn--primary btn--block" id="gwSearch" type="button">Buscar →</button>
        <div id="gwResult"></div>`,
      actions: [
        { label: 'Cerrar', onClick: ({ close }) => close() },
      ],
      onOpen: ({ root: r, close }) => {
        $('#gwSearch', r).addEventListener('click', () => buscarPalabra(r, close));
      },
    });
  }

  function openQuoteDetail(q) {
    sheet({
      title: 'Ficha de la cita',
      body: html`
        <article class="glossFicha glossFicha--big">
          <b class="glossFichaWord quoteFichaText">&ldquo;${q.quote}&rdquo;</b>
          <p class="glossFichaDef">${q.meaning}</p>
          <div class="glossMeta">
            <span>${fmtDate(q.learned_date)}</span>
            <span>${q.book_title || 'General'}</span>
          </div>
        </article>`,
      actions: [
        { label: 'Eliminar', variant: 'danger', onClick: ({ close }) => { close(); confirmRemoveQuote(q); } },
        { label: 'Editar', variant: 'primary', onClick: ({ close }) => { close(); editQuoteSheet(q); } },
        { label: 'Cerrar', onClick: ({ close }) => close() },
      ],
    });
  }

  function editQuoteSheet(q) {
    sheet({
      title: 'Editar cita',
      body: html`
        <div class="field"><label>Libro</label>
          <select class="select" id="eqBook">
            <option value="">General (sin libro)</option>
            ${raw(books.map((b) => `<option value="${esc(b.id)}" ${q.book_id === b.id ? 'selected' : ''}>${esc(b.title)}</option>`).join(''))}
          </select></div>
        <div class="field"><label>Cita o frase</label>
          <textarea class="textarea" id="eqText" rows="3">${q.quote}</textarea></div>
        <div class="field"><label>Qué significa para ti</label>
          <textarea class="textarea" id="eqMeaning" rows="4">${q.meaning}</textarea></div>`,
      onOpen: ({ root: r }) => {
        [$('#eqText', r), $('#eqMeaning', r)].forEach((ta) => { autoGrow(ta); ta.addEventListener('input', () => autoGrow(ta)); });
      },
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        {
          label: 'Guardar →', variant: 'primary',
          onClick: async ({ close, root: r }) => {
            const quoteText = $('#eqText', r).value.trim();
            const meaning = $('#eqMeaning', r).value.trim();
            if (!quoteText || !meaning) return toast('Escribe la cita y su significado', 'err');
            const bookId = $('#eqBook', r).value || null;
            const book = bookId ? books.find((b) => b.id === bookId) : null;
            try {
              const updated = await Quotes.update(q.id, {
                quote: quoteText, meaning, book_id: bookId, book_title: book ? book.title : null,
              });
              myQuotes = myQuotes.map((x) => (x.id === q.id ? updated : x));
              toast('Cita actualizada');
              close();
              paintBody();
            } catch { toast('No se pudo guardar', 'err'); }
          },
        },
      ],
    });
  }

  function confirmRemoveQuote(q) {
    confirmSheet('Eliminar cita', '¿Borrar esta cita de tu colección? Esta acción no se puede deshacer.', async () => {
      try {
        await Quotes.remove(q.id);
        myQuotes = myQuotes.filter((x) => x.id !== q.id);
        toast('Cita eliminada');
        paintBody();
      } catch { toast('No se pudo eliminar', 'err'); }
    });
  }

  function openNewQuoteSheet() {
    const lastBook = currentBookFor(perfil.id);
    sheet({
      title: 'Nueva cita',
      body: html`
        <div class="field"><label>Libro</label>
          <select class="select" id="qBook">
            <option value="">General (sin libro)</option>
            ${raw(books.map((b) => `<option value="${esc(b.id)}" ${lastBook && b.id === lastBook.id ? 'selected' : ''}>${esc(b.title)}</option>`).join(''))}
          </select></div>
        <div class="field"><label>Cita o frase</label>
          <textarea class="textarea" id="qText" rows="3" placeholder="Escribe la cita tal como aparece…"></textarea></div>
        <div class="field"><label>Qué significa para ti</label>
          <textarea class="textarea" id="qMeaning" rows="4" placeholder="Por qué te marcó, qué entiendes de ella…"></textarea></div>`,
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        {
          label: 'Guardar →', variant: 'primary',
          onClick: async ({ close, root: r }) => {
            const quoteText = $('#qText', r).value.trim();
            const meaning = $('#qMeaning', r).value.trim();
            if (!quoteText || !meaning) return toast('Escribe la cita y su significado', 'err');
            const bookId = $('#qBook', r).value || null;
            const book = bookId ? books.find((b) => b.id === bookId) : null;
            try {
              const created = await Quotes.create({
                profile_id: perfil.id, quote: quoteText, meaning,
                book_id: bookId, book_title: book ? book.title : null, learned_date: today,
              });
              myQuotes = [created, ...myQuotes];
              toast('Cita guardada');
              close();
              paintBody();
            } catch {
              toast('No se pudo guardar la cita', 'err');
            }
          },
        },
      ],
    });
  }

  async function buscarPalabra(r, closeSheet) {
    const wordRaw = $('#gwWord', r).value.trim();
    if (!wordRaw) return toast('Escribe una palabra', 'err');
    const bookId = $('#gwBook', r).value || null;
    const book = bookId ? books.find((b) => b.id === bookId) : null;
    const norm = normalizeWord(wordRaw);
    const existing = myGlossary.find((w) => normalizeWord(w.word) === norm);
    const resultBox = $('#gwResult', r);

    if (existing) {
      resultBox.innerHTML = html`
        <div class="glossFicha">
          <b>${existing.word}</b>
          <p>${existing.definition}</p>
          <small>${fmtDate(existing.learned_date)} · ${existing.book_title || 'General'}</small>
          <p class="muted" style="font-size:11.5px;margin-top:6px">Ya tienes esta palabra en tu glosario — no suma puntos otra vez.</p>
        </div>`;
      return;
    }

    resultBox.innerHTML = '<p class="sheetText">Buscando definición…</p>';
    let suggestion = '';
    try {
      const res = await fetch('/api/define', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordRaw, context: book ? book.title : '' }),
      });
      if (res.ok) { const data = await res.json(); suggestion = data.definition || ''; }
    } catch { /* sin conexión con la función: se llena a mano */ }

    resultBox.innerHTML = html`
      <div class="field"><label>Definición ${suggestion ? '(sugerida, puedes editarla)' : '(no se pudo sugerir — escríbela tú)'}</label>
        <textarea class="textarea" id="gwDef" rows="6">${suggestion}</textarea></div>
      <div class="field"><label>Imagen (URL opcional)</label>
        <input class="input" id="gwImg" type="url" placeholder="https://…"></div>
      <button class="btn btn--primary btn--block" id="gwSave" type="button">Guardar +1 punto →</button>`;

    const gwDef = $('#gwDef', resultBox);
    autoGrow(gwDef);
    gwDef.addEventListener('input', () => autoGrow(gwDef));

    $('#gwSave', resultBox).addEventListener('click', async () => {
      const definition = $('#gwDef', resultBox).value.trim();
      if (!definition) return toast('Escribe una definición', 'err');
      const image_url = $('#gwImg', resultBox).value.trim() || null;
      try {
        const created = await Glossary.create({
          profile_id: perfil.id, word: wordRaw, word_normalized: norm, definition,
          book_id: bookId, book_title: book ? book.title : null, learned_date: today, image_url,
        });
        myGlossary = [created, ...myGlossary];
        allGlossary = [...allGlossary, created];
        toast('+1 punto · palabra guardada');
        closeSheet?.();
        paintBody();
      } catch (err) {
        if (err?.duplicate) {
          myGlossary = await Glossary.listByProfile(perfil.id);
          toast('Esa palabra ya estaba guardada — 0 puntos', 'info');
          closeSheet?.();
          paintBody();
        } else {
          toast('No se pudo guardar', 'err');
        }
      }
    });
  }

  /* ---------------- COMUNIDAD ---------------- */
  function paintComunidad() {
    const box = $('#rBody', root);
    const rows = users.map((u) => ({
      user: u,
      points: seasonPointsFor(u.id, month),
      level: computeLevelProgress(logsFor(u.id), today).level,
      streak: streakFor(u.id),
      book: currentBookFor(u.id),
    })).sort((a, b) => b.points - a.points);

    const levelRows = levelTableRows(10);

    box.innerHTML = html`
      <section class="rCommunity">
        <span class="tag tag--lime">COMPETENCIA MENSUAL</span>
        <h3 class="secTitle" style="margin:6px 0 4px">Season ${MESES(month)}</h3>
        <p class="muted" style="font-size:12.5px">XP total permanece. Los puntos de season se reinician cada mes.</p>
        <div class="communityGrid" id="cGrid" style="margin-top:14px"></div>
      </section>
      <section class="rLevels">
        <span class="tag tag--purple">CÓMO SUBIR</span>
        <h3 class="secTitle" style="margin:6px 0 4px">Tabla de niveles</h3>
        <p class="muted" style="font-size:12.5px">Cada nivel pide leer un mínimo de páginas cada día, sin cortar la racha, durante N días seguidos. Si la racha se rompe, el conteo de ese nivel vuelve a cero. "Páginas mínimas" es el camino más corto posible (racha perfecta desde el nivel 1).</p>
        <div class="levelTable" style="margin-top:14px">
          <div class="levelHead">
            <span>NIVEL</span><span>TÍTULO</span><span>PÁG./DÍA</span><span>RACHA</span><span>PÁGINAS MÍNIMAS</span>
          </div>
          ${raw(levelRows.map((r) => `
            <div class="levelRow">
              <b>${r.level}</b>
              <span>${esc(r.title)}</span>
              <span>${num(r.dailyGoal)}</span>
              <span>${num(r.streakDays)} días</span>
              <span>${num(r.pagesToReach)}</span>
            </div>`).join(''))}
        </div>
      </section>`;

    $('#cGrid', box).innerHTML = rows.map((r, i) => {
      const pctBook = r.book ? pct(r.book.current_page, r.book.total_pages) : 0;
      return html`
        <article class="communityRow ${r.user.id === perfil.id ? 'is-me' : ''}" data-profile="${r.user.id}">
          <div class="communityTop">
            <span class="communityRank">#${i + 1}</span>
            <span class="communityWho"><i>${r.user.emoji || '👤'}</i><b>${r.user.name}</b></span>
            <span class="communityLevel">Nivel ${r.level} · ${titleForLevel(r.level)}</span>
          </div>
          ${raw(r.book
        ? `<div class="communityBook"><span>${esc(r.book.title)}</span><div class="bar"><i style="width:${pctBook}%"></i></div></div>`
        : '<p class="muted" style="font-size:11.5px">Sin libro en curso</p>')}
          <div class="communityStats">
            <span>🔥 ${String(r.streak)} días</span>
            <b>${num(r.points)} pts</b>
          </div>
        </article>`;
    }).join('');

    $$('[data-profile]', box).forEach((rowEl) => {
      const r = rows.find((x) => x.user.id === rowEl.dataset.profile);
      if (r) rowEl.addEventListener('click', () => openProfileSummary(r));
    });
  }

  function openProfileSummary(r) {
    sheet({
      title: `${r.user.emoji || '👤'} ${r.user.name}`,
      body: html`
        <div class="profileSummary">
          <div class="profileStat"><span>Nivel</span><b>${r.level} · ${titleForLevel(r.level)}</b></div>
          <div class="profileStat"><span>XP total</span><b>${num(totalXpFor(r.user.id))}</b></div>
          <div class="profileStat"><span>Libros leídos</span><b>${num(finishedCountFor(r.user.id))}</b></div>
          <div class="profileStat"><span>Palabras en glosario</span><b>${num(glossaryFor(r.user.id).length)}</b></div>
          <div class="profileStat"><span>Racha activa</span><b>${String(r.streak)} 🔥</b></div>
          <div class="profileStat"><span>Season actual</span><b>${num(r.points)} pts</b></div>
        </div>`,
      actions: [{ label: 'Cerrar', onClick: ({ close }) => close() }],
    });
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
      allBooks = allBooks.map((b) => (b.id === book.id ? updated : b));
      myLogs = await Logs.listByProfile(perfil.id);
      allLogs = await Logs.listAll();
      toast(finished ? `¡Terminaste "${book.title}"! +${delta} XP` : `+${delta} XP registrada`);
      paintBody();
      await unlockNew();
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
          <div class="field"><label>Autor (opcional)</label>
            <input class="input" id="nbAuthor" placeholder="Ej. Brandon Sanderson"></div>
          <div class="field"><label>Año (opcional)</label>
            <input class="input" id="nbYear" type="number" min="0" max="2100" placeholder="2010"></div>
        </div>
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
            const author = $('#nbAuthor', r).value.trim() || null;
            const year = Number($('#nbYear', r).value) || null;
            const total = Number($('#nbTotal', r).value);
            const page = Number($('#nbPage', r).value || 0);
            const deadline = $('#nbDeadline', r).value || null;
            const cover = $('#nbCover', r).value.trim() || null;
            if (!title) return toast('Escribe un título', 'err');
            if (!Number.isFinite(total) || total <= 0) return toast('Escribe el total de páginas', 'err');
            close();
            try {
              const created = await Books.create({
                profile_id: perfil.id, title, author, year, total_pages: total, current_page: Math.min(page, total),
                deadline, cover_url: cover, status: page >= total && total > 0 ? 'finished' : 'reading',
              });
              books = [created, ...books];
              allBooks = [created, ...allBooks];
              toast('Libro agregado');
              paintBody();
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
        ${raw(book.author || book.year ? html`<p class="muted" style="font-size:12.5px;margin-top:-6px">${[book.author, book.year].filter(Boolean).join(' · ')}</p>` : '')}
        <p class="sheetText">Página ${num(book.current_page)} de ${num(book.total_pages)} · ${String(pct(book.current_page, book.total_pages))}%</p>
        <p class="muted" style="font-size:12px">Último registro: ${logs[0] ? fmtDate(logs[0].logged_date) : '—'}</p>
        <div class="grid2">
          <div class="field"><label>Autor</label>
            <input class="input" id="bdAuthor" value="${esc(book.author || '')}" placeholder="Autor"></div>
          <div class="field"><label>Año</label>
            <input class="input" id="bdYear" type="number" min="0" max="2100" value="${book.year || ''}" placeholder="Año"></div>
        </div>
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
          label: 'Guardar', variant: 'primary',
          onClick: async ({ root: r }) => {
            const cover = $('#bdCover', r).value.trim() || null;
            const author = $('#bdAuthor', r).value.trim() || null;
            const year = Number($('#bdYear', r).value) || null;
            try {
              const updated = await Books.update(book.id, { cover_url: cover, author, year, updated_at: new Date().toISOString() });
              books = books.map((b) => (b.id === book.id ? updated : b));
              allBooks = allBooks.map((b) => (b.id === book.id ? updated : b));
              toast('Libro actualizado');
              paintBody();
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
        allBooks = allBooks.filter((b) => b.id !== book.id);
        myLogs = await Logs.listByProfile(perfil.id);
        allLogs = await Logs.listAll();
        toast('Libro eliminado');
        paintBody();
      } catch { toast('No se pudo eliminar', 'err'); }
    });
  }

  async function unlockNew() {
    const mineKeys = new Set(unlocks.filter((u) => u.profile_id === perfil.id).map((u) => u.achievement_key));
    const logs = logsFor(perfil.id);
    const pagesReadTotal = logs.reduce((s, l) => s + Number(l.pages_read), 0);
    const finishedCount = books.filter((b) => b.status === 'finished').length;
    const distinctDays = distinctDates(logs).length;
    const streak = streakFor(perfil.id);

    const checks = {
      abrir_mapa: logs.length >= 1,
      paso_firme: pagesReadTotal >= 50,
      centenario: pagesReadTotal >= 100,
      cartografo: pagesReadTotal >= 500,
      ruta_completa: finishedCount >= 1,
      lector_habitual: distinctDays >= 7,
      racha_encendida: streak >= 7,
      trilogia: finishedCount >= 3,
      campeon_season: wonAnyPastSeason(perfil.id),
    };

    const toUnlock = Object.entries(checks).filter(([key, ok]) => ok && !mineKeys.has(key)).map(([key]) => key);
    if (!toUnlock.length) return;
    try {
      const created = await Promise.all(toUnlock.map((key) => Unlocks.unlock(perfil.id, key)));
      unlocks = [...unlocks, ...created];
      const def = ACHIEVEMENTS.find((a) => a.key === toUnlock[0]);
      toast(`🏆 Logro desbloqueado: ${def ? def.title : toUnlock[0]}`);
      if (tab === 'inicio') paintAchievements();
    } catch { /* no bloquea la vista */ }
  }

  paintBody();
  await unlockNew();
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

function openSettingsSheet(profile) {
  sheet({
    title: 'Ajustes',
    body: html`
      <details class="setSection">
        <summary class="setLabel">PERFIL Y EMOJI</summary>
        <div class="setBody">
          <div class="userSummary"><i id="stAvatarPreview">${profile.emoji || '👤'}</i>
            <div><b>${profile.name}</b><small>Usuario de AS Reader</small></div></div>
          <div class="field"><label>Nombre</label>
            <input class="input" id="stName" value="${esc(profile.name)}" maxlength="30"></div>
          <div class="field"><label>Emoji</label>
            <input class="input" id="stEmoji" value="${esc(profile.emoji || '👤')}" maxlength="4"></div>
          <button class="btn btn--primary btn--block" id="stSaveProfile" type="button">Guardar perfil</button>
        </div>
      </details>
      <details class="setSection">
        <summary class="setLabel">CAMBIAR PIN</summary>
        <div class="setBody">
          <div class="field"><label>PIN actual</label>
            <input class="input" id="stPinOld" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></div>
          <div class="field"><label>PIN nuevo</label>
            <input class="input" id="stPinNew" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></div>
          <div class="field"><label>Confirmar PIN nuevo</label>
            <input class="input" id="stPinConfirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></div>
          <button class="btn btn--block" id="stSavePin" type="button">Cambiar PIN</button>
        </div>
      </details>
      <details class="setSection">
        <summary class="setLabel">APARIENCIA</summary>
        <div class="setBody">
          <div class="paletteGrid" id="stPaletteGrid">
            ${raw(PALETTES.map((p) => `
              <button type="button" class="paletteChip ${p.id === validPalette(profile.palette) ? 'is-on' : ''}" data-palette="${p.id}">
                <span class="paletteDots"><i style="background:${p.primary}"></i><i style="background:${p.secondary}"></i></span>
                <b>${esc(p.label)}</b>
              </button>`).join(''))}
          </div>
        </div>
      </details>`,
    actions: [
      { label: 'Cerrar sesión', variant: 'danger', onClick: async ({ close }) => { await cerrarSesion(); close(); location.reload(); } },
    ],
    onOpen: ({ root: r }) => {
      $('#stSaveProfile', r).addEventListener('click', async () => {
        const name = $('#stName', r).value.trim();
        const emoji = $('#stEmoji', r).value.trim() || '👤';
        if (!name) return toast('Escribe un nombre', 'err');
        try {
          await ReaderUsers.update(profile.id, { name, emoji });
          actualizarPerfilActivo({ name, emoji });
          paintWho();
          toast('Perfil actualizado');
        } catch { toast('No se pudo guardar el perfil', 'err'); }
      });

      $('#stSavePin', r).addEventListener('click', async () => {
        const oldPin = $('#stPinOld', r).value;
        const newPin = $('#stPinNew', r).value;
        const confirmPin = $('#stPinConfirm', r).value;
        if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin) || !/^\d{4}$/.test(confirmPin)) {
          return toast('Cada PIN debe tener 4 dígitos', 'err');
        }
        if (newPin !== confirmPin) return toast('El PIN nuevo no coincide', 'err');
        try {
          const oldHash = await hashPin(profile.id, oldPin);
          if (oldHash !== profile.pin_hash) return toast('El PIN actual no es correcto', 'err');
          const pin_hash = await hashPin(profile.id, newPin);
          await ReaderUsers.update(profile.id, { pin_hash });
          actualizarPerfilActivo({ pin_hash });
          $('#stPinOld', r).value = ''; $('#stPinNew', r).value = ''; $('#stPinConfirm', r).value = '';
          toast('PIN actualizado');
        } catch { toast('No se pudo cambiar el PIN', 'err'); }
      });

      $('#stPaletteGrid', r).addEventListener('click', async (e) => {
        const chip = e.target.closest('[data-palette]');
        if (!chip) return;
        const id = chip.dataset.palette;
        applyPalette(id);
        $$('.paletteChip', r).forEach((c) => c.classList.toggle('is-on', c === chip));
        try {
          await ReaderUsers.update(profile.id, { palette: id });
          actualizarPerfilActivo({ palette: id });
        } catch { toast('No se pudo guardar la paleta', 'err'); }
      });
    },
  });
}

async function boot() {
  registerSW();
  const { profile } = await requireSession();
  applyPalette(profile.palette);
  paintSync();
  paintWho();

  $('#shell').classList.remove('hide');
  window.addEventListener('online', () => { paintSync(); render($('#app'), profile); });
  window.addEventListener('offline', paintSync);

  $('#btnWho').addEventListener('click', () => openSettingsSheet(profile));
  initInstall($('#btnInstall'));
  $('#btnInstall').addEventListener('click', handleInstallClick);

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
