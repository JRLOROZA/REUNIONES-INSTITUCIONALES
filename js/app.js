/* Reuniones Institucionales · Fundación Summa Humanitate */
(function () {
"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const MES3 = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const TIPOS = ["Administración pública","Empresa","Fundación / ONG","Universidad / Educación","Medio de comunicación","Entidad religiosa","Otro"];
const MODOS = ["Presencial","Videollamada","Teléfono"];
const BUCKET = "adjuntos";
const CACHE_KEY = "ri-cache-v1";

const S = { meetings: [], insts: {}, contacts: {}, user: null, online: navigator.onLine, cacheAt: null };
let sb = null;

/* ---------- Utilidades ---------- */
let toastT;
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2800);
}
const fmtSize = (b) => (!b ? "" : b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB");
function fmtDate(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return d + " de " + MESES[m - 1] + " de " + y; }
const instName = (id) => S.insts[id]?.nombre || "Sin institución";
const contactLabel = (c) => (c ? c.nombre + (c.cargo ? " (" + c.cargo + ")" : "") : "");
function show(view) { ["#vSetup", "#vLogin", "#vReset", "#vApp"].forEach((v) => ($(v).hidden = v !== view)); }
function errMsg(e) {
  const m = e?.message || String(e || "");
  if (/Invalid login credentials/i.test(m)) return "Email o contraseña incorrectos.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "No hay conexión. Inténtalo cuando vuelvas a tener internet.";
  if (/row-level security|permission/i.test(m)) return "No tienes permiso para hacer esto (" + m + ").";
  if (/duplicate key/i.test(m)) return "Ya existe un registro con ese nombre.";
  return m || "Error desconocido";
}

/* ---------- Arranque ---------- */
const cfg = window.APP_CONFIG || {};
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) { show("#vSetup"); return; }
sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") { show("#vReset"); return; }
  if (event === "SIGNED_OUT") { S.user = null; clearCache(); show("#vLogin"); return; }
  if (session?.user && (!S.user || S.user.id !== session.user.id)) { S.user = session.user; enterApp(); }
});

(async () => {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) { S.user = data.session.user; enterApp(); }
  else if (!location.hash.includes("type=recovery")) {
    // Sin conexión y con datos guardados: deja consultar lo que había.
    const c = readCache();
    if (!navigator.onLine && c) { S.user = { email: c.email }; enterApp(); }
    else show("#vLogin");
  }
})();

/* ---------- Acceso ---------- */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#lBtn"), err = $("#lErr");
  btn.disabled = true; btn.textContent = "Entrando…"; err.hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email: $("#lEmail").value.trim(), password: $("#lPass").value });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) { err.textContent = errMsg(error); err.hidden = false; }
});
$("#lForgot").addEventListener("click", async () => {
  const email = $("#lEmail").value.trim(), err = $("#lErr");
  if (!email) { err.textContent = "Escribe primero tu email y vuelve a pulsar."; err.hidden = false; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  err.hidden = false;
  err.textContent = error ? errMsg(error) : "Te hemos enviado un email con un enlace para elegir una contraseña nueva.";
});
$("#resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $("#rPass").value });
  if (error) { $("#rErr").textContent = errMsg(error); $("#rErr").hidden = false; return; }
  history.replaceState(null, "", location.pathname);
  toast("Contraseña guardada"); enterApp();
});

/* ---------- Datos ---------- */
function readCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; } }
function writeCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), email: S.user?.email || "", meetings: S.meetings, insts: S.insts, contacts: S.contacts })); } catch (e) {}
}
function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

const fromRow = (r) => ({
  id: r.id, fecha: r.fecha, hora: r.hora || "", modalidad: r.modalidad || "", lugar: r.lugar || "",
  institucionId: r.institucion_id, contactoIds: r.contacto_ids || [], asistentesFundacion: r.asistentes_fundacion || "",
  tema: r.tema || "", resumen: r.resumen || "", acuerdos: r.acuerdos || [], proximosPasos: r.proximos_pasos || "", adjuntos: r.adjuntos || []
});

