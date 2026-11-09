/* ax-labs.js: the four hands-on labs (they run entirely in the browser; nothing is sent anywhere).
   AX.lab(el, id, onDone)  mounts lab `id` ('cost' | 'chunk' | 'retrieval' | 'judge') into el and returns a destroy function.
                            onDone(score, detailJson) is called when the learner reaches the lab's goal (once per mount).
   AX.labTest              pure functions for tests (bm25, rrf, metrics, chunker, kappa, cost model).
   Python wraps it in Components/LabStage. */
(function () {
  'use strict';
  var AX = window.AX = window.AX || {};
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  var uid = 0;
  function id(p) { uid += 1; return 'lab-' + p + '-' + uid; }

  /* ================================================================ cost */
  var COST0 = { req: 40000, sys: 1200, ctx: 3000, out: 700, cache: 0, batch: 0, small: 0,
                pin: 3, pout: 15, sin: 0.8, sout: 4, budget: 9000, tps: 60 };
  function costModel(s) {
    var days = 30, n = s.req * days;
    var inTok = (s.sys + s.ctx) * n, outTok = s.out * n;
    var cachedShare = s.cache ? s.sys / (s.sys + s.ctx) : 0;        // the system prompt prefix is cacheable
    var effIn = inTok * ((1 - cachedShare) + cachedShare * 0.1);     // cached reads at ~10% of the input price
    var bigShare = 1 - s.small / 100;
    var priceIn = bigShare * s.pin + (1 - bigShare) * s.sin, priceOut = bigShare * s.pout + (1 - bigShare) * s.sout;
    var input = effIn / 1e6 * priceIn, output = outTok / 1e6 * priceOut;
    var batchCut = s.batch / 100 * 0.5;                              // batch APIs are typically ~50% off
    input *= 1 - batchCut; output *= 1 - batchCut;
    return { input: input, output: output, total: input + output, inTok: inTok, outTok: outTok,
             latency: s.out / s.tps, cachedShare: cachedShare };
  }
  function labCost(el, done) {
    var s = JSON.parse(JSON.stringify(COST0)), fired = false;
    var sliders = [
      ['out', 'Output tokens per summary', 80, 900, 10, 'Shorter, structured summaries'],
      ['cache', 'Cache the system prompt', 0, 1, 1, 'Prompt caching of the stable 1,200-token prefix'],
      ['batch', 'Share sent through a batch API', 0, 100, 5, 'Summaries can wait until tomorrow'],
      ['small', 'Share routed to a small model', 0, 100, 5, 'Only if your evals say quality holds'],
    ];
    var prices = [['pin', 'Large model, input $/M'], ['pout', 'Large model, output $/M'], ['sin', 'Small model, input $/M'], ['sout', 'Small model, output $/M']];
    var h = '<div class="lab lab-cost"><div class="lab-brief"><b>The feature:</b> summarise every closed support conversation. ' +
      num(s.req) + ' conversations a day, a ' + num(s.sys) + '-token system prompt and about ' + num(s.ctx) + ' tokens of conversation each. ' +
      '<b>Budget:</b> ' + money(s.budget) + ' a month. Traffic stays the same: change the design.</div><div class="lab-cols"><div class="lab-ctl">';
    sliders.forEach(function (x) {
      var i = id(x[0]);
      if (x[3] === 1 && x[2] === 0 && x[3] === 1) {}
      if (x[0] === 'cache') {
        h += '<label class="lab-tog" for="' + i + '"><input type="checkbox" id="' + i + '" data-k="cache"> <span><b>' + x[1] + '</b><small>' + x[5] + '</small></span></label>';
      } else {
        h += '<div class="lab-sl"><label for="' + i + '"><b>' + x[1] + '</b><small>' + x[5] + '</small></label>' +
          '<div class="row"><input type="range" id="' + i + '" min="' + x[2] + '" max="' + x[3] + '" step="' + x[4] + '" value="' + s[x[0]] + '" data-k="' + x[0] + '"><output data-o="' + x[0] + '"></output></div></div>';
      }
    });
    h += '<details class="lab-prices"><summary>Example prices (edit to match your provider)</summary><div class="grid">';
    prices.forEach(function (p) {
      var i = id(p[0]);
      h += '<label for="' + i + '">' + p[1] + '<input type="number" id="' + i + '" min="0" step="0.05" value="' + s[p[0]] + '" data-k="' + p[0] + '"></label>';
    });
    h += '</div><p class="small muted">Cached input is billed at about 10% and batch at about 50% off, as many providers do. Check your provider’s current prices.</p></details></div>' +
      '<div class="lab-out"><div class="lab-big"><span>Monthly cost</span><b data-r="total"></b><small data-r="vs"></small></div>' +
      '<div class="lab-bar" aria-hidden="true"><i data-r="bin"></i><i data-r="bout"></i><s data-r="bud"></s></div>' +
      '<dl class="lab-dl"><div><dt>Input tokens / month</dt><dd data-r="intok"></dd></div><div><dt>Output tokens / month</dt><dd data-r="outtok"></dd></div>' +
      '<div><dt>Input cost</dt><dd data-r="incost"></dd></div><div><dt>Output cost</dt><dd data-r="outcost"></dd></div>' +
      '<div><dt>Time to write one summary</dt><dd data-r="lat"></dd></div></dl>' +
      '<p class="lab-verdict" data-r="verdict" role="status"></p></div></div></div>';
    el.innerHTML = h;
    function q(sel) { return el.querySelector(sel); }
    function draw() {
      var r = costModel(s), base = costModel(COST0);
      q('[data-r=total]').textContent = money(r.total);
      q('[data-r=vs]').textContent = 'Started at ' + money(base.total) + ' · budget ' + money(s.budget);
      var max = Math.max(base.total, r.total, s.budget);
      q('[data-r=bin]').style.width = (r.input / max * 100) + '%';
      q('[data-r=bout]').style.width = (r.output / max * 100) + '%';
      q('[data-r=bud]').style.left = (s.budget / max * 100) + '%';
      q('[data-r=intok]').textContent = num(r.inTok / 1e6) + 'M';
      q('[data-r=outtok]').textContent = num(r.outTok / 1e6) + 'M';
      q('[data-r=incost]').textContent = money(r.input);
      q('[data-r=outcost]').textContent = money(r.output);
      q('[data-r=lat]').textContent = '~' + (Math.round(r.latency * 10) / 10) + ' s at ' + s.tps + ' tokens/s';
      sliders.forEach(function (x) { var o = q('[data-o=' + x[0] + ']'); if (o) o.textContent = x[0] === 'out' ? s.out + ' tok' : s[x[0]] + '%'; });
      var ok = r.total <= s.budget;
      var v = q('[data-r=verdict]');
      v.className = 'lab-verdict ' + (ok ? 'ok' : '');
      v.textContent = ok ? 'Under budget by ' + money(s.budget - r.total) + '. Notice which levers moved the most: output length and batching usually beat everything else.'
        : 'Over budget by ' + money(r.total - s.budget) + '. Output tokens cost several times more than input: start there.';
      if (ok && !fired && done) { fired = true; done(100, JSON.stringify({ total: Math.round(r.total), out: s.out, cache: !!s.cache, batch: s.batch, small: s.small })); }
    }
    function onInput(e) {
      var k = e.target.getAttribute('data-k');
      if (!k) return;
      s[k] = e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : parseFloat(e.target.value) || 0;
      draw();
    }
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    draw();
    return function () { el.removeEventListener('input', onInput); el.removeEventListener('change', onInput); };
  }

  /* ================================================================ chunk */
  var DOC = [
    ['h1', 'Leave Policy (Canada)'],
    ['h2', 'Vacation'],
    ['p', 'Full-time employees earn 1.25 days of paid vacation for each month worked, up to 15 days in a calendar year.'],
    ['p', 'Unused vacation of up to five days can be carried into the next year. Days above five are paid out in the first pay period of January.'],
    ['p', 'Vacation requests longer than five consecutive working days need approval from your manager at least four weeks in advance.'],
    ['h2', 'Sick leave'],
    ['p', 'Employees receive ten paid sick days a year. Sick days do not carry over and are not paid out when you leave.'],
    ['p', 'For absences longer than three consecutive days, a note from a health professional is required on your return.'],
    ['h2', 'Parental leave'],
    ['h3', 'Eligibility'],
    ['p', 'Employees are eligible for the company top-up after six months of continuous service, whether full-time or part-time.'],
    ['p', 'Part-time employees receive the top-up in proportion to their average weekly hours over the previous six months.'],
    ['h3', 'Top-up amount'],
    ['p', 'The company tops up government benefits to 85% of regular salary for the first 16 weeks of leave.'],
    ['p', 'Employees who leave the company within six months of returning must repay the top-up received.'],
    ['h2', 'Bereavement'],
    ['p', 'Up to five paid days are granted on the death of an immediate family member, and one paid day for extended family.'],
    ['p', 'Bereavement days can be taken within three months of the death and do not need to be consecutive.'],
  ];
  var CHUNK_QS = [
    { q: 'How much is the parental leave top-up for part-time staff?', fact: 'in proportion to their average weekly hours', ctx: 'Parental leave' },
    { q: 'Can I carry vacation days over?', fact: 'can be carried into the next year', ctx: 'Vacation' },
    { q: 'Do I need a doctor’s note when I’m sick?', fact: 'a note from a health professional is required', ctx: 'Sick leave' },
    { q: 'Do I have to repay the parental top-up if I quit?', fact: 'must repay the top-up received', ctx: 'Parental leave' },
  ];
  function chunker(mode, size, overlap, header) {
    // returns [{text, path}] ; size and overlap in words
    var out = [], path = [];
    if (mode === 'structure') {
      var cur = null;
      DOC.forEach(function (b) {
        if (b[0] !== 'p') {
          var lvl = b[0] === 'h1' ? 0 : b[0] === 'h2' ? 1 : 2;
          path = path.slice(0, lvl); path[lvl] = b[1];
          if (cur && cur.body.length) out.push(cur);
          cur = { path: path.filter(Boolean).join(' > '), body: [] };
        } else {
          if (!cur) cur = { path: '', body: [] };
          var words = cur.body.join(' ').split(/\s+/).filter(Boolean).length + b[1].split(/\s+/).length;
          if (cur.body.length && words > size) { out.push(cur); cur = { path: cur.path, body: [] }; }
          cur.body.push(b[1]);
        }
      });
      if (cur && cur.body.length) out.push(cur);
      return out.map(function (c) { return { path: c.path, text: (header && c.path ? '[' + c.path + '] ' : '') + c.body.join(' ') }; });
    }
    // fixed: flatten everything (headings become plain lines) and cut every `size` words
    var words = [], paths = [];
    DOC.forEach(function (b) {
      if (b[0] !== 'p') { var lvl = b[0] === 'h1' ? 0 : b[0] === 'h2' ? 1 : 2; path = path.slice(0, lvl); path[lvl] = b[1]; }
      b[1].split(/\s+/).forEach(function (w) { words.push(w); paths.push(path.filter(Boolean).join(' > ')); });
    });
    var step = Math.max(10, size - overlap);
    for (var i = 0; i < words.length; i += step) {
      var p = paths[Math.min(words.length - 1, i + Math.floor(size / 2))];
      out.push({ path: p, text: (header ? '[' + p + '] ' : '') + words.slice(i, i + size).join(' ') });
      if (i + size >= words.length) break;
    }
    return out;
  }
  function chunkCheck(chunks) {
    return CHUNK_QS.map(function (t) {
      var hit = chunks.filter(function (c) { return c.text.indexOf(t.fact) >= 0; })[0];
      return { q: t.q, whole: !!hit, ctx: !!(hit && hit.text.indexOf(t.ctx) >= 0), chunk: hit ? chunks.indexOf(hit) : -1 };
    });
  }
  function labChunk(el, done) {
    var s = { mode: 'fixed', size: 60, overlap: 0, header: false }, fired = false;
    var a = id('m'), b = id('s'), c = id('o'), d = id('h');
    el.innerHTML = '<div class="lab lab-chunk"><div class="lab-brief"><b>The document:</b> a short leave policy with headings. ' +
      '<b>The goal:</b> every test question’s answer sits whole in one chunk, and that chunk says which section it’s from. ' +
      'A chunk that reads “must repay the top-up received” without “Parental leave” can’t be found or trusted.</div>' +
      '<div class="lab-cols"><div class="lab-ctl">' +
      '<fieldset class="lab-seg"><legend>Split by</legend><label><input type="radio" name="' + a + '" value="fixed" checked> Fixed size</label>' +
      '<label><input type="radio" name="' + a + '" value="structure"> Structure (headings)</label></fieldset>' +
      '<div class="lab-sl"><label for="' + b + '"><b>Chunk size</b><small>words per chunk (a maximum when splitting by structure)</small></label><div class="row"><input type="range" id="' + b + '" min="20" max="160" step="5" value="60" data-k="size"><output data-o="size"></output></div></div>' +
      '<div class="lab-sl"><label for="' + c + '"><b>Overlap</b><small>words repeated between fixed chunks</small></label><div class="row"><input type="range" id="' + c + '" min="0" max="30" step="5" value="0" data-k="overlap"><output data-o="overlap"></output></div></div>' +
      '<label class="lab-tog" for="' + d + '"><input type="checkbox" id="' + d + '" data-k="header"> <span><b>Prepend the section path</b><small>a cheap version of contextual retrieval</small></span></label>' +
      '<ul class="lab-checks" data-r="checks"></ul><p class="lab-verdict" data-r="verdict" role="status"></p></div>' +
      '<div class="lab-out"><div class="lab-chunks" data-r="chunks" tabindex="0" aria-label="The chunks"></div></div></div></div>';
    function q(sel) { return el.querySelector(sel); }
    function draw() {
      var chunks = chunker(s.mode, s.size, s.overlap, s.header), res = chunkCheck(chunks);
      q('[data-o=size]').textContent = s.size;
      q('[data-o=overlap]').textContent = s.overlap;
      var used = {};
      res.forEach(function (r) { if (r.chunk >= 0) used[r.chunk] = true; });
      q('[data-r=chunks]').innerHTML = '<p class="small muted">' + chunks.length + ' chunks</p>' + chunks.map(function (ch, i) {
        return '<div class="lab-chunk' + (used[i] ? ' used' : '') + '"><span class="n">#' + (i + 1) + '</span>' + esc(ch.text) + '</div>';
      }).join('');
      var good = 0;
      q('[data-r=checks]').innerHTML = res.map(function (r) {
        var ok = r.whole && r.ctx; if (ok) good++;
        return '<li class="' + (ok ? 'ok' : 'no') + '"><b>' + esc(r.q) + '</b><span>' + (!r.whole ? 'Answer split across chunks' : !r.ctx ? 'Chunk #' + (r.chunk + 1) + ' lacks its section' : 'Chunk #' + (r.chunk + 1) + ': whole, with context') + '</span></li>';
      }).join('');
      var v = q('[data-r=verdict]'), all = good === res.length;
      v.className = 'lab-verdict ' + (all ? 'ok' : '');
      v.textContent = all ? 'All four answers are whole and labelled. That is what structure-aware chunks with context buy you.' : good + ' of ' + res.length + ' pass. Try splitting by structure, and give chunks their section.';
      if (all && !fired && done) { fired = true; done(100, JSON.stringify({ mode: s.mode, size: s.size, header: s.header, chunks: chunks.length })); }
    }
    function onInput(e) {
      var t = e.target;
      if (t.type === 'radio') s.mode = t.value;
      else if (t.getAttribute('data-k') === 'header') s.header = t.checked;
      else if (t.getAttribute('data-k')) s[t.getAttribute('data-k')] = parseInt(t.value, 10) || 0;
      draw();
    }
    el.addEventListener('input', onInput); el.addEventListener('change', onInput);
    draw();
    return function () { el.removeEventListener('input', onInput); el.removeEventListener('change', onInput); };
  }

  /* ================================================================ retrieval */
  var CORPUS = [
    ['d1', 'VPN error 809 when connecting from home', 'Error 809 means the VPN connection between your computer and the gateway was blocked. Check that your router allows IPsec passthrough, or switch to the SSL VPN profile.'],
    ['d2', 'Outlook keeps asking for your password', 'If Outlook prompts repeatedly for credentials, remove the cached account in Credential Manager, then sign in again with single sign-on.'],
    ['d3', 'Reset a forgotten password', 'Use the self-service portal to reset your password. You need your registered phone for the verification code.'],
    ['d4', 'Printer shows error E-4031', 'E-4031 is a paper feed fault on the third-floor printers. Open tray 2, remove jammed sheets and restart the device.'],
    ['d5', 'Request a new laptop', 'Laptops are replaced every four years. Submit a hardware request in the service catalogue with your manager’s approval.'],
    ['d6', 'Laptop battery drains quickly', 'Battery wear above 30% qualifies for a replacement battery. Run the battery report and attach it to your ticket.'],
    ['d7', 'Set up multi-factor authentication', 'Install the authenticator app and scan the QR code on the security page. MFA is required for email and the VPN.'],
    ['d8', 'Sharing large files with clients', 'Use the secure file transfer portal for files over 25 MB. Links expire after 14 days. Do not use personal cloud drives.'],
    ['d9', 'Wi-Fi drops in meeting rooms', 'Meeting-room access points switch channels at peak hours. Forget the network and rejoin the corporate SSID.'],
    ['d10', 'Install approved software', 'Software from the company portal installs without admin rights. Other software needs a security review ticket.'],
    ['d11', 'Mailbox is full', 'Archive old messages with the online archive. Shared mailboxes have a 50 GB limit; ask for an increase if needed.'],
    ['d12', 'Lost or stolen device', 'Report a lost or stolen phone or laptop to the service desk immediately so the device can be wiped remotely.'],
    ['d13', 'Expense receipts in the travel app', 'Photograph receipts in the travel app within 30 days. Missing receipts need a signed declaration.'],
    ['d14', 'Second monitor not detected', 'Update the docking station firmware, then reconnect the display cable. USB-C docks need the latest driver pack.'],
    ['d15', 'Join a Teams meeting from a phone', 'Open the invitation on your phone and choose join by app or dial in with the conference ID.'],
    ['d16', 'Account locked after failed sign-ins', 'Accounts lock for 30 minutes after ten failed attempts. Wait, or call the service desk to unlock it sooner.'],
  ];
  var QUERIES = [
    ['vpn error 809', ['d1']],
    ['printer says E-4031', ['d4']],
    ['can’t get into my email, it keeps wanting my login', ['d2']],
    ['I forgot my password', ['d3']],
    ['my computer is old and slow, can I get a replacement', ['d5']],
    ['notebook power runs out fast', ['d6']],
    ['send a big document to a customer', ['d8']],
    ['internet keeps cutting out in the conference room', ['d9']],
    ['locked out after typing the wrong password too many times', ['d16']],
    ['someone stole my phone', ['d12']],
  ];
  // Concept lexicon: a stand-in for embeddings. Words that mean the same thing map to one concept.
  var CONCEPTS = {
    email: 'mail', outlook: 'mail', mailbox: 'mail', mail: 'mail',
    password: 'cred', credentials: 'cred', login: 'cred', 'sign-in': 'cred', 'sign-ins': 'cred', sign: 'cred', 'sign-ins.': 'cred',
    forgot: 'forget', forgotten: 'forget', reset: 'forget',
    laptop: 'computer', computer: 'computer', notebook: 'computer', device: 'computer', pc: 'computer',
    replacement: 'new', replaced: 'new', new: 'new', request: 'new', old: 'age', years: 'age',
    battery: 'power', power: 'power', drains: 'drain', runs: 'drain', fast: 'quick', quickly: 'quick',
    file: 'file', files: 'file', document: 'file', big: 'large', large: 'large', sharing: 'send', send: 'send', transfer: 'send',
    client: 'customer', clients: 'customer', customer: 'customer',
    'wi-fi': 'net', wifi: 'net', internet: 'net', network: 'net', drops: 'drop', cutting: 'drop',
    meeting: 'room', conference: 'room', room: 'room', rooms: 'room',
    locked: 'lock', lock: 'lock', locks: 'lock', failed: 'fail', wrong: 'fail', attempts: 'try', many: 'try', times: 'try',
    stolen: 'steal', stole: 'steal', lost: 'steal', phone: 'phone',
    connecting: 'connect', connection: 'connect',
  };
  var STOP = { the: 1, a: 1, an: 1, to: 1, of: 1, and: 1, or: 1, is: 1, in: 1, on: 1, my: 1, i: 1, it: 1, for: 1, with: 1, your: 1, you: 1,
    can: 1, get: 1, me: 1, keeps: 1, says: 1, when: 1, from: 1, be: 1, are: 1, this: 1, that: 1, after: 1, too: 1, into: 1, out: 1, someone: 1,
    wanting: 1, typing: 1, keep: 1, up: 1, so: 1, if: 1, then: 1, at: 1, by: 1, over: 1, not: 1, do: 1, use: 1 };
  function toks(t) {
    return String(t).toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9\-]+/).filter(function (w) { return w && !STOP[w]; });
  }
  function bm25(query, docs, k1, b) {
    k1 = k1 || 1.2; b = b == null ? 0.75 : b;
    var N = docs.length, df = {}, lens = [], tf = [];
    docs.forEach(function (d) {
      var t = toks(d[1] + ' ' + d[2]), f = {};
      t.forEach(function (w) { f[w] = (f[w] || 0) + 1; });
      Object.keys(f).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
      lens.push(t.length); tf.push(f);
    });
    var avg = lens.reduce(function (a, x) { return a + x; }, 0) / N;
    var qt = toks(query);
    return docs.map(function (d, i) {
      var sc = 0;
      qt.forEach(function (w) {
        if (!tf[i][w]) return;
        var idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5));
        sc += idf * tf[i][w] * (k1 + 1) / (tf[i][w] + k1 * (1 - b + b * lens[i] / avg));
      });
      return [d[0], sc];
    }).filter(function (x) { return x[1] > 0; }).sort(function (x, y) { return y[1] - x[1]; });
  }
  function cvec(text) {
    var v = {};
    toks(text).forEach(function (w) { var c = CONCEPTS[w]; if (c) v[c] = (v[c] || 0) + 1; });
    return v;
  }
  function cos(a, b) {
    var dot = 0, na = 0, nb = 0;
    Object.keys(a).forEach(function (k) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; });
    Object.keys(b).forEach(function (k) { nb += b[k] * b[k]; });
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  function dense(query, docs) {
    var qv = cvec(query);
    return docs.map(function (d) { return [d[0], cos(qv, cvec(d[1] + ' ' + d[2]))]; })
      .filter(function (x) { return x[1] > 0; }).sort(function (x, y) { return y[1] - x[1]; });
  }
  function rrf(lists, k) {
    k = k || 60;
    var s = {};
    lists.forEach(function (l) { l.forEach(function (x, i) { s[x[0]] = (s[x[0]] || 0) + 1 / (k + i + 1); }); });
    return Object.keys(s).map(function (d) { return [d, s[d]]; }).sort(function (x, y) { return y[1] - x[1]; });
  }
  function rerank(query, ranked, docs, topN) {
    // a stand-in for a cross-encoder: reads query and passage together (title-weighted concept overlap + exact terms)
    var byId = {}; docs.forEach(function (d) { byId[d[0]] = d; });
    var qv = cvec(query), qt = toks(query);
    var head = ranked.slice(0, topN || 10).map(function (x) {
      var d = byId[x[0]], title = cvec(d[1]), body = cvec(d[2]);
      var exact = qt.filter(function (w) { return (d[1] + ' ' + d[2]).toLowerCase().indexOf(w) >= 0 && /\d/.test(w); }).length;
      return [x[0], 2 * cos(qv, title) + cos(qv, body) + 1.5 * exact + 0.001 * x[1]];
    }).sort(function (x, y) { return y[1] - x[1]; });
    return head.concat(ranked.slice(topN || 10));
  }
  function metrics(run, k) {
    var hit = 0, mrr = 0;
    run.forEach(function (r) {
      var ids = r.ranked.map(function (x) { return x[0]; });
      var first = -1;
      ids.forEach(function (d, i) { if (first < 0 && r.rel.indexOf(d) >= 0) first = i; });
      if (first >= 0 && first < k) hit++;
      if (first >= 0) mrr += 1 / (first + 1);
    });
    return { recall: hit / run.length, mrr: mrr / run.length };
  }
  function retrieve(cfg) {
    return QUERIES.map(function (q) {
      var lists = [];
      if (cfg.bm25) lists.push(bm25(q[0], CORPUS));
      if (cfg.dense) lists.push(dense(q[0], CORPUS));
      var ranked = lists.length === 0 ? [] : lists.length === 1 ? lists[0] : rrf(lists, cfg.k);
      if (cfg.rerank && ranked.length) ranked = rerank(q[0], ranked, CORPUS, 10);
      return { q: q[0], rel: q[1], ranked: ranked };
    });
  }
  function labRetrieval(el, done) {
    var cfg = { bm25: true, dense: false, rerank: false, k: 60 }, fired = false;
    var i1 = id('b'), i2 = id('d'), i3 = id('r'), i4 = id('k');
    el.innerHTML = '<div class="lab lab-ret"><div class="lab-brief"><b>The corpus:</b> 16 IT help articles. <b>The test set:</b> 10 real-style queries, each with its correct article. ' +
      'Turn retrievers on and off and watch <b>recall@3</b> (is the right article in the top 3?) and <b>MRR</b>. ' +
      '<span class="muted">Keyword search is real BM25. “Vector” search is simulated with a small synonym map instead of a neural embedding model, so you can see why it finds paraphrases.</span></div>' +
      '<div class="lab-cols"><div class="lab-ctl">' +
      '<label class="lab-tog" for="' + i1 + '"><input type="checkbox" id="' + i1 + '" data-k="bm25" checked> <span><b>Keyword search (BM25)</b><small>exact terms: codes, names</small></span></label>' +
      '<label class="lab-tog" for="' + i2 + '"><input type="checkbox" id="' + i2 + '" data-k="dense"> <span><b>Vector search (simulated)</b><small>meaning: paraphrases, synonyms</small></span></label>' +
      '<div class="lab-sl"><label for="' + i4 + '"><b>RRF k</b><small>used when both are on: score = Σ 1/(k + rank)</small></label><div class="row"><input type="range" id="' + i4 + '" min="1" max="100" step="1" value="60" data-k="k"><output data-o="k"></output></div></div>' +
      '<label class="lab-tog" for="' + i3 + '"><input type="checkbox" id="' + i3 + '" data-k="rerank"> <span><b>Rerank the top 10</b><small>a second, careful pass over the shortlist</small></span></label>' +
      '<div class="lab-kpis"><div><span>Recall@3</span><b data-r="rec"></b></div><div><span>MRR</span><b data-r="mrr"></b></div></div>' +
      '<p class="lab-verdict" data-r="verdict" role="status"></p></div>' +
      '<div class="lab-out"><table class="lab-table"><caption class="ui-sr">Results per query</caption><thead><tr><th scope="col">Query</th><th scope="col">Top 3</th><th scope="col">Rank of the right article</th></tr></thead><tbody data-r="rows"></tbody></table></div></div></div>';
    function q(sel) { return el.querySelector(sel); }
    var titles = {}; CORPUS.forEach(function (d) { titles[d[0]] = d[1]; });
    function draw() {
      var run = retrieve(cfg), m = metrics(run, 3);
      q('[data-o=k]').textContent = cfg.k;
      var any = cfg.bm25 || cfg.dense;
      q('[data-r=rec]').textContent = any ? pct(m.recall) : '-';
      q('[data-r=mrr]').textContent = any ? (Math.round(m.mrr * 100) / 100).toFixed(2) : '-';
      q('[data-r=rows]').innerHTML = run.map(function (r) {
        var ids = r.ranked.map(function (x) { return x[0]; }), pos = ids.indexOf(r.rel[0]);
        var top = r.ranked.slice(0, 3).filter(function (x) { return x[1] > 0; }).map(function (x) {
          return '<li class="' + (r.rel.indexOf(x[0]) >= 0 ? 'hit' : '') + '">' + esc(titles[x[0]]) + '</li>';
        }).join('') || '<li class="muted">nothing found</li>';
        var found = pos >= 0 && r.ranked[pos][1] > 0;
        return '<tr class="' + (found && pos < 3 ? 'ok' : 'no') + '"><td>' + esc(r.q) + '</td><td><ol>' + top + '</ol></td><td class="pos">' + (found ? '#' + (pos + 1) : 'not found') + '</td></tr>';
      }).join('');
      var v = q('[data-r=verdict]'), ok = m.recall >= 0.9 && any;
      v.className = 'lab-verdict ' + (ok ? 'ok' : '');
      v.textContent = !any ? 'Turn on at least one retriever.' : ok
        ? 'Recall@3 ' + pct(m.recall) + '. Keyword search catches codes, vectors catch paraphrases, fusion keeps both, the reranker fixes the order.'
        : 'Recall@3 ' + pct(m.recall) + '. Look at which queries fail: are they paraphrases or exact codes?';
      if (ok && !fired && done) { fired = true; done(Math.round(m.recall * 100), JSON.stringify({ bm25: cfg.bm25, dense: cfg.dense, rerank: cfg.rerank, k: cfg.k, mrr: Math.round(m.mrr * 100) / 100 })); }
    }
    function onInput(e) {
      var t = e.target, k = t.getAttribute('data-k');
      if (!k) return;
      cfg[k] = t.type === 'checkbox' ? t.checked : parseInt(t.value, 10) || 60;
      draw();
    }
    el.addEventListener('input', onInput); el.addEventListener('change', onInput);
    draw();
    return function () { el.removeEventListener('input', onInput); el.removeEventListener('change', onInput); };
  }

  /* ================================================================ judge */
  // Question: "What does our refund policy say about opened software?" Policy: opened software can be refunded within 14 days only if defective.
  // expert: true = pass. judge: the LLM judge's verdict (it likes long, confident answers: verbosity bias).
  var ANSWERS = [
    ['Opened software can be refunded within 14 days, but only if it is defective. [policy §3]', true, true],
    ['You can return opened software within 14 days if it doesn’t work properly.', true, true],
    ['Opened software isn’t refundable unless it’s defective, and then only within 14 days.', true, true],
    ['Great question! We want every customer to be happy, so you can return any software within 30 days for a full refund, opened or not. Just keep your receipt and contact our friendly team, who will guide you through each step of the process.', false, true],
    ['Refunds: 14 days, defective only, for opened software.', true, false],
    ['Opened software can always be refunded within 14 days.', false, false],
    ['I don’t know.', false, false],
    ['Per the policy, opened software qualifies for a refund within 14 days when it is defective. Non-defective opened software is not refundable. [policy §3]', true, true],
    ['Our policy is designed with customers in mind. Opened software, like all products, may be returned within the standard window, and our team reviews every request carefully and fairly so that you get the best possible outcome for your situation.', false, true],
    ['Defective opened software: refund within 14 days. Otherwise no.', true, false],
    ['Software can be refunded if unopened.', false, false],
    ['Yes, within 14 days if defective. [policy §3]', true, true],
    ['Opened software is refundable for 60 days if you bought the extended warranty, which also covers accidental damage and gives you priority support from our specialist team around the clock.', false, true],
    ['Only defective opened software, within 14 days of purchase.', true, true],
    ['No refunds on opened items.', false, false],
    ['Within 14 days, opened software can be refunded if defective; contact support with your order number. [policy §3]', true, true],
  ];
  function confusion(pred, truth) {
    // positive = FAIL (what the judge is meant to catch)
    var tp = 0, tn = 0, fp = 0, fn = 0;
    pred.forEach(function (p, i) {
      var pf = !p, tf = !truth[i];
      if (pf && tf) tp++; else if (!pf && !tf) tn++; else if (pf && !tf) fp++; else fn++;
    });
    var n = pred.length, po = (tp + tn) / n;
    var pe = ((tp + fp) * (tp + fn) + (fn + tn) * (fp + tn)) / (n * n);
    return { tp: tp, tn: tn, fp: fp, fn: fn, acc: po, tpr: tp + fn ? tp / (tp + fn) : 0, tnr: tn + fp ? tn / (tn + fp) : 0,
             kappa: pe < 1 ? (po - pe) / (1 - pe) : 1 };
  }
  function labJudge(el, done) {
    var labels = ANSWERS.map(function () { return null; }), fired = false;
    var h = '<div class="lab lab-judge"><div class="lab-brief"><b>The question:</b> “What does our refund policy say about opened software?” ' +
      '<b>The policy:</b> opened software can be refunded within 14 days, only if defective. ' +
      'Label each answer <b>Pass</b> or <b>Fail</b> as the domain expert. Then see how often the LLM judge agrees with you. ' +
      '<span class="muted">“Positive” here means a failure the judge should catch.</span></div><ol class="lab-answers">';
    ANSWERS.forEach(function (a, i) {
      h += '<li data-i="' + i + '"><p>' + esc(a[0]) + '</p><div class="lab-pf" role="group" aria-label="Answer ' + (i + 1) + '">' +
        '<button type="button" data-v="1">Pass</button><button type="button" data-v="0">Fail</button></div><span class="lab-jv" hidden></span></li>';
    });
    h += '</ol><div class="lab-sum" data-r="sum" role="status"></div></div>';
    el.innerHTML = h;
    function q(sel) { return el.querySelector(sel); }
    function draw() {
      var n = labels.filter(function (x) { return x !== null; }).length;
      el.querySelectorAll('.lab-answers > li').forEach(function (li) {
        var i = +li.getAttribute('data-i'), v = labels[i];
        li.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(v !== null && String(+v) === b.getAttribute('data-v'))); });
        var jv = li.querySelector('.lab-jv');
        if (n === ANSWERS.length) {
          jv.hidden = false;
          var agree = ANSWERS[i][2] === v;
          jv.className = 'lab-jv ' + (agree ? 'agree' : 'disagree');
          jv.textContent = 'Judge: ' + (ANSWERS[i][2] ? 'Pass' : 'Fail') + (agree ? '' : ' · disagrees with you');
        } else { jv.hidden = true; }
      });
      var sum = q('[data-r=sum]');
      if (n < ANSWERS.length) { sum.innerHTML = '<p class="muted">' + n + ' of ' + ANSWERS.length + ' labelled.</p>'; return; }
      var c = confusion(ANSWERS.map(function (a) { return a[2]; }), labels);
      var x = confusion(labels, ANSWERS.map(function (a) { return a[1]; }));
      sum.innerHTML = '<div class="lab-kpis four"><div><span>Raw agreement</span><b>' + pct(c.acc) + '</b></div><div><span>True positive rate</span><b>' + pct(c.tpr) + '</b><small>failures it catches</small></div>' +
        '<div><span>True negative rate</span><b>' + pct(c.tnr) + '</b><small>passes it confirms</small></div><div><span>Cohen’s kappa</span><b>' + (Math.round(c.kappa * 100) / 100).toFixed(2) + '</b><small>agreement beyond chance</small></div></div>' +
        '<p>The judge missed <b>' + c.fn + '</b> failure' + (c.fn === 1 ? '' : 's') + ' you found. Look at them: long, friendly, confident and wrong. That is <b>verbosity bias</b>, and it’s why you calibrate a judge before trusting its scores.</p>' +
        '<p class="small muted">Your labels agreed with our expert on ' + pct(x.acc) + ' of answers.</p>';
      if (!fired && done) { fired = true; done(100, JSON.stringify({ tpr: Math.round(c.tpr * 100), tnr: Math.round(c.tnr * 100), kappa: Math.round(c.kappa * 100) / 100, expert: Math.round(x.acc * 100) })); }
    }
    function onClick(e) {
      var b = e.target.closest && e.target.closest('button[data-v]');
      if (!b) return;
      var li = b.closest('li');
      labels[+li.getAttribute('data-i')] = b.getAttribute('data-v') === '1';
      draw();
    }
    el.addEventListener('click', onClick);
    draw();
    return function () { el.removeEventListener('click', onClick); };
  }

  var LABS = { cost: labCost, chunk: labChunk, retrieval: labRetrieval, judge: labJudge };
  AX.lab = function (el, name, onDone) {
    var f = LABS[name];
    if (!el || !f) return function () {};
    return f(el, function (score, detail) { if (onDone) { try { onDone(score, detail); } catch (e) { console.error(e); } } }) || function () {};
  };
  AX.labTest = { bm25: bm25, dense: dense, rrf: rrf, rerank: rerank, metrics: metrics, retrieve: retrieve, chunker: chunker,
                 chunkCheck: chunkCheck, confusion: confusion, costModel: costModel, COST0: COST0, ANSWERS: ANSWERS };
})();
