/* ax-kit.js: AI Expert's drawing engines (the parts Python is too slow or clumsy for). window.AX:
     AX.today()                the browser's local date, YYYY-MM-DD (streaks and due dates follow the member's day)
     AX.fmtDate(iso, style)    'short' (6 Nov 2026), 'long' (6 November 2026), 'month', 'time'
     AX.weekday(day)           'M', 'T', ...
     AX.verifyUrl(code)        the public verification address of a credential
     AX.seal(size, label)      the verification stamp (SVG string): a hexagon with the AX mark
     AX.ring(pct, size, label) a progress ring (SVG string)
     AX.confetti()             a short burst of paper squares (skipped under reduced motion)
     AX.cert(c)                the 1000x707 certificate; c = {holder, credential, code, issued, status, demo, modules, track}
     AX.fitCert(wrap)          scale a certificate to its wrapper; returns a cleanup function
     AX.fig(name, opts)        a technical schematic (SVG string) for a program: tokens, context, rag, agents, evals,
                               security, ops, architect. Colours come from CSS variables, so it themes itself.
     AX.pipeline(el)           the landing hero: DEMO vs PRODUCTION pipelines with a drag handle (before/after)
   Python reaches these through client_code/ax.py and the Certificate / Seal / Ring / Hero / Pipeline components. */