async function loadAll() {
  const [m, i, c] = await Promise.all([
    sb.from("meetings").select("*").order("fecha", { ascending: false }).limit(5000),
    sb.from("institutions").select("*").limit(5000),
    sb.from("contacts").select("*").limit(10000)
  ]);
  const err = m.error || i.error || c.error; if (err) throw err;
  S.insts = {}; i.data.forEach((r) => (S.insts[r.id] = { id: r.id, nombre: r.nombre, tipo: r.tipo || "" }));
  S.contacts = {}; c.data.forEach((r) => (S.contacts[r.id] = { id: r.id, nombre: r.nombre, cargo: r.cargo || "", institucionId: r.institucion_id }));
  S.meetings = m.data.map(fromRow);
  S.cacheAt = null; writeCache();
}

async function refresh() {
  try { await loadAll(); setOnline(true); }
  catch (e) {
    const c = readCache();
    if (c) { S.meetings = c.meetings; S.insts = c.insts; S.contacts = c.contacts; S.cacheAt = c.at; setOnline(false); }
    else { $("#status").hidden = false; $("#status").textContent = "No se pudieron cargar las reuniones: " + errMsg(e); return; }
  }
  render();
}

function setOnline(on) {
  S.online = on;
  const b = $("#offline");
  if (on) { b.hidden = true; }
  else {
    const at = S.cacheAt ? new Date(S.cacheAt) : null;
    b.innerHTML = `<span>Sin conexión. Estás viendo los datos guardados${at ? " el " + at.toLocaleDateString("es-ES") + " a las " + at.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}. Para registrar o editar, vuelve a conectarte.</span><button class="btn" type="button" id="btnRetry">Reintentar</button>`;
    b.hidden = false; $("#btnRetry").onclick = refresh;
  }
  $("#btnNew").disabled = !on;
}
window.addEventListener("online", refresh);
window.addEventListener("offline", () => { if (S.user) setOnline(false); render(); });

let entered = false;
function enterApp() {
  show("#vApp");
  if (!entered) { entered = true; setupInstall(); }
  refresh();
}

/* ---------- Instalar ---------- */
let deferredPrompt = null;
function setupInstall() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("#btnInstall").hidden = false; });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let dismissed = false; try { dismissed = localStorage.getItem("ri-ios-help") === "1"; } catch (e) {}
  if (ios && !dismissed) $("#iosHelp").hidden = false;
  $("#iosHelpClose").onclick = () => { $("#iosHelp").hidden = true; try { localStorage.setItem("ri-ios-help", "1"); } catch (e) {} };
  $("#btnInstall").onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); const r = await deferredPrompt.userChoice; deferredPrompt = null; $("#btnInstall").hidden = true;
    if (r.outcome === "accepted") toast("App instalada");
  };
  window.addEventListener("appinstalled", () => ($("#btnInstall").hidden = true));
}

