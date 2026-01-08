<!doctype html>
<html lang="ka">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Avatar G — Workspace</title>
  <meta name="theme-color" content="#06121a" />
  <style>
    :root{
      --bg1:#06121a;
      --bg2:#0a2533;
      --card:rgba(0,0,0,.35);
      --card2:rgba(255,255,255,.06);
      --line:rgba(255,255,255,.10);
      --text:rgba(255,255,255,.92);
      --muted:rgba(255,255,255,.68);
      --danger:#ff4d4d;
      --ok:#46e6a1;
      --cyan:#22d3ee;
      --blue:#3b82f6;
      --shadow: 0 18px 60px rgba(0,0,0,.45);
      --radius: 18px;
      --radius2: 14px;
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0;
      color:var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji";
      background:
        radial-gradient(1200px 800px at 20% 20%, rgba(34,211,238,.14), transparent 60%),
        radial-gradient(900px 700px at 70% 30%, rgba(59,130,246,.12), transparent 55%),
        linear-gradient(180deg, var(--bg1), var(--bg2));
      overflow-x:hidden;
    }
    .wrap{
      min-height:100vh;
      display:flex;
      align-items:flex-end;
      justify-content:center;
      padding: 18px 14px 24px;
    }
    .panel{
      width:min(980px, 100%);
      background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
      border:1px solid var(--line);
      box-shadow: var(--shadow);
      border-radius: var(--radius);
      overflow:hidden;
      backdrop-filter: blur(10px);
      position:relative;
    }
    .top{
      display:flex;
      gap:14px;
      align-items:center;
      padding:18px 18px 10px;
    }
    .logo{
      width:44px;height:44px;border-radius:14px;
      background: radial-gradient(circle at 30% 30%, rgba(34,211,238,.9), rgba(59,130,246,.7));
      box-shadow: 0 12px 30px rgba(34,211,238,.12);
      border:1px solid rgba(255,255,255,.16);
      flex:0 0 auto;
    }
    .title{
      display:flex;flex-direction:column;line-height:1.1;
    }
    .title h1{
      font-size:18px;margin:0 0 4px;font-weight:760;letter-spacing:.2px;
    }
    .title p{
      margin:0;color:var(--muted);font-size:13px;
    }
    .chips{
      margin-left:auto;
      display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;
    }
    .chip{
      font-size:12px;
      color:rgba(255,255,255,.82);
      border:1px solid var(--line);
      background: rgba(0,0,0,.18);
      padding:7px 10px;border-radius:999px;
      white-space:nowrap;
    }
    .chip.ok{border-color:rgba(70,230,161,.25); background:rgba(70,230,161,.08)}
    .chip.bad{border-color:rgba(255,77,77,.25); background:rgba(255,77,77,.08)}
    .row{
      display:flex;
      gap:14px;
      padding: 10px 18px 18px;
      flex-wrap:wrap;
    }
    .btn{
      border:none;
      border-radius: 14px;
      padding: 12px 14px;
      font-weight:700;
      color:rgba(255,255,255,.92);
      background: rgba(255,255,255,.06);
      border:1px solid var(--line);
      cursor:pointer;
      user-select:none;
      -webkit-tap-highlight-color: transparent;
      display:inline-flex;gap:10px;align-items:center;
    }
    .btn.primary{
      background: linear-gradient(90deg, rgba(34,211,238,.95), rgba(59,130,246,.85));
      border: 1px solid rgba(255,255,255,.18);
      color:#041018;
      box-shadow: 0 12px 30px rgba(34,211,238,.18);
    }
    .btn.danger{
      background: rgba(255,77,77,.10);
      border:1px solid rgba(255,77,77,.28);
    }
    .btn:disabled{opacity:.5; cursor:not-allowed}
    .btn:active:not(:disabled){transform:translateY(1px)}
    .grid{
      display:grid;
      grid-template-columns: 1.05fr .95fr;
      gap:14px;
      padding: 0 18px 18px;
    }
    @media (max-width: 860px){
      .grid{grid-template-columns:1fr}
      .chips{display:none}
    }
    .card{
      background: rgba(0,0,0,.22);
      border:1px solid var(--line);
      border-radius: var(--radius2);
      padding:14px;
      min-height: 220px;
    }
    .card h2{
      margin:0 0 10px;
      font-size:14px;
      color:rgba(255,255,255,.90);
      letter-spacing:.2px;
    }
    .muted{color:var(--muted);font-size:13px}
    .klist{margin:10px 0 0; padding:0 0 0 18px; color:var(--muted); font-size:13px}
    .klist li{margin:6px 0}
    .log{
      margin-top:10px;
      background: rgba(0,0,0,.28);
      border:1px solid rgba(255,255,255,.10);
      border-radius: 12px;
      padding:10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size:12px;
      color:rgba(255,255,255,.82);
      max-height: 160px;
      overflow:auto;
      white-space:pre-wrap;
    }
    .modalBack{
      position:fixed; inset:0;
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(4px);
      display:none;
      align-items:center;
      justify-content:center;
      padding:16px;
      z-index:9999;
    }
    .modal{
      width:min(720px, 100%);
      max-height: 90vh;
      overflow:auto;
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(10,25,35,.98), rgba(6,18,26,.98));
      border:1px solid rgba(255,255,255,.14);
      box-shadow: 0 22px 80px rgba(0,0,0,.6);
    }
    .modalHead{
      display:flex;
      align-items:center;
      gap:10px;
      padding:14px 14px 10px;
      border-bottom:1px solid rgba(255,255,255,.10);
      position:sticky;
      top:0;
      background: rgba(6,18,26,.95);
      backdrop-filter: blur(8px);
      z-index:1;
    }
    .modalHead h3{
      margin:0;
      font-size:14px;
      font-weight:760;
    }
    .modalHead .x{
      margin-left:auto;
      width:40px;height:40px;
      border-radius: 12px;
      border:1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.06);
      cursor:pointer;
      color:rgba(255,255,255,.88);
      font-size:18px;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .modalBody{padding:14px}
    .field{ margin-bottom:12px; }
    .label{
      font-size:12px;
      color:rgba(255,255,255,.75);
      margin:0 0 6px;
      display:block;
    }
    input, textarea, select{
      width:100%;
      padding:12px 12px;
      border-radius: 14px;
      border:1px solid rgba(255,255,255,.12);
      background: rgba(0,0,0,.22);
      color:rgba(255,255,255,.92);
      outline:none;
      font-size:14px;
      font-family: inherit;
    }
    input:focus, textarea:focus, select:focus{
      border-color: rgba(34,211,238,.55);
      box-shadow: 0 0 0 3px rgba(34,211,238,.15);
    }
    .modalActions{
      display:flex; gap:10px; justify-content:flex-end;
      padding: 12px 14px 14px;
      border-top:1px solid rgba(255,255,255,.10);
      flex-wrap:wrap;
    }
    .chatBox{
      display:flex;
      flex-direction:column;
      gap:10px;
      min-height: 360px;
    }
    .chatHeader{
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:8px;
    }
    .msgs{
      flex:1;
      background: rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.10);
      border-radius: 14px;
      padding: 12px;
      overflow:auto;
      max-height: 420px;
    }
    .bubble{
      max-width: 90%;
      padding:10px 12px;
      border-radius: 14px;
      margin: 8px 0;
      border:1px solid rgba(255,255,255,.10);
      line-height:1.35;
      font-size:14px;
      white-space:pre-wrap;
      word-break:break-word;
    }
    .me{
      margin-left:auto;
      background: rgba(34,211,238,.10);
      border-color: rgba(34,211,238,.22);
    }
    .ai{
      background: rgba(255,255,255,.06);
    }
    .bubble img{
      max-width:100%;
      border-radius:8px;
      margin-top:6px;
      display:block;
    }
    .typing{
      display:inline-block;
      padding:8px 12px;
      border-radius:14px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);
      font-size:13px;
      color:var(--muted);
    }
    .composer{
      display:flex;
      gap:10px;
      align-items:flex-end;
    }
    .composer textarea{
      min-height: 48px;
      max-height: 140px;
      resize: vertical;
    }
    .small{
      font-size:12px;
      color:rgba(255,255,255,.70);
    }
    .hint{
      margin-top:8px;
      padding:10px;
      border-radius: 14px;
      border:1px dashed rgba(255,255,255,.14);
      background: rgba(0,0,0,.18);
      color:rgba(255,255,255,.74);
      font-size:12px;
      line-height:1.4;
    }
    .warning{
      margin-top:8px;
      padding:10px;
      border-radius: 14px;
      border:1px solid rgba(255,193,7,.3);
      background: rgba(255,193,7,.08);
      color:rgba(255,240,180,.95);
      font-size:12px;
      line-height:1.4;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
  <div class="wrap">
    <div class="panel">
      <div class="top">
        <div class="logo" aria-hidden="true"></div>
        <div class="title">
          <h1>Avatar G Workspace</h1>
          <p>Production Frontend — Connect & Chat</p>
        </div>
        <div class="chips" id="chips">
          <div class="chip" id="chipMode">Mode: Ready</div>
          <div class="chip" id="chipApi">API: not set</div>
          <div class="chip" id="chipSb">Supabase: not set</div>
          <div class="chip" id="chipUser">User: guest</div>
          <div class="chip" id="chipMood">Mood: auto</div>
          <div class="chip" id="chipConv">Conv: -</div>
        </div>
      </div>

      <div class="row">
        <button class="btn" id="btnSettings">⚙️ Settings</button>
        <button class="btn" id="btnTest">🔍 Test Backend</button>
        <button class="btn primary" id="btnConnect">🔐 Connect / Sign in</button>
        <button class="btn danger" id="btnLogout" style="display:none">Logout</button>
      </div>

      <div class="grid">
        <div class="card">
          <h2>✅ სისტემის სტატუსი</h2>
          <div class="muted">
            აქ შეგიძლია:
            <ul class="klist">
              <li>დააყენო Supabase URL + anon key + API_BASE</li>
              <li>აირჩიო Mood preset (auto/technical/noir…)</li>
              <li>შეამოწმო backend health (/api/health)</li>
              <li>გაიარო Magic Link Login (email)</li>
              <li>გამოიყენო Chat — რომელიც backend-ს ეძახის</li>
            </ul>
          </div>

          <div class="hint">
            ✅ <b>Tip:</b> თუ "Failed to fetch" ჩანს, ეს ხშირად არის:<br/>
            • CORS პრობლემა (backend უნდა allow-ებდეს თქვენს frontend domain-ს)<br/>
            • API_BASE არასწორია (უნდა იყოს: https://avatarg-backend.vercel.app)<br/>
            • Backend offline-ია ან route არ არსებობს
          </div>

          <div class="log" id="syslog">[boot] Page loaded…</div>
        </div>

        <div class="card">
          <div class="chatHeader">
            <h2>💬 Chat</h2>
            <button class="btn danger" id="btnClear" style="padding:8px 12px; font-size:12px">🗑 Clear</button>
          </div>
          <div class="chatBox">
            <div class="msgs" id="msgs">
              <div class="bubble ai">👋 გამარჯობა! გააქტიურე backend connection და დაიწყე ჩატი.</div>
            </div>
            <div class="composer">
              <textarea id="prompt" placeholder="დაწერე მესიჯი… (Enter = send, Shift+Enter = new line)"></textarea>
              <button class="btn primary" id="btnSend">Send</button>
            </div>
            <div class="small" id="chatStatus">Status: idle</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- SETTINGS MODAL -->
  <div class="modalBack" id="modalBack" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modalHead">
        <h3>⚙️ Connect Avatar G</h3>
        <button class="x" id="btnClose" aria-label="Close">×</button>
      </div>

      <div class="modalBody">
        <div class="small" style="margin-bottom:10px">
          Paste your config once — saved in localStorage (this browser only).
        </div>

        <div class="field">
          <label class="label" for="sbUrl">SUPABASE_URL</label>
          <input id="sbUrl" type="url" inputmode="url" placeholder="https://xxxx.supabase.co" autocomplete="off" />
        </div>

        <div class="field">
          <label class="label" for="apiBase">API_BASE (backend domain)</label>
          <input id="apiBase" type="url" inputmode="url" placeholder="https://avatarg-backend.vercel.app" autocomplete="off" />
        </div>

        <div class="field">
          <label class="label" for="sbAnon">SUPABASE_ANON_KEY (public key only)</label>
          <textarea id="sbAnon" rows="3" placeholder="eyJhbGciOi..." autocomplete="off"></textarea>
        </div>

        <div class="field">
          <label class="label" for="mood">MOOD preset</label>
          <select id="mood">
            <option value="auto">auto (AI chooses)</option>
            <option value="executive">executive</option>
            <option value="friendly">friendly</option>
            <option value="technical">technical</option>
            <option value="noir">noir</option>
            <option value="hype">hype</option>
          </select>
        </div>

        <div class="warning">
          ⚠️ <b>Security Warning:</b><br/>
          • Only paste the <b>anon public key</b> here (starts with eyJhbGciOi...)<br/>
          • <b>NEVER paste service_role key</b> — this is a SECRET<br/>
          • These values are stored in localStorage only (never sent to servers except Supabase)
        </div>

        <div class="small" style="margin-top:10px">
          Get these from: Supabase → Project Settings → API<br/>
          API_BASE is your backend HTTPS domain (e.g., https://avatarg-backend.vercel.app)
        </div>

        <div class="log" id="cfglog">[cfg] Ready…</div>
      </div>

      <div class="modalActions">
        <button class="btn" id="btnReset">🗑 Reset</button>
        <button class="btn primary" id="btnSave">💾 Save & Continue</button>
      </div>
    </div>
  </div>

  <script>
    (function() {
      "use strict";

      const KEY = {
        SUPABASE_URL: "AVATARG_SUPABASE_URL",
        SUPABASE_ANON: "AVATARG_SUPABASE_ANON",
        API_BASE: "AVATARG_API_BASE",
        CHAT: "AVATARG_CHAT_LOG",
        SEEN_CFG_HINT: "AVATARG_SEEN_CFG_HINT",
        MOOD: "AVATARG_MOOD",
        CONV_ID: "AVATARG_CONV_ID"
      };

      const DEFAULT_API_BASE = "https://avatarg-backend.vercel.app";
      const CHAT_HISTORY_LIMIT = 60;
      const CHAT_CONTEXT_TURNS = 5;

      function safeText(str) {
        return String(str || "").replace(/[<>]/g, "");
      }

      function log(el, text) {
        if (!el) return;
        const ts = new Date().toLocaleTimeString();
        el.textContent += "\n[" + ts + "] " + safeText(text);
        el.scrollTop = el.scrollHeight;
      }

      function setLog(el, text) {
        if (!el) return;
        el.textContent = safeText(text);
        el.scrollTop = el.scrollHeight;
      }

      function normalizeUrl(url) {
        if (!url) return "";
        return String(url).trim().replace(/\/+$/, "");
      }

      function isValidApiBase(url) {
        if (!url) return false;
        const normalized = normalizeUrl(url);
        if (normalized.startsWith("http://localhost") || normalized.startsWith("http://127.0.0.1")) return true;
        try {
          const u = new URL(normalized);
          return u.protocol === "https:";
        } catch {
          return false;
        }
      }

      function isValidImageUrl(url) {
        if (!url || typeof url !== "string") return false;
        try {
          const u = new URL(url);
          return u.protocol === "https:" && /\.(jpg|jpeg|png|gif|webp)$/i.test(u.pathname);
        } catch {
          return false;
        }
      }

      function uuidv4(){
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{
          const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
          const v = c === "x" ? r : (r & 3) | 8;
          return v.toString(16);
        });
      }

      function getCfg() {
        return {
          supabaseUrl: normalizeUrl(localStorage.getItem(KEY.SUPABASE_URL) || ""),
          supabaseAnon: (localStorage.getItem(KEY.SUPABASE_ANON) || "").trim(),
          apiBase: normalizeUrl(localStorage.getItem(KEY.API_BASE) || DEFAULT_API_BASE),
          mood: (localStorage.getItem(KEY.MOOD) || "auto").trim(),
          conversationId: (localStorage.getItem(KEY.CONV_ID) || "").trim()
        };
      }

      function saveCfg(cfg) {
        localStorage.setItem(KEY.SUPABASE_URL, normalizeUrl(cfg.supabaseUrl || ""));
        localStorage.setItem(KEY.SUPABASE_ANON, (cfg.supabaseAnon || "").trim());
        localStorage.setItem(KEY.API_BASE, normalizeUrl(cfg.apiBase || DEFAULT_API_BASE));
        localStorage.setItem(KEY.MOOD, (cfg.mood || "auto").trim());

        // conversationId should exist once; keep it stable
        const existing = (localStorage.getItem(KEY.CONV_ID) || "").trim();
        if (cfg.conversationId && !existing) localStorage.setItem(KEY.CONV_ID, cfg.conversationId.trim());
      }

      function resetCfg() {
        localStorage.removeItem(KEY.SUPABASE_URL);
        localStorage.removeItem(KEY.SUPABASE_ANON);
        localStorage.removeItem(KEY.API_BASE);
        localStorage.removeItem(KEY.MOOD);
        // Do NOT remove CONV_ID by default (keeps memory continuity)
      }

      function withTimeout(ms) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        return { ctrl, done: () => clearTimeout(t) };
      }

      function extractErrorType(e, res) {
        if (!e) return "Unknown Error";
        if (e.name === "AbortError") return "Request Timeout";
        const msg = String(e.message || e).toLowerCase();
        if (msg.includes("cors") || msg.includes("blocked by cors")) return "CORS Error";
        if (msg.includes("failed to fetch") || msg.includes("network")) {
          if (res && res.status === 0) return "CORS or Network Error";
          return "Network Error";
        }
        if (msg.includes("dns") || msg.includes("enotfound")) return "DNS Error";
        return "Request Failed";
      }

      // DOM
      const syslog = document.getElementById("syslog");
      const cfglog = document.getElementById("cfglog");
      const modalBack = document.getElementById("modalBack");

      const chipMode = document.getElementById("chipMode");
      const chipApi = document.getElementById("chipApi");
      const chipSb = document.getElementById("chipSb");
      const chipUser = document.getElementById("chipUser");
      const chipMood = document.getElementById("chipMood");
      const chipConv = document.getElementById("chipConv");

      const btnSettings = document.getElementById("btnSettings");
      const btnTest = document.getElementById("btnTest");
      const btnConnect = document.getElementById("btnConnect");
      const btnLogout = document.getElementById("btnLogout");

      const btnClose = document.getElementById("btnClose");
      const btnSave = document.getElementById("btnSave");
      const btnReset = document.getElementById("btnReset");
      const btnClear = document.getElementById("btnClear");

      const sbUrl = document.getElementById("sbUrl");
      const sbAnon = document.getElementById("sbAnon");
      const apiBase = document.getElementById("apiBase");
      const mood = document.getElementById("mood");

      const msgs = document.getElementById("msgs");
      const prompt = document.getElementById("prompt");
      const btnSend = document.getElementById("btnSend");
      const chatStatus = document.getElementById("chatStatus");

      let supabaseClient = null;
      let currentUser = null;
      let isSending = false;

      function updateChips() {
        const cfg = getCfg();

        if (chipMode) {
          chipMode.textContent = currentUser ? "Mode: Authenticated" : "Mode: Ready";
          chipMode.classList.toggle("ok", !!currentUser);
        }

        if (chipApi) {
          if (cfg.apiBase && isValidApiBase(cfg.apiBase)) {
            chipApi.textContent = "API: ✓";
            chipApi.classList.add("ok");
            chipApi.classList.remove("bad");
          } else {
            chipApi.textContent = "API: not set";
            chipApi.classList.remove("ok");
            if (cfg.apiBase) chipApi.classList.add("bad");
          }
        }

        if (chipSb) {
          if (cfg.supabaseUrl && cfg.supabaseAnon) {
            chipSb.textContent = "Supabase: ✓";
            chipSb.classList.add("ok");
            chipSb.classList.remove("bad");
          } else {
            chipSb.textContent = "Supabase: not set";
            chipSb.classList.remove("ok");
          }
        }

        if (chipUser) {
          if (currentUser?.email) {
            chipUser.textContent = "User: " + currentUser.email.split("@")[0];
            chipUser.classList.add("ok");
            if (btnLogout) btnLogout.style.display = "inline-flex";
            if (btnConnect) btnConnect.textContent = "🔐 Re-connect";
          } else {
            chipUser.textContent = "User: guest";
            chipUser.classList.remove("ok");
            if (btnLogout) btnLogout.style.display = "none";
            if (btnConnect) btnConnect.textContent = "🔐 Connect / Sign in";
          }
        }

        if (chipMood) {
          chipMood.textContent = "Mood: " + (cfg.mood || "auto");
          chipMood.classList.add("ok");
        }

        if (chipConv) {
          chipConv.textContent = "Conv: " + (cfg.conversationId ? (cfg.conversationId.slice(0,8) + "…") : "-");
          chipConv.classList.toggle("ok", !!cfg.conversationId);
        }
      }

      function openModal() {
        const cfg = getCfg();
        if (sbUrl) sbUrl.value = cfg.supabaseUrl;
        if (sbAnon) sbAnon.value = cfg.supabaseAnon;
        if (apiBase) apiBase.value = cfg.apiBase || DEFAULT_API_BASE;
        if (mood) mood.value = cfg.mood || "auto";
        setLog(cfglog, "[cfg] Paste values and Save…");
        if (modalBack) modalBack.style.display = "flex";
        setTimeout(() => {
          if (sbUrl) {
            sbUrl.focus();
            sbUrl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 120);
      }

      function closeModal() {
        if (modalBack) modalBack.style.display = "none";
      }

      if (btnSettings) btnSettings.addEventListener("click", openModal);
      if (btnClose) btnClose.addEventListener("click", closeModal);

      if (modalBack) {
        modalBack.addEventListener("click", (e) => {
          if (e.target === modalBack) closeModal();
        });
      }

      if (btnSave) {
        btnSave.addEventListener("click", () => {
          const cfgExisting = getCfg();
          const cfg = {
            supabaseUrl: sbUrl ? sbUrl.value.trim() : "",
            supabaseAnon: sbAnon ? sbAnon.value.trim() : "",
            apiBase: apiBase ? apiBase.value.trim() : DEFAULT_API_BASE,
            mood: mood ? mood.value.trim() : "auto",
            conversationId: cfgExisting.conversationId || localStorage.getItem(KEY.CONV_ID) || ""
          };

          if (cfg.apiBase && !isValidApiBase(cfg.apiBase)) {
            setLog(cfglog, "❌ API_BASE must be https:// (or http://localhost for testing)");
            return;
          }
          if (cfg.supabaseUrl && !cfg.supabaseUrl.includes("supabase")) {
            log(cfglog, "⚠️ SUPABASE_URL doesn't look like a Supabase domain");
          }
          if (cfg.supabaseAnon) {
            if (cfg.supabaseAnon.length < 100) log(cfglog, "⚠️ SUPABASE_ANON_KEY looks too short");
            if (cfg.supabaseAnon.includes("service_role")) {
              setLog(cfglog, "❌ DANGER: This looks like a service_role key! Only use anon key here.");
              return;
            }
          }

          saveCfg(cfg);
          supabaseClient = null;
          setLog(cfglog, "✅ Config saved! Close and test backend.");
          log(syslog, "Config saved.");
          updateChips();
          setTimeout(closeModal, 800);
        });
      }

      if (btnReset) {
        btnReset.addEventListener("click", () => {
          if (!confirm("Reset config? This will clear Supabase + API_BASE + MOOD (conversation_id stays).")) return;
          resetCfg();
          supabaseClient = null;
          currentUser = null;
          setLog(cfglog, "✅ Config reset.");
          log(syslog, "Config reset.");
          updateChips();
          if (sbUrl) sbUrl.value = "";
          if (sbAnon) sbAnon.value = "";
          if (apiBase) apiBase.value = "";
          if (mood) mood.value = "auto";
        });
      }

      function ensureSupabase() {
        const cfg = getCfg();
        if (!cfg.supabaseUrl || !cfg.supabaseAnon) {
          log(syslog, "⚠️ Supabase not configured. Open Settings.");
          if (chipSb) chipSb.classList.add("bad");
          return null;
        }
        if (!window.supabase) {
          log(syslog, "❌ Supabase SDK not loaded (CDN issue).");
          return null;
        }
        if (!supabaseClient) {
          try {
            supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnon, {
              auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
            log(syslog, "✅ Supabase client initialized.");
          } catch (e) {
            log(syslog, "❌ Supabase init error: " + safeText(e?.message || e));
            return null;
          }
        }
        return supabaseClient;
      }

      async function readUser() {
        const sb = ensureSupabase();
        if (!sb) return null;
        try {
          const { data, error } = await sb.auth.getUser();
          if (error) throw error;
          currentUser = data?.user || null;
          updateChips();
          if (currentUser) log(syslog, "✅ Signed in as: " + safeText(currentUser.email));
          return currentUser;
        } catch (e) {
          log(syslog, "Auth check error: " + safeText(e?.message || e));
          currentUser = null;
          updateChips();
          return null;
        }
      }

      async function magicLinkLogin() {
        const sb = ensureSupabase();
        if (!sb) { openModal(); return; }

        const email = window.prompt("Enter your email for Magic Link login:");
        if (!email || !email.includes("@")) { if (email) alert("Invalid email format"); return; }

        try {
          log(syslog, "📧 Sending magic link to: " + safeText(email));
          const redirectTo = window.location.href.split("?")[0].split("#")[0];
          const { error } = await sb.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: redirectTo }
          });
          if (error) throw error;
          log(syslog, "✅ Magic link sent! Check your email inbox.");
          alert("✅ Magic link sent!\n\nCheck your email and click the link.\nMake sure to open it in THIS browser.");
        } catch (e) {
          log(syslog, "❌ Login error: " + safeText(e?.message || e));
          alert("Login failed: " + safeText(e?.message || e));
        }
      }

      async function logout() {
        const sb = ensureSupabase();
        if (!sb) return;
        try {
          await sb.auth.signOut();
          currentUser = null;
          log(syslog, "✅ Signed out.");
          updateChips();
        } catch (e) {
          log(syslog, "Sign out error: " + safeText(e?.message || e));
        }
      }

      if (btnConnect) {
        btnConnect.addEventListener("click", async () => {
          const cfg = getCfg();
          if (!cfg.supabaseUrl || !cfg.supabaseAnon) { openModal(); return; }
          await magicLinkLogin();
        });
      }
      if (btnLogout) btnLogout.addEventListener("click", logout);

      async function testBackend() {
        const cfg = getCfg();
        if (!cfg.apiBase) {
          log(syslog, "⚠️ API_BASE not set. Open Settings.");
          if (chipApi) chipApi.classList.add("bad");
          openModal();
          return;
        }
        const url = cfg.apiBase + "/api/health";
        const { ctrl, done } = withTimeout(10000);
        try {
          log(syslog, "🔍 Testing: " + safeText(url));
          const res = await fetch(url, { method: "GET", signal: ctrl.signal, cache: "no-store" });
          done();
          const text = await res.text();
          if (!res.ok) {
            if (chipApi) { chipApi.classList.add("bad"); chipApi.classList.remove("ok"); }
            log(syslog, "❌ Backend error: HTTP " + res.status + " — " + safeText(text.substring(0, 200)));
            alert("Backend Error\nHTTP " + res.status + "\n\nCheck CORS settings and backend route.");
            return;
          }
          if (chipApi) { chipApi.classList.add("ok"); chipApi.classList.remove("bad"); }
          log(syslog, "✅ Backend OK: " + safeText(text.substring(0, 150)));
          alert("✅ Backend is online!\n\n" + safeText(text.substring(0, 200)));
        } catch (e) {
          done();
          if (chipApi) { chipApi.classList.add("bad"); chipApi.classList.remove("ok"); }
          const errType = extractErrorType(e);
          log(syslog, "❌ Backend test failed: " + errType + " - " + safeText(e?.message || e));
          alert("Backend Test Failed\n\n" + errType + "\n\nCommon causes:\n• CORS not configured\n• Wrong API_BASE URL\n• Backend offline");
        }
      }
      if (btnTest) btnTest.addEventListener("click", testBackend);

      function loadChat() {
        if (!msgs) return;
        try {
          const raw = localStorage.getItem(KEY.CHAT);
          if (!raw) return;
          const arr = JSON.parse(raw);
          msgs.innerHTML = "";
          arr.forEach(m => addMsg(m.role, m.content, false));
          msgs.scrollTop = msgs.scrollHeight;
        } catch (e) {
          console.warn("Chat load error:", e);
        }
      }

      function saveChat() {
        if (!msgs) return;
        try {
          const items = [...msgs.querySelectorAll(".bubble")].map(b => {
            const role = b.classList.contains("me") ? "user" : "assistant";
            const text = b.textContent || "";
            return { role, content: text };
          });
          localStorage.setItem(KEY.CHAT, JSON.stringify(items.slice(-CHAT_HISTORY_LIMIT)));
        } catch (e) {
          console.warn("Chat save error:", e);
        }
      }

      function addMsg(role, content, persist = true) {
        if (!msgs) return;
        const div = document.createElement("div");
        div.className = "bubble " + (role === "user" ? "me" : "ai");

        const imageUrlMatch = String(content).match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)/i);
        if (imageUrlMatch && isValidImageUrl(imageUrlMatch[0])) {
          const parts = String(content).split(imageUrlMatch[0]);
          if (parts[0].trim()) div.textContent = parts[0].trim();
          const img = document.createElement("img");
          img.src = imageUrlMatch[0];
          img.alt = "Generated image";
          img.loading = "lazy";
          div.appendChild(img);
          if (parts[1] && parts[1].trim()) {
            const textNode = document.createTextNode("\n" + parts[1].trim());
            div.appendChild(textNode);
          }
        } else {
          div.textContent = String(content);
        }

        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
        if (persist) saveChat();
      }

      function showTyping() {
        if (!msgs) return;
        hideTyping();
        const typing = document.createElement("div");
        typing.className = "typing";
        typing.id = "typing";
        typing.textContent = "⏳ typing...";
        msgs.appendChild(typing);
        msgs.scrollTop = msgs.scrollHeight;
      }

      function hideTyping() {
        const typing = document.getElementById("typing");
        if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      }

      function extractResponse(data) {
        if (!data) return "(empty)";
        if (data?.text) return String(data.text);
        if (data?.reply) return String(data.reply);
        if (data?.message) return String(data.message);
        if (data?.output) return String(data.output);
        if (data?.data?.text) return String(data.data.text);
        if (data?.choices?.[0]?.message?.content) return String(data.choices[0].message.content);
        if (Array.isArray(data?.content) && data.content[0]?.text) return String(data.content[0].text);
        if (data?.imageUrl && isValidImageUrl(data.imageUrl)) return "Generated image:\n" + data.imageUrl;
        if (Array.isArray(data?.images) && data.images.length > 0) {
          return "Generated images:\n" + data.images.filter(isValidImageUrl).join("\n");
        }
        return JSON.stringify(data, null, 2);
      }

      function buildChatContext() {
        if (!msgs) return [];
        const bubbles = [...msgs.querySelectorAll(".bubble")];
        const recent = bubbles.slice(-CHAT_CONTEXT_TURNS * 2);
        return recent.map(b => ({
          role: b.classList.contains("me") ? "user" : "assistant",
          content: (b.textContent || "").trim()
        })).filter(m => m.content);
      }

      function setStatus(text, type = "idle") {
        if (!chatStatus) return;
        const colors = {
          idle: "rgba(255,255,255,.70)",
          sending: "var(--cyan)",
          success: "var(--ok)",
          error: "var(--danger)"
        };
        chatStatus.innerHTML = '<span style="color:' + colors[type] + '">' + safeText(text) + '</span>';
      }

      async function sendChat() {
        if (isSending || !msgs || !prompt || !btnSend) return;
        const cfg = getCfg();
        const text = (prompt.value || "").trim();
        if (!text) return;

        if (!cfg.apiBase) {
          addMsg("assistant", "❌ API_BASE არ არის დაყენებული.\n\nგახსენი Settings და ჩასვი backend domain.");
          openModal();
          return;
        }

        isSending = true;
        addMsg("user", text);
        prompt.value = "";
        setStatus("Status: sending...", "sending");
        btnSend.disabled = true;
        showTyping();

        const url = cfg.apiBase + "/api/ai";
        const context = buildChatContext();

        const payload = {
          message: text,
          messages: context.length > 0 ? context : undefined,
          client: "AvatarG-Workspace-v3",
          user: currentUser?.email || null,
          mood: cfg.mood || "auto",
          conversation_id: cfg.conversationId || null,
          timestamp: new Date().toISOString()
        };

        const { ctrl, done } = withTimeout(30000);

        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal
          });

          done();
          hideTyping();

          const contentType = res.headers.get("content-type") || "";
          let responseText = "";

          if (contentType.includes("application/json")) {
            const data = await res.json();
            if (!res.ok) {
              const errMsg = data?.error || data?.message || ("HTTP " + res.status);
              responseText = "❌ Backend Error:\n" + safeText(errMsg);
              if (data?.hint) responseText += "\n\nHint: " + safeText(data.hint);
              setStatus("Status: error", "error");
            } else {
              responseText = extractResponse(data);
              setStatus("Status: success ✓", "success");
            }
          } else {
            const txt = await res.text();
            if (!res.ok) {
              responseText = "❌ Backend Error (HTTP " + res.status + "):\n" + safeText(txt.substring(0, 500));
              setStatus("Status: error", "error");
            } else {
              responseText = txt || "(empty response)";
              setStatus("Status: success ✓", "success");
            }
          }

          addMsg("assistant", responseText);
        } catch (e) {
          done();
          hideTyping();
          const errType = extractErrorType(e);
          const errMsg = e?.message || String(e);
          addMsg("assistant",
            "❌ " + errType + "\n\n" + safeText(errMsg) +
            "\n\nშესაძლო მიზეზები:\n• Backend offline-ია\n• CORS არ არის configured\n• Route არ არსებობს (/api/ai)\n• Timeout (ძალიან გრძელი პროცესი)"
          );
          setStatus("Status: failed", "error");
        } finally {
          isSending = false;
          if (btnSend) btnSend.disabled = false;
        }
      }

      if (prompt) {
        prompt.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChat();
          }
        });
      }
      if (btnSend) btnSend.addEventListener("click", sendChat);

      if (btnClear) {
        btnClear.addEventListener("click", () => {
          if (!confirm("Clear all chat history? This cannot be undone.")) return;
          localStorage.removeItem(KEY.CHAT);
          if (msgs) msgs.innerHTML = '<div class="bubble ai">✅ Chat history cleared.</div>';
          log(syslog, "Chat cleared.");
        });
      }

      (async function init() {
        setLog(syslog, "[boot] Avatar G Workspace loaded");

        // conversation_id: create once
        const cfg0 = getCfg();
        if (!cfg0.conversationId) {
          const newId = uuidv4();
          localStorage.setItem(KEY.CONV_ID, newId);
          log(syslog, "✅ conversation_id created: " + newId.slice(0, 8) + "…");
        }

        updateChips();
        loadChat();

        const cfg = getCfg();

        if (cfg.supabaseUrl && cfg.supabaseAnon) {
          ensureSupabase();
          await readUser();

          if (supabaseClient && supabaseClient.auth && supabaseClient.auth.onAuthStateChange) {
            supabaseClient.auth.onAuthStateChange(async (event, session) => {
              console.log("[auth]", event, session?.user?.email);
              currentUser = session?.user || null;
              updateChips();
              if (event === "SIGNED_IN" && currentUser) {
                log(syslog, "✅ Auth: Signed in as " + safeText(currentUser.email));
              } else if (event === "SIGNED_OUT") {
                log(syslog, "✅ Auth: Signed out");
              }
            });
          }
        } else {
          if (!localStorage.getItem(KEY.SEEN_CFG_HINT)) {
            log(syslog, "⚠️ Supabase not configured. Open Settings to connect.");
            localStorage.setItem(KEY.SEEN_CFG_HINT, "1");
          }
        }

        if (cfg.apiBase) log(syslog, "✅ API_BASE loaded: " + safeText(cfg.apiBase));
        else log(syslog, "⚠️ API_BASE not set. Open Settings.");

        log(syslog, "✅ Mood preset: " + (cfg.mood || "auto"));
        log(syslog, "✅ Ready. Test backend or start chatting!");
        setStatus("Status: idle", "idle");
      })();
    })();
  </script>
</body>
</html>