(function () {
  'use strict';
  var AX = window.AX = window.AX || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  AX.today = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  AX.fmtDate = function (iso, style) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    if (isNaN(d.getTime())) return '';
    if (style === 'time') return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    var opts = style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'month' ? { month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' };
    return d.toLocaleDateString(undefined, opts);
  };
  AX.weekday = function (day) { return 'SMTWTFS'[new Date(day + 'T12:00:00').getDay()]; };
  AX.verifyUrl = function (code) { return location.origin + location.pathname + '#verify/' + encodeURIComponent(code); };

  /* ---------------------------------------------------------------- the stamp */
  AX.seal = function (size, label) {
    var s = size || 120, id = 'sl' + Math.random().toString(36).slice(2, 7);
    var hex = function (r) {
      var p = [];
      for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; p.push((50 + r * Math.cos(a)).toFixed(2) + ',' + (50 + r * Math.sin(a)).toFixed(2)); }
      return p.join(' ');
    };
    return '<svg class="ax-seal" width="' + s + '" height="' + s + '" viewBox="0 0 100 100" role="img" aria-label="AI Expert verification stamp">' +
      '<defs><path id="' + id + '" d="M50 50m-33 0a33 33 0 1 1 66 0a33 33 0 1 1-66 0"/></defs>' +
      '<polygon points="' + hex(48) + '" fill="var(--seal-bg, #0B6E5B)"/>' +
      '<polygon points="' + hex(43.5) + '" fill="none" stroke="var(--seal-ink, #fff)" stroke-width=".9" opacity=".75"/>' +
      '<text font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700" font-size="6.4" letter-spacing="1.2" fill="var(--seal-ink, #fff)"><textPath href="#' + id + '" startOffset="0">' +
      esc(label || 'AI EXPERT · VERIFIED · PRODUCTION GRADE ·') + '</textPath></text>' +
      '<g fill="none" stroke="var(--seal-ink, #fff)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M37 61 46 37h1.5L56 61M40.5 53h12"/><path d="M58 38l9 23M67 38l-9 23"/></g>' +
      '<circle cx="50" cy="73" r="1.6" fill="var(--seal-accent, #E4572E)"/></svg>';
  };

  AX.ring = function (pct, size, label) {
    var s = size || 64, r = s / 2 - 5, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    return '<span class="ax-ring" style="width:' + s + 'px;height:' + s + 'px" role="img" aria-label="' + p + '% complete"><svg width="' + s + '" height="' + s + '" aria-hidden="true">' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="var(--c-surface-2)" stroke-width="5"/>' +
      '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="var(--c-brand)" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (c * p / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + s / 2 + ' ' + s / 2 + ')"/></svg>' +
      '<b aria-hidden="true">' + esc(label != null && label !== '' ? label : p + '%') + '</b></span>';
  };

  AX.confetti = function () {
    if (reduced()) return;
    var box = document.createElement('div'); box.className = 'ax-confetti'; box.setAttribute('aria-hidden', 'true');
    var cols = ['#0B6E5B', '#E4572E', '#12161C', '#8FD3BF', '#F2B8A6'];
    for (var i = 0; i < 64; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = cols[i % cols.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      p.style.animationDelay = (Math.random() * .35) + 's';
      p.style.transform = 'rotate(' + Math.random() * 180 + 'deg)';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3800);
  };

  /* ---------------------------------------------------------------- schematics */
  /* A diagram spec: nodes [id, x, y, w, label, kind] on a 400x220 grid, edges [from, to, dashed?].
     kind: '' (plain box), 'b' (brand: the step that makes it production-grade), 'a' (accent: risk/gate), 'g' (ghost/data) */
  var FIGS = {
    tokens: { cap: 'Tokens in, tokens out: the meter on every call', n: [
      ['p', 10, 30, 110, 'system prompt', 'g'], ['h', 10, 80, 110, 'history', 'g'], ['r', 10, 130, 110, 'retrieved text', 'g'], ['t', 10, 180, 110, 'tool results', 'g'],
      ['w', 160, 80, 100, 'context window', 'b'], ['m', 160, 150, 100, 'model', ''], ['o', 300, 115, 90, 'output', 'a']],
      e: [['p', 'w'], ['h', 'w'], ['r', 'w'], ['t', 'w'], ['w', 'm'], ['m', 'o']] },
    context: { cap: 'Right information, right shape, right moment', n: [
      ['u', 10, 20, 100, 'user state', 'g'], ['d', 10, 75, 100, 'retrieval', 'g'], ['n', 10, 130, 100, 'notes / memory', 'g'], ['k', 10, 185, 100, 'tools', 'g'],
      ['b', 150, 100, 100, 'context builder', 'b'], ['c', 290, 60, 100, 'compaction', ''], ['m', 290, 140, 100, 'model call', '']],
      e: [['u', 'b'], ['d', 'b'], ['n', 'b'], ['k', 'b'], ['b', 'm'], ['m', 'c', 1], ['c', 'b', 1]] },
    rag: { cap: 'Rewrite, retrieve wide, fuse, rerank, measure', n: [
      ['q', 5, 100, 70, 'query', 'g'], ['w', 90, 100, 70, 'rewrite', 'b'], ['k', 175, 50, 70, 'BM25', ''], ['v', 175, 150, 70, 'vectors', ''],
      ['f', 260, 100, 60, 'RRF', 'b'], ['r', 335, 100, 60, 'rerank', 'b'], ['e', 260, 190, 135, 'retrieval evals', 'a']],
      e: [['q', 'w'], ['w', 'k'], ['w', 'v'], ['k', 'f'], ['v', 'f'], ['f', 'r'], ['r', 'e', 1]] },
    agents: { cap: 'Scoped tools, explicit state, a human at the gate', n: [
      ['s', 10, 100, 80, 'state', 'b'], ['p', 120, 40, 80, 'plan', ''], ['t', 120, 160, 80, 'tool call', ''],
      ['c', 230, 100, 80, 'checkpoint', 'b'], ['h', 320, 40, 75, 'approve?', 'a'], ['x', 320, 160, 75, 'act', '']],
      e: [['s', 'p'], ['p', 't'], ['t', 'c'], ['c', 's', 1], ['c', 'h'], ['h', 'x']] },
    evals: { cap: 'Look at data, name failures, test, calibrate, watch', n: [
      ['t', 10, 30, 100, 'traces', 'g'], ['a', 10, 100, 100, 'error analysis', 'b'], ['s', 150, 30, 100, 'eval set', ''],
      ['c', 150, 100, 100, 'code checks', ''], ['j', 150, 170, 100, 'LLM judge', 'a'], ['g', 290, 100, 100, 'CI gate', 'b']],
      e: [['t', 'a'], ['a', 's'], ['a', 'c'], ['a', 'j'], ['s', 'g'], ['c', 'g'], ['j', 'g']] },
    security: { cap: 'Break one leg of the lethal trifecta', n: [
      ['d', 20, 30, 110, 'private data', 'g'], ['u', 20, 170, 110, 'untrusted content', 'a'], ['o', 270, 100, 110, 'outbound channel', 'g'],
      ['m', 150, 100, 90, 'agent', ''], ['x', 270, 30, 110, 'human approval', 'b']],
      e: [['d', 'm'], ['u', 'm'], ['m', 'o', 1], ['m', 'x']] },
    ops: { cap: 'Route, retry, fall back, cache, observe', n: [
      ['r', 10, 100, 80, 'request', 'g'], ['c', 110, 40, 80, 'cache', ''], ['o', 110, 160, 80, 'router', 'b'],
      ['s', 220, 120, 80, 'small model', ''], ['l', 220, 190, 80, 'large model', ''], ['f', 320, 150, 75, 'fallback', 'a'], ['t', 220, 40, 175, 'tracing + budgets', 'b']],
      e: [['r', 'c'], ['r', 'o'], ['o', 's'], ['o', 'l'], ['l', 'f', 1], ['c', 't', 1]] },
    architect: { cap: 'The whole system, measured end to end', n: [
      ['i', 10, 30, 90, 'ingest', 'g'], ['x', 10, 110, 90, 'index', ''], ['r', 125, 70, 90, 'retrieve', 'b'], ['a', 240, 70, 80, 'agent', ''],
      ['g', 340, 70, 55, 'guard', 'a'], ['e', 125, 170, 270, 'evals · traces · cost', 'b']],
      e: [['i', 'x'], ['x', 'r'], ['r', 'a'], ['a', 'g'], ['r', 'e', 1], ['a', 'e', 1]] },
  };
  function renderFig(spec, opts) {
    opts = opts || {};
    var H = 26, byId = {}, out = '';
    spec.n.forEach(function (n) { byId[n[0]] = n; });
    var mid = function (n) { return [n[1] + n[3] / 2, n[2] + H / 2]; };
    var aid = 'ar' + Math.random().toString(36).slice(2, 7);
    out += '<defs><marker id="' + aid + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" fill="var(--fig-line)"/></marker></defs>';
    spec.e.forEach(function (e) {
      var a = byId[e[0]], b = byId[e[1]];
      if (!a || !b) return;
      var p = mid(a), q = mid(b), x1, y1, x2, y2;
      if (Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]) * 1.2) {
        x1 = p[0] < q[0] ? a[1] + a[3] : a[1]; y1 = p[1]; x2 = p[0] < q[0] ? b[1] : b[1] + b[3]; y2 = q[1];
      } else {
        x1 = p[0]; y1 = p[1] < q[1] ? a[2] + H : a[2]; x2 = q[0]; y2 = p[1] < q[1] ? b[2] : b[2] + H;
      }
      var cx = (x1 + x2) / 2;
      var d = Math.abs(y2 - y1) < 2 || Math.abs(x2 - x1) < 2 ? 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2
        : (Math.abs(x2 - x1) > Math.abs(y2 - y1) ? 'M' + x1 + ' ' + y1 + 'C' + cx + ' ' + y1 + ' ' + cx + ' ' + y2 + ' ' + x2 + ' ' + y2
          : 'M' + x1 + ' ' + y1 + 'C' + x1 + ' ' + (y1 + y2) / 2 + ' ' + x2 + ' ' + (y1 + y2) / 2 + ' ' + x2 + ' ' + y2);
      out += '<path class="fe" d="' + d + '" fill="none" stroke="var(--fig-line)" stroke-width="1.3"' + (e[2] ? ' stroke-dasharray="4 3"' : '') + ' marker-end="url(#' + aid + ')"/>';
    });
    spec.n.forEach(function (n) {
      var k = n[5] || '';
      out += '<g class="fn' + (k ? ' k-' + k : '') + '"><rect x="' + n[1] + '" y="' + n[2] + '" width="' + n[3] + '" height="' + H + '" rx="5"/>' +
        '<text x="' + (n[1] + n[3] / 2) + '" y="' + (n[2] + 17) + '" text-anchor="middle">' + esc(n[4]) + '</text></g>';
    });
    var title = opts.title || spec.cap;
    return '<svg class="ax-fig" viewBox="0 0 400 225" role="img" aria-label="' + esc(title) + '">' + out + '</svg>';
  }
  AX.fig = function (name, opts) { return renderFig(FIGS[name] || FIGS.architect, opts); };
  AX.figCaption = function (name) { return (FIGS[name] || FIGS.architect).cap; };

  /* ---------------------------------------------------------------- the landing hero: demo vs production */
  var DEMO = { n: [
    ['a', 8, 96, 74, 'docs', 'g'], ['b', 98, 96, 74, 'chunk', ''], ['c', 188, 96, 74, 'embed', ''], ['d', 278, 96, 74, 'vector DB', ''],
    ['e', 368, 96, 74, 'LLM', ''], ['f', 458, 96, 74, 'answer?', 'a']],
    e: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f']] };
  var PROD = { n: [
    ['q', 8, 96, 74, 'query', 'g'], ['w', 98, 96, 74, 'rewrite', 'b'], ['k', 188, 40, 74, 'BM25', ''], ['v', 188, 152, 74, 'vectors', ''],
    ['f', 278, 96, 74, 'RRF fuse', 'b'], ['r', 368, 96, 74, 'rerank', 'b'], ['g', 458, 40, 74, 'eval gate', 'a'], ['o', 458, 152, 74, 'cited answer', 'b'],
    ['t', 188, 8, 254, 'traces · recall@k · cost per answer', 'g']],
    e: [['q', 'w'], ['w', 'k'], ['w', 'v'], ['k', 'f'], ['v', 'f'], ['f', 'r'], ['r', 'g'], ['g', 'o']] };
  function wide(spec, label) {
    var svg = renderFig(spec, { title: label });
    return svg.replace('viewBox="0 0 400 225"', 'viewBox="0 0 540 200"');
  }
  AX.pipeline = function (el) {
    if (!el) return function () {};
    el.innerHTML =
      '<div class="pl-frame">' +
      '<div class="pl-layer pl-demo"><span class="pl-tag">DEMO</span>' + wide(DEMO, 'Demo pipeline: docs, chunk, embed, vector database, LLM, answer') +
      '<p class="pl-note">Works in the video. Fails on part numbers, follow-ups and the questions nobody tested.</p></div>' +
      '<div class="pl-layer pl-prod"><span class="pl-tag">PRODUCTION</span>' + wide(PROD, 'Production pipeline: query rewrite, BM25 and vectors, rank fusion, rerank, eval gate, cited answer, with tracing') +
      '<p class="pl-note">Rewrite the query, search two ways, fuse, rerank, measure, cite. Then trace every request.</p></div>' +
      '<div class="pl-handle" role="slider" tabindex="0" aria-label="Compare demo and production" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span></span></div>' +
      '</div>';
    var frame = el.querySelector('.pl-frame'), prod = el.querySelector('.pl-prod'), handle = el.querySelector('.pl-handle');
    var pos = 50, dragging = false;
    function set(p, animate) {
      pos = Math.max(0, Math.min(100, p));
      frame.classList.toggle('animate', !!animate);
      prod.style.clipPath = 'inset(0 0 0 ' + pos + '%)';
      handle.style.left = pos + '%';
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
      handle.setAttribute('aria-valuetext', pos > 60 ? 'Mostly demo' : pos < 40 ? 'Mostly production' : 'Half and half');
    }
    function fromEvent(e) {
      var r = frame.getBoundingClientRect();
      return (e.clientX - r.left) / r.width * 100;
    }
    function down(e) { dragging = true; frame.setPointerCapture && frame.setPointerCapture(e.pointerId); set(fromEvent(e), false); }
    function move(e) { if (dragging) set(fromEvent(e), false); }
    function up() { dragging = false; }
    function key(e) {
      if (e.key === 'ArrowLeft') { set(pos - 5, true); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { set(pos + 5, true); e.preventDefault(); }
      else if (e.key === 'Home') { set(0, true); e.preventDefault(); }
      else if (e.key === 'End') { set(100, true); e.preventDefault(); }
    }
    frame.addEventListener('pointerdown', down);
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    handle.addEventListener('keydown', key);
    // The authored moment: start on the demo, then sweep to reveal most of production.
    set(96, false);
    var t = setTimeout(function () { set(reduced() ? 50 : 34, !reduced()); frame.classList.add('shown'); }, 450);
    return function () {
      clearTimeout(t);
      frame.removeEventListener('pointerdown', down);
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerup', up);
      frame.removeEventListener('pointercancel', up);
      handle.removeEventListener('keydown', key);
    };
  };

  /* ---------------------------------------------------------------- the certificate */
  AX.cert = function (c) {
    var arch = c.track === 'fellow';
    var issued = c.issued ? new Date(c.issued).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var mods = c.modules || [];
    var grid = '';
    for (var x = 40; x < 1000; x += 40) grid += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="707"/>';
    for (var y = 40; y < 707; y += 40) grid += '<line x1="0" y1="' + y + '" x2="1000" y2="' + y + '"/>';
    return '<div class="ax-cert' + (arch ? ' arch' : '') + '" data-cert>' +
      '<svg class="grid" viewBox="0 0 1000 707" aria-hidden="true"><g>' + grid + '</g></svg>' +
      '<div class="frame"></div>' +
      (c.demo ? '<div class="sample">SAMPLE RECORD</div>' : '') +
      '<div class="inner">' +
      '<div class="top"><div class="mark">' + AX.seal(64) + '</div><div><div class="inst">AI EXPERT</div><div class="sub">' +
      (arch ? 'ARCHITECT CREDENTIAL' : 'PROGRAM CERTIFICATE') + ' · SHEET 1 OF 1</div></div>' +
      '<div class="docno">DOC. ' + esc(c.code) + '</div></div>' +
      '<div class="certify">This certifies that</div>' +
      '<div class="holder">' + esc(c.holder) + '</div>' +
      '<div class="has">' + (arch ? 'holds the LLM Foundations certificate and three specialist certificates, and is recognised as' :
        'completed every module, drill and challenge of the program and passed its final examination for the') + '</div>' +
      '<div class="cred">' + esc(c.credential) + '</div>' +
      (mods.length ? '<div class="mods">' + mods.map(function (m, i) { return '<span><b>' + String(i + 1).padStart(2, '0') + '</b> ' + esc(m) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="bottom"><div class="cell"><span>ISSUED</span><b>' + esc(issued) + '</b></div>' +
      '<div class="cell"><span>CREDENTIAL ID</span><b>' + esc(c.code) + '</b></div>' +
      '<div class="cell"><span>VERIFY</span><b>AI Expert register, #verify</b></div>' +
      '<div class="stampbox">' + AX.seal(110) + '</div></div>' +
      '</div>' + (c.status === 'revoked' ? '<div class="stamp">REVOKED</div>' : '') + '</div>';
  };
  AX.fitCert = function (wrap) {
    function fit() {
      var cert = wrap.querySelector('[data-cert]');
      if (!cert) return;
      var w = wrap.clientWidth || 1000, s = Math.min(1, w / 1000);
      cert.style.transform = 'scale(' + s + ')';
      wrap.style.height = Math.ceil(707 * s) + 'px';
    }
    fit();
    var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(wrap);
    window.addEventListener('resize', fit);
    setTimeout(fit, 60);
    return function () { window.removeEventListener('resize', fit); if (ro) ro.disconnect(); };
  };
})();