/* ---------- Lista ---------- */
function filtered() {
  const q = norm($("#fq").value), fi = $("#finst").value, fy = $("#fyear").value;
  return S.meetings.filter((m) => {
    if (fi && m.institucionId !== fi) return false;
    if (fy && !(m.fecha || "").startsWith(fy)) return false;
    if (q) {
      const hay = norm([m.tema, instName(m.institucionId), (m.contactoIds || []).map((id) => contactLabel(S.contacts[id])).join(" "), m.asistentesFundacion, m.resumen, (m.acuerdos || []).join(" "), m.proximosPasos, m.lugar].join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || "")));
}
function fillFilters() {
  const fi = $("#finst"), cur = fi.value;
  const used = new Set(S.meetings.map((m) => m.institucionId));
  const opts = Object.values(S.insts).filter((i) => used.has(i.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  fi.innerHTML = '<option value="">Todas</option>' + opts.map((i) => `<option value="${esc(i.id)}">${esc(i.nombre)}</option>`).join("");
  fi.value = opts.some((o) => o.id === cur) ? cur : "";
  const fy = $("#fyear"), cy = fy.value;
  const years = [...new Set(S.meetings.map((m) => (m.fecha || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  fy.innerHTML = '<option value="">Todos</option>' + years.map((y) => `<option>${y}</option>`).join("");
  fy.value = years.includes(cy) ? cy : "";
  $("#dlInst").innerHTML = Object.values(S.insts).map((i) => `<option value="${esc(i.nombre)}">`).join("");
}
function render() {
  $("#status").hidden = true;
  fillFilters();
  const ms = filtered();
  const now = new Date(), ym = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0"), thisYear = String(now.getFullYear());
  const nInst = new Set(S.meetings.filter((m) => (m.fecha || "").startsWith(thisYear)).map((m) => m.institucionId)).size;
  $("#stats").innerHTML = S.meetings.length ? `
    <div class="stat"><b>${S.meetings.filter((m) => (m.fecha || "").startsWith(ym)).length}</b><span>Este mes</span></div>
    <div class="stat"><b>${S.meetings.filter((m) => (m.fecha || "").startsWith(thisYear)).length}</b><span>En ${thisYear}</span></div>
    <div class="stat"><b>${nInst}</b><span>Instituciones en ${thisYear}</span></div>` : "";
  const L = $("#list");
  if (!S.meetings.length) {
    L.innerHTML = `<div class="empty"><h3>Aún no hay reuniones</h3><p>Aquí aparecerán tus reuniones ordenadas por mes, con la institución, las personas y los acuerdos.</p>${S.online ? '<p><button class="btn primary" type="button" data-new>+ Registrar la primera reunión</button></p>' : ""}</div>`;
    return;
  }
  if (!ms.length) { L.innerHTML = `<div class="empty"><h3>Sin resultados</h3><p>Ninguna reunión coincide con estos filtros.</p></div>`; return; }
  const groups = {}; ms.forEach((m) => { const k = (m.fecha || "").slice(0, 7); (groups[k] = groups[k] || []).push(m); });
  L.innerHTML = Object.entries(groups).map(([k, arr]) => {
    const [y, mo] = k.split("-"); const title = mo ? MESES[+mo - 1] + " " + y : "Sin fecha";
    return `<section class="month"><h2>${esc(title)} <i>${arr.length}</i></h2><div class="list">${arr.map(rowHTML).join("")}</div></section>`;
  }).join("");
}
function rowHTML(m) {
  const [, mo, d] = (m.fecha || "--").split("-");
  const people = (m.contactoIds || []).map((id) => S.contacts[id]?.nombre).filter(Boolean);
  const tags = [];
  if (m.modalidad) tags.push(`<span class="tag">${esc(m.modalidad)}</span>`);
  if ((m.acuerdos || []).length) tags.push(`<span class="tag">${m.acuerdos.length} acuerdo${m.acuerdos.length > 1 ? "s" : ""}</span>`);
  if ((m.adjuntos || []).length) tags.push(`<span class="tag">${m.adjuntos.length} adjunto${m.adjuntos.length > 1 ? "s" : ""}</span>`);
  return `<button class="row" type="button" data-open="${esc(m.id)}">
    <div class="date"><b>${d ? +d : "–"}</b><span>${mo ? MES3[+mo - 1] : ""}</span></div>
    <div class="main"><div class="inst">${esc(instName(m.institucionId))}</div><div class="tema">${esc(m.tema || "(sin tema)")}</div>
    <div class="meta">${m.hora ? esc(m.hora) + " · " : ""}${people.length ? esc(people.join(", ")) : "Sin contactos"}</div></div>
    <div class="tags">${tags.join("")}</div></button>`;
}
["#fq", "#finst", "#fyear"].forEach((s) => $(s).addEventListener("input", render));
$("#fclear").onclick = () => { $("#fq").value = ""; $("#finst").value = ""; $("#fyear").value = ""; render(); };
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]"); if (o) { openDetail(o.dataset.open); return; }
  if (e.target.closest("[data-new]")) openForm();
  const f = e.target.closest("[data-file]"); if (f) { e.preventDefault(); openFile(f.dataset.file); }
});
$("#btnNew").onclick = () => openForm();
$("#btnMenu").onclick = openAccount;

/* ---------- Adjuntos ---------- */
async function openFile(path) {
  if (!S.online) { toast("Los adjuntos solo se pueden abrir con conexión"); return; }
  const w = window.open("", "_blank");
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) { if (w) w.close(); toast("No se pudo abrir el archivo: " + errMsg(error)); return; }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
function safeName(n) { return n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80); }

/* ---------- Hoja lateral ---------- */
let sheetEl = null;
function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; document.body.style.overflow = ""; } }
function openSheet(title, body, footer) {
  closeSheet();
  sheetEl = document.createElement("div");
  sheetEl.innerHTML = `<div class="scrim" data-close></div><aside class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-h"><h2>${esc(title)}</h2><button class="btn ghost" type="button" data-close aria-label="Cerrar">✕</button></div>
    <div class="sheet-b">${body}</div><div class="sheet-f">${footer}</div></aside>`;
  document.body.appendChild(sheetEl); document.body.style.overflow = "hidden";
  sheetEl.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeSheet));
  return sheetEl;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetEl) closeSheet(); });

