/* ax-labs.js: the five hands-on labs (they run entirely in the browser; nothing is sent anywhere).
   AX.lab(el, id, onDone)  mounts lab `id` ('cost' | 'chunk' | 'retrieval' | 'judge' | 'traces') into el and returns a destroy function.
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

  /* ================================================================ traces (error analysis)
     20 traces from Keyhole, a FICTIONAL rental-viewing assistant (all listings, people and policies are invented).
     The learner may jot a note (open coding), then tags the FIRST failure in each trace. After all 20: their Pareto
     next to the expert's, agreement, the expert's reasoning where they differ, then a pick of the first two evals. */
  var TRACE_CODES = [
    ['constraint', 'Ignored the user’s constraint'],
    ['args', 'Wrong tool arguments'],
    ['policy', 'Invented policy'],
    ['stale', 'Stale or contradicted facts'],
    ['long', 'Too long'],
    ['ok', 'No problem'],
  ];
  var TRACE_TODAY = 'Today is Monday 9 March 2026.';
  // u = user, ctx = retrieved snippet (null = nothing retrieved), tools = [[name, args, result]], a = final answer,
  // x = the expert's first-failure code, why = the expert's reasoning
  var TRACES = [
    { u: 'Two bedrooms in Riverside under $1,800. I have a cat.', ctx: null,
      tools: [['search_listings', { area: 'Riverside', bedrooms: 2, max_rent: 1800, pets: 'cats' }, [{ id: 'RV-114', rent: 1750, pets: 'cats ok' }, { id: 'RV-208', rent: 1690, pets: 'no pets' }]]],
      a: 'I found two. RV-208 is the better deal at $1,690 a month, and RV-114 is $1,750. Shall I book a viewing at RV-208?',
      x: 'constraint', why: 'The search was right and even returned the pet rule. The answer then pushed RV-208, a no-pets flat, to a cat owner.' },
    { u: 'Is parking included at HL-302?', ctx: 'HL-302: one underground parking space is included in the rent.', tools: [],
      a: 'Yes. One underground space is included in the rent at HL-302.',
      x: 'ok', why: 'Short, correct and grounded in the retrieved listing.' },
    { u: 'Book RV-114 for Thursday at 6pm.', ctx: TRACE_TODAY,
      tools: [['book_viewing', { listing: 'RV-114', date: '2026-03-13', time: '18:00' }, { status: 'booked', date: '2026-03-13' }]],
      a: 'You’re booked to see RV-114 on Thursday at 6pm.',
      x: 'args', why: 'Thursday is 12 March; the tool was called with 13 March (a Friday). The answer repeats the mistake, but the first failure is the argument.' },
    { u: 'Can I break the lease early if I move for work?', ctx: 'Lease length: 12 months. Early termination: contact the property manager.', tools: [],
      a: 'Yes. Give 30 days’ notice and pay a one-month fee, and you can leave early for a work move.',
      x: 'policy', why: 'Nothing retrieved mentions 30 days or a fee. The context says to contact the property manager; the model made a policy up.' },
    { u: 'A studio within walking distance of Central Station, up to $1,500.', ctx: null,
      tools: [['search_listings', { near: 'Central Station', max_rent: 1500, type: 'studio' }, [{ id: 'CS-011', rent: 1450, walk_min: 8 }, { id: 'NB-090', rent: 1390, walk_min: 34 }]]],
      a: 'Top pick: NB-090 at $1,390, the cheapest studio I found.',
      x: 'constraint', why: 'A 34-minute walk isn’t “walking distance”. CS-011 (8 minutes) met both of the user’s conditions.' },
    { u: 'What’s the rent at HL-302?', ctx: 'HL-302 listing (updated 2 November 2025): $1,650 a month.',
      tools: [['get_listing', { id: 'HL-302' }, { rent: 1720, updated: '2026-03-01' }]],
      a: 'HL-302 is $1,650 a month.',
      x: 'stale', why: 'The live tool result (updated last week) says $1,720. The answer used the four-month-old snippet instead.' },
    { u: 'Book a viewing at CS-011 tomorrow morning.', ctx: TRACE_TODAY,
      tools: [['check_slots', { listing: 'CS-011', date: '2026-03-10' }, ['09:30', '11:00']]],
      a: 'CS-011 has 9:30 or 11:00 tomorrow (Tuesday 10 March). Which one works for you?',
      x: 'ok', why: 'Right date, real slots, and it asks before booking because “morning” had two options.' },
    { u: 'Show me three-bedrooms in Eastgate under $2,400.', ctx: null,
      tools: [['search_listings', { area: 'Eastgate', bedrooms: 3, max_rent: '2.400' }, []]],
      a: 'Sorry, there are no three-bedroom flats in Eastgate under $2,400 right now.',
      x: 'args', why: 'max_rent was sent as the string "2.400" (read as 2.4), so the search could never match. The “none available” answer follows from that bad argument.' },
    { u: 'Do you allow dogs at CS-011?', ctx: 'CS-011: dogs under 15 kg allowed; pet rent $40 a month.', tools: [],
      a: 'Great question, and thank you for thinking about your dog’s comfort before you move! At CS-011 we do welcome dogs, which many of our residents love, as long as they weigh under 15 kg. There is a pet rent of $40 a month, which helps us look after the shared spaces. Many owners find the nearby park convenient for walks. If you have any other questions about living with pets, our team is always happy to help, and you can also ask about other pet-friendly listings.',
      x: 'long', why: 'Every fact is correct, but the two facts the user needed (under 15 kg, $40 a month) are buried in padding, including an unsupported line about a park.' },
    { u: 'I need a ground-floor flat; my mother uses a wheelchair. Two bedrooms in Riverside.', ctx: null,
      tools: [['search_listings', { area: 'Riverside', bedrooms: 2 }, [{ id: 'RV-114', floor: 3, lift: true }, { id: 'RV-031', floor: 0 }]]],
      a: 'RV-114 is a great fit: bright, on the third floor, with a lift.',
      x: 'constraint', why: 'The search tool has no floor filter, so the arguments were fine. The answer ignored “ground floor” although RV-031 matched it.' },
    { u: 'Is there a fee to book a viewing?', ctx: null,
      tools: [['search_docs', { query: 'viewing fee' }, 'No matching documents.']],
      a: 'Viewings need a $25 refundable deposit, paid when you book.',
      x: 'policy', why: 'Nothing was found, so the honest answer is “I don’t know, here is who to ask”. The $25 deposit is invented.' },
    { u: 'Can I see HL-302 on 2026-03-14 at 10?', ctx: null,
      tools: [['book_viewing', { listing: 'HL-320', date: '2026-03-14', time: '10:00' }, { status: 'booked', listing: 'HL-320' }]],
      a: 'Booked: HL-302 on Saturday 14 March at 10:00.',
      x: 'args', why: 'The tool booked HL-320, not HL-302. The answer then claims the right flat, which hides the error from the user.' },
    { u: 'What’s the deposit at RV-114?', ctx: 'RV-114: security deposit equal to one month’s rent ($1,750).', tools: [],
      a: 'The deposit at RV-114 is one month’s rent: $1,750.',
      x: 'ok', why: 'Correct, grounded, short.' },
    { u: 'A pet-free building please, I’m allergic. One bedroom near Old Town, up to $1,600.', ctx: null,
      tools: [['search_listings', { area: 'Old Town', bedrooms: 1, max_rent: 1600 }, [{ id: 'OT-207', rent: 1580, pets: 'cats and dogs allowed' }, { id: 'OT-115', rent: 1540, pets: 'no-pets building' }]]],
      a: 'OT-207 is the best match: renovated kitchen, $1,580 a month.',
      x: 'constraint', why: 'The user is allergic and asked for a pet-free building. OT-115 was the match; OT-207 allows cats and dogs.' },
    { u: 'Is RV-208 still available?', ctx: 'RV-208: available from 1 April.',
      tools: [['get_listing', { id: 'RV-208' }, { status: 'let', updated: '2026-03-08' }]],
      a: 'Yes, RV-208 is available from 1 April. Want me to book a viewing?',
      x: 'stale', why: 'The tool says the flat was let yesterday. The answer trusted the older snippet over the live result.' },
    { u: 'Do you accept guarantors for students?', ctx: 'Applications: proof of income of 2.5 times the monthly rent.', tools: [],
      a: 'Yes. Students can use a parent as guarantor, who needs to earn 3 times the rent.',
      x: 'policy', why: 'The context says nothing about guarantors, and it says 2.5 times, not 3. Both claims are made up.' },
    { u: 'Cancel my viewing for tomorrow.', ctx: TRACE_TODAY,
      tools: [['list_bookings', { user: 'me' }, [{ id: 'V-88', listing: 'CS-011', date: '2026-03-10', time: '09:30' }]],
              ['cancel_viewing', { booking: 'V-88' }, { status: 'cancelled' }]],
      a: 'Done. Your 9:30 viewing at CS-011 tomorrow is cancelled.',
      x: 'ok', why: 'It looked the booking up, cancelled the right one and confirmed what it did.' },
    { u: 'Up to $1,300, and I don’t drive, so it must be close to a metro station.', ctx: null,
      tools: [['search_listings', { max_rent: 1300, near: 'metro' }, [{ id: 'NB-090', rent: 1390, metro_min: 4 }, { id: 'WS-044', rent: 1280, metro_min: 6 }]]],
      a: 'NB-090 is just 4 minutes from the metro, and at $1,390 it’s only a little over your budget.',
      x: 'constraint', why: 'WS-044 met both conditions. The answer recommended a flat over the stated maximum.' },
    { u: 'Any viewings at CS-011 next Friday after 5pm?', ctx: TRACE_TODAY,
      tools: [['check_slots', { listing: 'CS-011', date: 'next Friday' }, { error: 'invalid date' }]],
      a: 'There are no viewing slots at CS-011 next Friday.',
      x: 'args', why: 'The tool needs an ISO date (2026-03-20) and returned an error. The answer turned a failed call into “no slots”.' },
    { u: 'Two bedrooms in Old Town. I work nights, so it has to be quiet: nothing above a bar.', ctx: null,
      tools: [['search_listings', { area: 'Old Town', bedrooms: 2 }, [{ id: 'OT-302', rent: 1700, note: 'above a cocktail bar, open until 2am' }, { id: 'OT-118', rent: 1760, note: 'residential street' }]]],
      a: 'OT-302 is cheaper and right in the heart of Old Town’s nightlife.',
      x: 'constraint', why: 'The user ruled out flats above bars. OT-118 on a residential street was the match.' },
  ];
  var TRACE_EVALS = [
    { id: 'filters', t: 'Code check: every recommended listing passes the user’s hard filters (budget, pets, floor, bedrooms)', best: true,
      fb: 'Yes. It targets the biggest failure mode (6 of 20) and is a cheap, deterministic assertion on the tool results and the answer.' },
    { id: 'args', t: 'Code check: tool arguments are valid (ISO dates that match the user’s words, listing IDs that exist, numbers as numbers)', best: true,
      fb: 'Yes. The second-biggest mode (4 of 20), and code catches it every time with no judge to calibrate.' },
    { id: 'grounded', t: 'LLM judge, calibrated on expert labels: every policy claim is supported by the retrieved context', best: false,
      fb: 'Worth building soon (3 of 20, and invented policy is risky), but a judge needs labelled examples and calibration first. Ship the two code checks this week.' },
    { id: 'helpful', t: 'Generic 1-5 helpfulness score from an LLM', best: false,
      fb: 'No. It matches none of the failure modes you found and gives a number nobody can act on.' },
    { id: 'length', t: 'Length check: answers stay under 80 words', best: false,
      fb: 'Cheap, but too long was 1 of 20. Fix the top modes first.' },
    { id: 'bleu', t: 'BLEU score against reference answers', best: false,
      fb: 'No. Word overlap with a reference says nothing about whether the flat fits or the policy is real.' },
  ];
  function traceCounts(tags) {
    var out = {};
    TRACE_CODES.forEach(function (c) { out[c[0]] = 0; });
    tags.forEach(function (t) { if (t && out[t] != null) out[t] += 1; });
    return out;
  }
  function labTraces(el, done) {
    var tags = TRACES.map(function () { return null; }), notes = TRACES.map(function () { return ''; });
    var cur = 0, picks = [], fired = false, showSum = false;
    var codeName = {};
    TRACE_CODES.forEach(function (c) { codeName[c[0]] = c[1]; });
    function fmt(v) { return JSON.stringify(v, null, 1).replace(/\n\s*/g, ' '); }
    el.innerHTML = '<div class="lab lab-traces"><div class="lab-brief"><b>Keyhole</b> is a fictional assistant that finds rental flats and books viewings, with tools for search, ' +
      'listings and bookings. Read each trace like the domain owner. Jot a note if you like (open coding), then tag the <b>first</b> thing that went wrong. ' +
      '<span class="muted">All listings, people and policies here are invented for practice.</span></div>' +
      '<nav class="lt-dots" aria-label="Traces" data-r="dots"></nav><div data-r="trace"></div><div data-r="sum" role="status"></div></div>';
    function q(sel) { return el.querySelector(sel); }
    function tagged() { return tags.filter(function (x) { return x; }).length; }
    function drawDots() {
      var h = '';
      TRACES.forEach(function (t, i) {
        h += '<button type="button" data-go="' + i + '" class="' + (tags[i] ? 'done' : '') + (i === cur && !showSum ? ' on' : '') + '" aria-label="Trace ' + (i + 1) + (tags[i] ? ', tagged' : '') + '"' +
          (i === cur && !showSum ? ' aria-current="step"' : '') + '>' + (i + 1) + '</button>';
      });
      q('[data-r=dots]').innerHTML = h;
    }
    function drawTrace() {
      var t = TRACES[cur], box = q('[data-r=trace]');
      if (showSum) { box.innerHTML = ''; return; }
      var h = '<article class="lt-trace" aria-label="Trace ' + (cur + 1) + ' of ' + TRACES.length + '">' +
        '<header><b>Trace ' + (cur + 1) + ' of ' + TRACES.length + '</b><span class="muted small">' + tagged() + ' tagged</span></header>' +
        '<div class="lt-step user"><span>User</span><p>' + esc(t.u) + '</p></div>' +
        '<div class="lt-step ctx"><span>Retrieved context</span><p>' + (t.ctx ? esc(t.ctx) : '<i class="muted">Nothing retrieved</i>') + '</p></div>';
      if (t.tools.length) {
        t.tools.forEach(function (c) {
          h += '<div class="lt-step tool"><span>Tool call</span><pre><b>' + esc(c[0]) + '</b>(' + esc(fmt(c[1])) + ')\n→ ' + esc(fmt(c[2])) + '</pre></div>';
        });
      } else {
        h += '<div class="lt-step tool"><span>Tool calls</span><p class="muted">None</p></div>';
      }
      h += '<div class="lt-step ans"><span>Final answer</span><p>' + esc(t.a) + '</p></div>' +
        '<label class="lt-note"><span>Your note (open coding, stays in this tab)</span><textarea rows="2" data-r="note" placeholder="What went wrong first?">' + esc(notes[cur]) + '</textarea></label>' +
        '<fieldset class="lt-tags"><legend>First failure</legend>';
      TRACE_CODES.forEach(function (c) {
        h += '<button type="button" data-tag="' + c[0] + '" aria-pressed="' + String(tags[cur] === c[0]) + '">' + esc(c[1]) + '</button>';
      });
      h += '</fieldset><div class="lt-nav"><button type="button" class="lt-btn" data-step="-1"' + (cur === 0 ? ' disabled' : '') + '>Previous</button>';
      if (tagged() === TRACES.length) {
        h += '<button type="button" class="lt-btn primary" data-sum="1">See your Pareto</button>';
      } else {
        h += '<button type="button" class="lt-btn primary" data-step="1"' + (tags[cur] ? '' : ' disabled') + '>Next trace</button>';
      }
      h += '</div></article>';
      box.innerHTML = h;
    }
    function drawSum() {
      var sum = q('[data-r=sum]');
      var n = tagged();
      if (!showSum || n < TRACES.length) {
        sum.innerHTML = n < TRACES.length ? '<p class="muted small">' + n + ' of ' + TRACES.length + ' traces tagged. Your Pareto appears when all 20 are tagged.</p>' : '';
        return;
      }
      var you = traceCounts(tags), exp = traceCounts(TRACES.map(function (t) { return t.x; }));
      var agree = 0;
      TRACES.forEach(function (t, i) { if (tags[i] === t.x) agree += 1; });
      var order = TRACE_CODES.slice().sort(function (a, b) { return exp[b[0]] - exp[a[0]] || you[b[0]] - you[a[0]]; });
      var max = Math.max.apply(null, order.map(function (c) { return Math.max(you[c[0]], exp[c[0]]); }).concat([1]));
      var h = '<div class="lab-kpis"><div><span>Agreement with the expert</span><b>' + pct(agree / TRACES.length) + '</b><small>' + agree + ' of ' + TRACES.length + ' first failures</small></div>' +
        '<div><span>Top failure mode (expert)</span><b class="lt-top">' + esc(codeName[order[0][0]]) + '</b><small>' + exp[order[0][0]] + ' of 20 traces</small></div></div>' +
        '<h3 class="lt-h">Pareto: failure modes, most common first</h3><div class="lt-pareto" role="table" aria-label="Your counts and the expert counts per failure mode">' +
        '<div class="lt-prow head" role="row"><span role="columnheader">Failure mode</span><span role="columnheader">You</span><span role="columnheader">Expert</span></div>';
      order.forEach(function (c) {
        h += '<div class="lt-prow" role="row"><span role="cell">' + esc(c[1]) + '</span>' +
          '<span role="cell" class="lt-bar you"><i style="width:' + Math.round(100 * you[c[0]] / max) + '%"></i><b>' + you[c[0]] + '</b></span>' +
          '<span role="cell" class="lt-bar exp"><i style="width:' + Math.round(100 * exp[c[0]] / max) + '%"></i><b>' + exp[c[0]] + '</b></span></div>';
      });
      h += '</div>';
      var diff = [];
      TRACES.forEach(function (t, i) { if (tags[i] !== t.x) diff.push(i); });
      if (diff.length) {
        h += '<h3 class="lt-h">Where you and the expert differ</h3><ol class="lt-diff">';
        diff.forEach(function (i) {
          var t = TRACES[i];
          h += '<li><b>Trace ' + (i + 1) + '</b>: you said <em>' + esc(codeName[tags[i]]) + '</em>, the expert said <em>' + esc(codeName[t.x]) + '</em>. ' + esc(t.why) + '</li>';
        });
        h += '</ol>';
      } else {
        h += '<p class="lab-verdict ok">You matched the expert on every trace. That is exactly the habit: one failure per trace, the first one.</p>';
      }
      h += '<h3 class="lt-h">Now choose the first two evals to build</h3><p class="small muted">Pick two. Use the Pareto, and prefer cheap, deterministic checks where they work.</p><div class="lt-evals">';
      TRACE_EVALS.forEach(function (e) {
        var on = picks.indexOf(e.id) >= 0;
        h += '<button type="button" data-eval="' + e.id + '" aria-pressed="' + String(on) + '">' + esc(e.t) + '</button>';
      });
      h += '</div>';
      if (picks.length === 2) {
        var good = picks.filter(function (id) { return TRACE_EVALS.some(function (e) { return e.id === id && e.best; }); }).length;
        h += '<ul class="lt-fb">';
        picks.forEach(function (id) {
          var e = TRACE_EVALS.filter(function (x) { return x.id === id; })[0];
          h += '<li class="' + (e.best ? 'ok' : '') + '"><b>' + esc(e.t) + '</b><span>' + esc(e.fb) + '</span></li>';
        });
        h += '</ul><p class="lab-verdict' + (good === 2 ? ' ok' : '') + '">' + (good === 2 ? 'Same two as the expert: they cover 10 of the 20 failures with two cheap code checks.' :
          'The expert’s two: the hard-filter check and the tool-argument check. Together they cover 10 of the 20 failures, with no judge to calibrate.') + '</p>';
        if (!fired && done) {
          fired = true;
          done(100, JSON.stringify({ agree: Math.round(100 * agree / TRACES.length), picks: picks.join(','), expert_picks: good }));
        }
      }
      sum.innerHTML = h;
    }
    function draw() { drawDots(); drawTrace(); drawSum(); }
    function onClick(e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !el.contains(b) || b.disabled) return;
      if (b.hasAttribute('data-tag')) {
        tags[cur] = b.getAttribute('data-tag');
      } else if (b.hasAttribute('data-step')) {
        cur = Math.max(0, Math.min(TRACES.length - 1, cur + Number(b.getAttribute('data-step'))));
        if (tags[cur] && b.getAttribute('data-step') === '1') {
          var next = tags.indexOf(null);
          if (next >= 0) cur = next;
        }
      } else if (b.hasAttribute('data-go')) {
        cur = Number(b.getAttribute('data-go')); showSum = false;
      } else if (b.hasAttribute('data-sum')) {
        showSum = true;
      } else if (b.hasAttribute('data-eval')) {
        var id = b.getAttribute('data-eval'), at = picks.indexOf(id);
        if (at >= 0) picks.splice(at, 1);
        else { picks.push(id); if (picks.length > 2) picks.shift(); }
        drawSum();
        var again = q('[data-eval="' + id + '"]');
        if (again) again.focus();
        return;
      } else { return; }
      draw();
      var focusTo = showSum ? q('[data-r=sum] .lab-kpis') : (b.hasAttribute('data-tag') ? q('[data-tag="' + tags[cur] + '"]') : q('.lt-trace header'));
      if (focusTo) { if (!focusTo.hasAttribute('tabindex')) focusTo.setAttribute('tabindex', '-1'); focusTo.focus({ preventScroll: !showSum && b.hasAttribute('data-tag') }); }
      if (b.hasAttribute('data-step') || b.hasAttribute('data-go')) { var tr = q('.lt-trace'); if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' }); }
    }
    function onInput(e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-r') === 'note') notes[cur] = e.target.value.slice(0, 500);
    }
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    draw();
    return function () { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); };
  }

  var LABS = { cost: labCost, chunk: labChunk, retrieval: labRetrieval, judge: labJudge, traces: labTraces };
  AX.lab = function (el, name, onDone) {
    var f = LABS[name];
    if (!el || !f) return function () {};
    return f(el, function (score, detail) { if (onDone) { try { onDone(score, detail); } catch (e) { console.error(e); } } }) || function () {};
  };
  AX.labTest = { bm25: bm25, dense: dense, rrf: rrf, rerank: rerank, metrics: metrics, retrieve: retrieve, chunker: chunker,
                 chunkCheck: chunkCheck, confusion: confusion, costModel: costModel, COST0: COST0, ANSWERS: ANSWERS,
                 TRACES: TRACES, TRACE_CODES: TRACE_CODES, TRACE_EVALS: TRACE_EVALS, traceCounts: traceCounts };
})();