/* ---------- Cuenta ---------- */
function openAccount() {
  const el = openSheet("Cuenta", `<p>Has entrado como <b>${esc(S.user?.email || "")}</b>.</p>
    <p class="status">${S.cacheAt ? "Sin conexión: datos guardados." : "Datos sincronizados."}</p>`,
    `<button class="btn" type="button" id="aRefresh">Actualizar datos</button><button class="btn danger" type="button" id="aOut">Cerrar sesión</button>`);
  el.querySelector("#aRefresh").onclick = () => { closeSheet(); refresh(); };
  el.querySelector("#aOut").onclick = async () => { closeSheet(); await sb.auth.signOut(); };
}

/* ---------- Ficha ---------- */
function openDetail(id) {
  const m = S.meetings.find((x) => x.id === id); if (!m) return;
  const inst = S.insts[m.institucionId];
  const people = (m.contactoIds || []).map((i) => S.contacts[i]).filter(Boolean);
  const body = `<div class="detail" style="display:flex;flex-direction:column;gap:14px">
    <div><div style="color:var(--accent);font-weight:700">${esc(instName(m.institucionId))}${inst?.tipo ? ` <span class="tag">${esc(inst.tipo)}</span>` : ""}</div>
    <div style="font-family:var(--f-display);font-size:1.5rem;line-height:1.2">${esc(m.tema)}</div></div>
    <dl>
      <dt>Fecha</dt><dd>${esc(fmtDate(m.fecha))}${m.hora ? " · " + esc(m.hora) : ""}</dd>
      <dt>Modalidad</dt><dd>${esc(m.modalidad || "–")}${m.lugar ? " · " + esc(m.lugar) : ""}</dd>
      <dt>Contactos</dt><dd>${people.length ? people.map((c) => esc(contactLabel(c))).join("\n") : "–"}</dd>
      <dt>Por la Fundación</dt><dd>${esc(m.asistentesFundacion || "–")}</dd>
    </dl>
    ${m.resumen ? `<div class="block"><h3>Resumen</h3><p>${esc(m.resumen)}</p></div>` : ""}
    ${(m.acuerdos || []).length ? `<div class="block"><h3>Acuerdos</h3><ul>${m.acuerdos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
    ${m.proximosPasos ? `<div class="block"><h3>Próximos pasos</h3><p>${esc(m.proximosPasos)}</p></div>` : ""}
    ${(m.adjuntos || []).length ? `<div class="block"><h3>Documentos adjuntos</h3><div class="files">${m.adjuntos.map((f) => `<div class="file"><a href="#" data-file="${esc(f.path)}">${esc(f.nombre)}</a><small>${fmtSize(f.tamano)}</small></div>`).join("")}</div></div>` : ""}
    <div id="delzone"></div></div>`;
  const el = openSheet("Reunión", body, S.online ? `<button class="btn danger" type="button" id="bDel">Eliminar</button><span style="flex:1"></span><button class="btn primary" type="button" id="bEdit">Editar</button>` : `<span class="status">Sin conexión: solo consulta.</span>`);
  if (!S.online) return;
  el.querySelector("#bEdit").onclick = () => openForm(m);
  el.querySelector("#bDel").onclick = () => {
    el.querySelector("#delzone").innerHTML = `<div class="confirm"><span style="flex:1">¿Eliminar esta reunión y sus adjuntos? No se puede deshacer.</span><button class="btn" type="button" id="dNo">Cancelar</button><button class="btn primary" type="button" id="dYes">Sí, eliminar</button></div>`;
    el.querySelector("#dNo").onclick = () => (el.querySelector("#delzone").innerHTML = "");
    el.querySelector("#dYes").onclick = async () => {
      const { error } = await sb.from("meetings").delete().eq("id", m.id);
      if (error) { toast("No se pudo eliminar: " + errMsg(error)); return; }
      const paths = (m.adjuntos || []).map((f) => f.path).filter(Boolean);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      closeSheet(); toast("Reunión eliminada"); refresh();
    };
  };
}

/* ---------- Formulario ---------- */
function openForm(m) {
  if (!S.online) { toast("Sin conexión: no se puede guardar ahora"); return; }
  const edit = !!m; m = m || {};
  const t = new Date(), iso = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  const inst = S.insts[m.institucionId];
  const st = {
    contacts: (m.contactoIds || []).map((id) => (S.contacts[id] ? { id, nombre: S.contacts[id].nombre, cargo: S.contacts[id].cargo || "" } : null)).filter(Boolean),
    files: [...(m.adjuntos || [])], removed: [], uploaded: [], uploading: 0
  };
  const body = `<form id="mf" novalidate style="display:flex;flex-direction:column;gap:20px">
  <fieldset><legend>Cuándo y dónde</legend>
    <div class="grid2">
      <label class="f"><span>Fecha <span class="req">*</span></span><input type="date" id="m_fecha" required value="${esc(m.fecha || iso)}"></label>
      <label class="f">Hora<input type="time" id="m_hora" value="${esc(m.hora || "")}"></label>
      <label class="f">Modalidad<select id="m_modo">${MODOS.map((x) => `<option ${x === (m.modalidad || "Presencial") ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="f">Lugar<input type="text" id="m_lugar" value="${esc(m.lugar || "")}" placeholder="Sede, dirección o enlace"></label>
    </div></fieldset>
  <fieldset><legend>Con quién</legend>
    <div class="grid2">
      <label class="f"><span>Institución <span class="req">*</span></span><input type="text" id="m_inst" list="dlInst" autocomplete="off" value="${esc(inst?.nombre || "")}" placeholder="Escribe o elige una"></label>
      <label class="f">Tipo de entidad<select id="m_tipo"><option value="">—</option>${TIPOS.map((x) => `<option ${x === inst?.tipo ? "selected" : ""}>${x}</option>`).join("")}</select></label>
    </div>
    <label class="f">Personas asistentes de la institución <span class="hint">Escribe el nombre y pulsa Intro. Puedes añadir el cargo entre paréntesis: “Ana Ruiz (Directora)”.</span>
      <div class="chips" id="chips"><input type="text" id="m_contact" list="dlContacts" autocomplete="off" placeholder="Añadir persona…"></div></label>
    <label class="f">Asistentes por la Fundación<input type="text" id="m_fund" value="${esc(m.asistentesFundacion || "")}" placeholder="Ej.: Jose, Director General"></label>
  </fieldset>
  <fieldset><legend>Contenido</legend>
    <label class="f"><span>Tema <span class="req">*</span></span><input type="text" id="m_tema" value="${esc(m.tema || "")}" placeholder="Asunto principal de la reunión"></label>
    <label class="f">Resumen<textarea id="m_res" rows="4">${esc(m.resumen || "")}</textarea></label>
    <label class="f">Acuerdos <span class="hint">Uno por línea.</span><textarea id="m_acu" rows="3">${esc((m.acuerdos || []).join("\n"))}</textarea></label>
    <label class="f">Próximos pasos<textarea id="m_next" rows="3">${esc(m.proximosPasos || "")}</textarea></label>
  </fieldset>
  <fieldset><legend>Documentos adjuntos</legend>
    <div class="files" id="files"></div>
    <label class="drop"><input type="file" id="m_file" multiple hidden>
      Añadir archivos <span class="hint">(PDF, Word, Excel, imágenes… hasta 50 MB)</span></label>
  </fieldset>
  <div id="ferr" class="req" hidden></div>
  </form>`;
  const el = openSheet(edit ? "Editar reunión" : "Nueva reunión", body, `<button class="btn" type="button" id="bCancel">Cancelar</button><button class="btn primary" type="button" id="bSave">${edit ? "Guardar cambios" : "Guardar reunión"}</button>`);
  // Al cancelar, borra los archivos subidos en esta edición que no llegaron a guardarse.
  const discard = () => { const p = st.uploaded.map((f) => f.path); if (p.length) sb.storage.from(BUCKET).remove(p); closeSheet(); };
  el.querySelector("#bCancel").onclick = discard;
  el.querySelectorAll("[data-close]").forEach((b) => (b.onclick = discard));

  const instIn = el.querySelector("#m_inst"), tipoSel = el.querySelector("#m_tipo");
  const findInst = (name) => { const n = norm(name); return Object.values(S.insts).find((i) => norm(i.nombre) === n); };
  function refreshContactsDl() {
    const i = findInst(instIn.value);
    $("#dlContacts").innerHTML = Object.values(S.contacts).filter((c) => !i || c.institucionId === i.id).map((c) => `<option value="${esc(contactLabel(c))}">`).join("");
  }
  instIn.addEventListener("input", () => { const i = findInst(instIn.value); if (i && i.tipo) tipoSel.value = i.tipo; refreshContactsDl(); });
  refreshContactsDl();

  const chips = el.querySelector("#chips"), cin = el.querySelector("#m_contact");
  function drawChips() {
    chips.querySelectorAll(".chip").forEach((c) => c.remove());
    st.contacts.forEach((c, ix) => {
      const s = document.createElement("span"); s.className = "chip";
      s.innerHTML = `${esc(contactLabel(c))}<button type="button" aria-label="Quitar">×</button>`;
      s.querySelector("button").onclick = () => { st.contacts.splice(ix, 1); drawChips(); };
      chips.insertBefore(s, cin);
    });
  }
  function addContact(raw) {
    raw = raw.trim().replace(/,$/, ""); if (!raw) return;
    const mm = raw.match(/^(.*?)\s*\((.*)\)\s*$/); const nombre = (mm ? mm[1] : raw).trim(), cargo = mm ? mm[2].trim() : "";
    if (st.contacts.some((c) => norm(c.nombre) === norm(nombre))) return;
    const ex = Object.values(S.contacts).find((c) => norm(c.nombre) === norm(nombre));
    st.contacts.push(ex ? { id: ex.id, nombre: ex.nombre, cargo: cargo || ex.cargo || "" } : { nombre, cargo }); drawChips();
  }
  cin.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addContact(cin.value); cin.value = ""; }
    else if (e.key === "Backspace" && !cin.value && st.contacts.length) { st.contacts.pop(); drawChips(); }
  });
  cin.addEventListener("change", () => { if (cin.value && Object.values(S.contacts).some((c) => contactLabel(c) === cin.value)) { addContact(cin.value); cin.value = ""; } });
  cin.addEventListener("blur", () => { if (cin.value) { addContact(cin.value); cin.value = ""; } });
  drawChips();

  const filesEl = el.querySelector("#files");
  function drawFiles() {
    filesEl.innerHTML = st.files.map((f, ix) => `<div class="file"><a href="#" data-file="${esc(f.path)}">${esc(f.nombre)}</a><small>${fmtSize(f.tamano)}</small><button class="btn ghost" type="button" data-rm="${ix}" aria-label="Quitar">×</button></div>`).join("")
      + (st.uploading ? `<div class="status">Subiendo ${st.uploading} archivo${st.uploading > 1 ? "s" : ""}…</div>` : "");
    filesEl.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { const [f] = st.files.splice(+b.dataset.rm, 1); st.removed.push(f); drawFiles(); }));
  }
  drawFiles();
  el.querySelector("#m_file").addEventListener("change", async (e) => {
    const fl = [...e.target.files]; e.target.value = "";
    for (const file of fl) {
      if (file.size > 50 * 1048576) { toast(`“${file.name}” supera 50 MB`); continue; }
      st.uploading++; drawFiles();
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      st.uploading--;
      if (error) toast(`No se pudo subir “${file.name}”: ${errMsg(error)}`);
      else { const f = { path, nombre: file.name, tamano: file.size, tipo: file.type }; st.files.push(f); st.uploaded.push(f); }
      drawFiles();
    }
  });

  el.querySelector("#bSave").onclick = async () => {
    const v = (id) => el.querySelector(id).value.trim();
    if (cin.value) { addContact(cin.value); cin.value = ""; }
    const err = el.querySelector("#ferr");
    const miss = []; if (!v("#m_fecha")) miss.push("fecha"); if (!v("#m_inst")) miss.push("institución"); if (!v("#m_tema")) miss.push("tema");
    if (miss.length) { err.hidden = false; err.textContent = "Falta rellenar: " + miss.join(", ") + "."; return; }
    if (st.uploading) { err.hidden = false; err.textContent = "Espera a que terminen de subirse los archivos."; return; }
    err.hidden = true;
    const btn = el.querySelector("#bSave"); btn.disabled = true; btn.textContent = "Guardando…";
    try {
      let i = findInst(v("#m_inst"));
      if (!i) {
        const r = await sb.from("institutions").insert({ nombre: v("#m_inst"), tipo: tipoSel.value || null }).select().single();
        if (r.error) throw r.error; i = { id: r.data.id, nombre: r.data.nombre, tipo: r.data.tipo || "" }; S.insts[i.id] = i;
      } else if (tipoSel.value && tipoSel.value !== i.tipo) {
        const r = await sb.from("institutions").update({ tipo: tipoSel.value }).eq("id", i.id); if (r.error) throw r.error;
      }
      const ids = [];
      for (const c of st.contacts) {
        if (c.id) {
          ids.push(c.id); const ex = S.contacts[c.id]; const patch = {};
          if (c.cargo && c.cargo !== ex?.cargo) patch.cargo = c.cargo;
          if (ex && !ex.institucionId) patch.institucion_id = i.id;
          if (Object.keys(patch).length) { const r = await sb.from("contacts").update(patch).eq("id", c.id); if (r.error) throw r.error; }
        } else {
          const r = await sb.from("contacts").insert({ nombre: c.nombre, cargo: c.cargo || null, institucion_id: i.id }).select().single();
          if (r.error) throw r.error; ids.push(r.data.id); c.id = r.data.id;
          S.contacts[r.data.id] = { id: r.data.id, nombre: r.data.nombre, cargo: r.data.cargo || "", institucionId: i.id };
        }
      }
      const row = {
        fecha: v("#m_fecha"), hora: v("#m_hora") || null, modalidad: v("#m_modo"), lugar: v("#m_lugar") || null,
        institucion_id: i.id, contacto_ids: ids, asistentes_fundacion: v("#m_fund") || null, tema: v("#m_tema"),
        resumen: v("#m_res") || null, acuerdos: v("#m_acu").split("\n").map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean),
        proximos_pasos: v("#m_next") || null, adjuntos: st.files
      };
      const r = edit ? await sb.from("meetings").update(row).eq("id", m.id) : await sb.from("meetings").insert(row);
      if (r.error) throw r.error;
      const rm = st.removed.map((f) => f.path).filter(Boolean);
      if (rm.length) await sb.storage.from(BUCKET).remove(rm);
      closeSheet(); toast(edit ? "Cambios guardados" : "Reunión guardada"); refresh();
    } catch (e) {
      btn.disabled = false; btn.textContent = edit ? "Guardar cambios" : "Guardar reunión";
      err.hidden = false; err.textContent = "No se pudo guardar: " + errMsg(e);
    }
  };
}
})();
