(function () {
  'use strict';
  var D = window.NAV_DATA;
  var app = document.getElementById('app');
  var TAG = { UZNAT: 'УЗНАТЬ', OFORMIT: 'ОФОРМИТЬ', POLUCHIT: 'ПОЛУЧИТЬ' };
  var NOW = ['Сегодня', 'Эта неделя'];
  var observer = null;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function icon(n) { return '<i data-lucide="' + n + '"></i>'; }
  function store(k, v) { try { if (v === undefined) { return JSON.parse(localStorage.getItem('pg:' + k) || 'null'); } localStorage.setItem('pg:' + k, JSON.stringify(v)); } catch (e) { return null; } }
  function sphereById(id) { for (var i = 0; i < D.spheres.length; i++) if (D.spheres[i].id === id) return D.spheres[i]; return null; }
  function sphereOf(slug) { for (var i = 0; i < D.spheres.length; i++) if (D.spheres[i].situations.indexOf(slug) > -1) return D.spheres[i]; return null; }
  function isReady(slug) { return !!D.situations[slug]; }
  function titleOf(slug) { return isReady(slug) ? D.situations[slug].title : (D.stubs[slug] ? D.stubs[slug][0] : slug); }
  function descOf(slug) { return isReady(slug) ? D.situations[slug].card : (D.stubs[slug] ? D.stubs[slug][1] : ''); }
  function allSlugs() { var a = []; D.spheres.forEach(function (s) { a = a.concat(s.situations); }); return a; }
  function readySlugs() { return allSlugs().filter(isReady); }
  function shareUrl(slug) { return location.origin + location.pathname + '#/s/' + slug; }
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? a : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? b : c; }

  var toastEl = document.querySelector('.toast'), toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  function crumbs(items) {
    var h = '<nav class="crumbs" aria-label="Навигация"><a href="#/">Жизненные ситуации</a>';
    items.forEach(function (it) { h += icon('chevron-right') + (it.href ? '<a href="' + it.href + '">' + esc(it.t) + '</a>' : '<span>' + esc(it.t) + '</span>'); });
    return h + '</nav>';
  }

  function qr(el, text, size) {
    if (!el) return;
    if (window.QRCode) { el.innerHTML = ''; new window.QRCode(el, { text: text, width: size, height: size, colorDark: '#0B1F33', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); }
    else el.innerHTML = '<span style="font-size:12px;color:#66727F">QR недоступен офлайн</span>';
  }

  /* ---------- search ---------- */
  var STOP = ['не', 'на', 'по', 'за', 'из', 'от', 'до', 'во', 'со', 'после', 'что', 'как', 'для', 'мой', 'моя', 'мое', 'мои', 'меня', 'мне', 'нас', 'нам', 'это', 'уже', 'или', 'при', 'без', 'все', 'всё', 'его', 'она', 'они', 'him', 'когда', 'где', 'надо', 'нужно', 'делать', 'что-то', 'очень', 'если', 'над', 'под', 'про', 'так', 'там', 'тут', 'чем', 'чтобы'];
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' '); }
  function toks(s) { return norm(s).split(/[\s-]+/).filter(function (w) { return w.length >= 2 && STOP.indexOf(w) < 0; }); }
  function wmatch(a, b) {
    var n = Math.min(a.length, b.length), i = 0;
    while (i < n && a[i] === b[i]) i++;
    if (a.length <= 3 || b.length <= 3) return a === b;
    return i >= Math.max(4, n - 4);
  }
  function search(q) {
    var qt = toks(q); if (!qt.length) return [];
    var res = [];
    allSlugs().forEach(function (slug) {
      var s = D.situations[slug], sp = sphereOf(slug);
      var fields = [[toks(titleOf(slug)), 3], [toks(descOf(slug)), 1], [toks(sp ? sp.title : ''), 1]];
      if (s) { fields.push([toks(s.h1), 2]); fields.push([toks(s.synonyms.join(' ')), 3]); fields.push([toks(s.intro), 0.5]); }
      var score = 0, hit = 0;
      qt.forEach(function (w) {
        var best = 0;
        fields.forEach(function (f) { if (f[1] > best && f[0].some(function (d) { return wmatch(w, d); })) best = f[1]; });
        if (best) hit++; score += best;
      });
      if (score > 0) res.push({ slug: slug, score: score + (s ? 0.75 : 0) + hit });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res.filter(function (x) { return x.score >= res[0].score * 0.45; });
  }

  function sitRow(slug) {
    var r = isReady(slug), sp = sphereOf(slug);
    return '<a class="sit-row" href="#/situations/' + slug + '"><span class="ico">' + icon(sp ? sp.icon : 'circle') + '</span><span><h3>' +
      esc(r ? D.situations[slug].h1 : titleOf(slug)) + '</h3><p>' + esc((sp ? sp.title + ' · ' : '') + descOf(slug)) + '</p></span>' +
      '<span class="pill ' + (r ? 'r">Путеводитель готов' : 'd">В разработке') + '</span><span class="go">' + icon('chevron-right') + '</span></a>';
  }

  function bindSuggest(form) {
    var input = form.querySelector('input'), box = form.parentNode.querySelector('.suggest');
    form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value.trim(); location.hash = '#/search?q=' + encodeURIComponent(v); });
    if (!box) return;
    input.addEventListener('input', function () {
      var v = input.value.trim();
      if (v.length < 3) { box.hidden = true; return; }
      var r = search(v).slice(0, 5);
      if (!r.length) { box.innerHTML = '<div class="sg-empty">Пока не нашли. Нажмите «Найти» — покажем все сферы.</div>'; box.hidden = false; return; }
      box.innerHTML = r.map(function (x) {
        var s = D.situations[x.slug];
        return '<a href="#/situations/' + x.slug + '"><b>' + esc(s ? s.h1 : titleOf(x.slug)) + '</b><span>' + esc(sphereOf(x.slug).title) + (s ? ' · путеводитель готов' : ' · в разработке') + '</span></a>';
      }).join('');
      box.hidden = false;
    });
    document.addEventListener('click', function (e) { if (!form.parentNode.contains(e.target)) box.hidden = true; });
  }

  /* ---------- HOME ---------- */
  function viewHome() {
    var total = allSlugs().length;
    var chips = [['Близкому нужен уход', 'uhod-za-tyazhelobolnym'], ['Меняю профессию', 'smena-professii'], ['Ребёнок пошёл в школу', 'rebenok-v-shkolu'], ['Не получается завести ребёнка', 'planirovanie-rebenka'], ['Родился ребёнок', 'rozhdenie-rebenka'], ['Выхожу на пенсию', 'pensiya']];
    var h = '<section class="hero"><div class="wrap hero-in"><div><h1>Навигатор по жизненным ситуациям</h1>' +
      '<p class="hero-sub">Путеводители, которые помогут подготовиться к важным моментам жизни и найти дорогу в трудный день. Шаги, сроки и контакты проверены и обновляются.</p>' +
      '<div class="hero-meta"><span>' + icon('shield-check') + 'Проверяют врачи, юристы, соцработники</span><span>' + icon('book-open') + 'Связан с книгой «Путеводитель российской семьи»</span></div></div>' +
      '<div class="hero-search"><form class="sbox" role="search"><input type="search" name="q" autocomplete="off" aria-label="Что у вас случилось?" placeholder="Что у вас случилось? Например: «маму выписывают после инсульта»"><button type="submit" aria-label="Найти">' + icon('search') + '</button></form>' +
      '<div class="suggest" hidden></div>' +
      '<div class="qchips">' + chips.map(function (c) { return '<a class="qchip" href="#/situations/' + c[1] + '">' + c[0] + '</a>'; }).join('') + '</div>' +
      '<p class="hint">Пишите своими словами — как рассказали бы другу. <button type="button" data-try="маму выписывают после инсульта">Попробовать пример</button></p></div></div></section>';

    h += '<section class="sec"><div class="wrap"><div class="sec-head"><div><h2>Сферы жизни</h2></div>' +
      '<a class="counter" href="#/kniga"><span>' + D.spheres.length + ' сфер · ' + total + ' ' + plural(total, 'ситуация', 'ситуации', 'ситуаций') + '</span> <span>· все 84 раздела книги →</span></a></div><div class="spheres">';
    D.spheres.forEach(function (sp) {
      var shown = 0, extra = 0;
      var items = sp.situations.map(function (sl) {
        var r = isReady(sl), x = !r && shown >= 2; if (!x) shown++; else extra++;
        return '<li' + (x ? ' class="x"' : '') + '><a class="' + (r ? 'ready' : '') + '" href="#/situations/' + sl + '">' + esc(titleOf(sl)) + '</a></li>';
      }).join('');
      h += '<div class="sphere"><a class="sphere-h" href="#/sphere/' + sp.id + '"><span class="ico">' + icon(sp.icon) + '</span>' + esc(sp.title) + '</a><ul>' + items + '</ul>' +
        (extra ? '<button type="button" class="sphere-more" data-more>Ещё ' + extra + ' ' + plural(extra, 'ситуация', 'ситуации', 'ситуаций') + icon('chevron-down') + '</button>' : '') + '</div>';
    });
    h += '</div><div class="legend-ready"><span><b>Синим</b> отмечены готовые путеводители с пошаговым маршрутом</span><span>Остальные разделы пишут и проверяют эксперты</span></div></div></section>';

    h += '<section class="sec sec-white"><div class="wrap"><div class="sec-head"><div><h2>С чего начать</h2><p class="sub">Путеводители, которые уже можно пройти по шагам</p></div></div><div class="gcards">';
    ['uhod-za-tyazhelobolnym', 'smena-professii', 'rebenok-v-shkolu', 'planirovanie-rebenka'].forEach(function (sl) {
      var s = D.situations[sl], sp = sphereById(s.sphere);
      h += '<a class="gcard" href="#/situations/' + sl + '"><div class="gcard-top"><span class="ico">' + icon(sp.icon) + '</span><span class="gcard-who">История: ' + esc(s.persona.name) + '</span></div>' +
        '<div class="gcard-b"><h3>' + esc(s.h1) + '</h3><p>' + esc(s.card) + '</p><span class="gcard-f">' + s.route.length + ' шагов маршрута ' + icon('arrow-right') + '</span></div></a>';
    });
    h += '</div></div></section>';

    h += '<section class="sec"><div class="wrap"><div class="sec-head"><div><h2>Как это работает</h2><p class="sub">Книга дома — маршрут в привычных Госуслугах. Без новых приложений и регистраций.</p></div></div><div class="how">' +
      '<div class="how-i"><div class="num">1</div><h3>Книга вручается в важный день</h3><p>Свадьба, рождение ребёнка, первая работа. Она остаётся дома и открывается не подряд, а по ситуации.</p></div>' +
      '<div class="how-i"><div class="num">2</div><h3>QR-код в каждом разделе</h3><p>Наводите камеру — и сразу попадаете в нужную ситуацию. Без поиска и меню.</p></div>' +
      '<div class="how-i"><div class="num">3</div><h3>Маршрут со свежими данными</h3><p>Книга хранит то, что не устаревает: порядок шагов. Навигатор — то, что меняется: суммы, сроки, телефоны.</p></div>' +
      '</div><div class="how-cta"><a class="btn btn-ghost" href="#/qr">' + icon('qr-code') + 'QR-коды для книги</a><a class="btn btn-line" href="#/about">' + icon('info') + 'О проекте</a></div></div></section>';
    app.innerHTML = h;
    bindSuggest(app.querySelector('.sbox'));
    if (window.innerWidth < 600) app.querySelector('.sbox input').placeholder = 'Что у вас случилось?';
    app.querySelectorAll('[data-more]').forEach(function (b) { b.addEventListener('click', function () { b.parentNode.classList.add('open'); b.remove(); }); });
    var t = app.querySelector('[data-try]');
    t.addEventListener('click', function () { var i = app.querySelector('.sbox input'); i.value = t.getAttribute('data-try'); i.dispatchEvent(new Event('input')); i.focus(); });
  }

  /* ---------- SITUATION ---------- */
  function factsHtml(st) {
    var f = '';
    if (st.where) f += '<div class="fact wide"><div class="fact-k">' + icon('map-pin') + 'Куда обратиться</div><div class="fact-v">' + esc(st.where) + '</div></div>';
    if (st.bring) f += '<div class="fact' + (st.bring.length > 2 ? ' wide' : '') + '"><div class="fact-k">' + icon('file-text') + 'Что взять</div><div class="fact-v">' + (st.bring.length > 1 ? '<ul>' + st.bring.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : esc(st.bring[0])) + '</div></div>';
    if (st.cost) f += '<div class="fact"><div class="fact-k">' + icon('wallet') + 'Стоимость</div><div class="fact-v">' + esc(st.cost) + '</div></div>';
    var small = (st.bring && st.bring.length <= 2 ? 1 : 0) + (st.cost ? 1 : 0);
    f += '<div class="fact' + (small % 2 === 0 ? ' wide' : '') + '"><div class="fact-k">' + icon('clock') + 'Когда</div><div class="fact-v">' + esc(st.when) + (st.time ? '. ' + esc(st.time) : '') + '</div></div>';
    return '<div class="facts">' + f + '</div>';
  }
  function actionHtml(a) {
    if (!a) return '';
    if (a.href) return '<a class="btn btn-primary" href="' + a.href + '"' + (/^http/.test(a.href) ? ' target="_blank" rel="noopener"' : '') + '>' + icon(a.icon || 'arrow-right') + esc(a.label) + '</a>';
    return '<button type="button" class="btn btn-primary" data-toast="В прототипе заявление не отправляется. На Госуслугах здесь откроется форма услуги с уже заполненными данными.">' + icon(a.icon || 'arrow-right') + esc(a.label) + '</button>';
  }
  function stepBody(st, i, n, done) {
    return '<div class="panel-k"><span class="tag tag-' + st.tag + '">' + TAG[st.tag] + '</span>Шаг ' + (i + 1) + ' из ' + n + '</div>' +
      '<h3>' + esc(st.title) + '</h3><p class="panel-text">' + esc(st.text) + '</p>' + factsHtml(st) +
      (st.note ? '<div class="note">' + icon('info') + '<span>' + esc(st.note) + '</span></div>' : '') +
      '<div class="panel-act">' + actionHtml(st.action) + '<button type="button" class="done-btn" data-done="' + i + '" aria-pressed="' + (done ? 'true' : 'false') + '">' + icon(done ? 'check-circle-2' : 'circle') + (done ? 'Сделано' : 'Отметить как сделано') + '</button></div>' +
      (st.basis ? '<p class="basis">Основание: ' + esc(st.basis) + '</p>' : '') +
      '<div class="panel-nav"><button type="button" data-go="' + (i - 1) + '"' + (i === 0 ? ' disabled' : '') + '>' + icon('arrow-left') + 'Предыдущий</button><button type="button" data-go="' + (i + 1) + '"' + (i === n - 1 ? ' disabled' : '') + '>Следующий шаг' + icon('arrow-right') + '</button></div>';
  }

  function mountRoute(root, slug, s, active) {
    var done = store('done-' + slug) || [];
    var n = s.route.length, cnt = done.length;
    var h = '<div class="progress"><span>Пройдено ' + cnt + ' из ' + n + '</span><span class="progress-bar"><i style="width:' + Math.round(cnt / n * 100) + '%"></i></span></div><div class="route"><ol class="steps">';
    s.route.forEach(function (st, i) {
      var d = done.indexOf(i) > -1;
      h += '<li class="step' + (i === active ? ' on' : '') + (d ? ' done' : '') + '"><button type="button" class="step-btn" data-step="' + i + '" aria-expanded="' + (i === active) + '">' +
        '<span class="step-n">' + (d ? icon('check') : (i + 1)) + '</span><span><span class="step-t">' + esc(st.title) + '</span><span class="step-sub"><span class="tag tag-' + st.tag + '">' + TAG[st.tag] + '</span><span class="step-when' + (NOW.indexOf(st.when) > -1 ? ' now' : '') + '">' + esc(st.when) + '</span></span></span>' +
        '<span class="step-chev">' + icon('chevron-right') + '</span></button>' +
        (i === active ? '<div class="step-inline">' + stepBody(st, i, n, d) + '</div>' : '') + '</li>';
    });
    h += '</ol><div class="panel" aria-live="polite">' + stepBody(s.route[active], active, n, done.indexOf(active) > -1) + '</div></div>';
    root.innerHTML = h;
    icons();
    root.onclick = function (e) {
      var b = e.target.closest('[data-step],[data-go],[data-done]'); if (!b) return;
      if (b.hasAttribute('data-step')) { var k = +b.getAttribute('data-step'); mountRoute(root, slug, s, k); if (window.innerWidth <= 900) root.querySelectorAll('.step')[k].scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      else if (b.hasAttribute('data-go')) { var g = +b.getAttribute('data-go'); mountRoute(root, slug, s, g); var el = window.innerWidth <= 900 ? root.querySelectorAll('.step')[g] : root; el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      else {
        var j = +b.getAttribute('data-done'), arr = store('done-' + slug) || [], p = arr.indexOf(j);
        if (p > -1) arr.splice(p, 1); else arr.push(j);
        store('done-' + slug, arr);
        var next = active;
        if (p < 0 && active < n - 1) { next = active + 1; toast('Отлично! Следующий шаг: ' + s.route[next].title); }
        mountRoute(root, slug, s, next);
      }
    };
  }

  function stagesHtml(s) {
    if (s.stagesMode === 'tabs') {
      return '<div class="agetabs" role="tablist">' + s.stages.map(function (st, i) { return '<button class="agetab" role="tab" data-age="' + i + '" aria-selected="' + (i === 2) + '">' + esc(st.short) + '</button>'; }).join('') + '</div><div class="agepanel" role="tabpanel"></div>';
    }
    return '<div class="stages">' + s.stages.map(function (st, i) { return '<div class="stage' + (st.accent ? ' accent' : '') + '"><span class="stage-n">' + (i + 1) + '</span><h3>' + esc(st.title) + '</h3><p>' + esc(st.text) + '</p></div>'; }).join('') + '</div>';
  }
  function setAge(root, s, i) {
    var st = s.stages[i];
    root.querySelectorAll('.agetab').forEach(function (b) { b.setAttribute('aria-selected', String(+b.getAttribute('data-age') === i)); });
    root.querySelector('.agepanel').innerHTML = '<div><h3>' + esc(st.title) + '</h3><p>' + esc(st.text) + '</p></div><ul>' + st.tips.map(function (t) { return '<li>' + icon('check') + '<span>' + esc(t) + '</span></li>'; }).join('') + '</ul>';
    icons();
  }

  function formatHtml(f, slug, i) {
    var h = '<div class="fmt' + (f.type === 'mentor' || f.type === 'checklist' ? ' wide' : '') + '" data-fmt="' + i + '"><div class="fmt-h"><span class="ico">' + icon(f.icon) + '</span><h3>' + esc(f.title) + '</h3></div><p>' + esc(f.text) + '</p>';
    if (f.type === 'checklist') {
      var got = store('chk-' + slug) || [];
      h += '<ul class="chk">' + f.items.map(function (it, k) { return '<li><label><input type="checkbox" data-chk="' + k + '"' + (got.indexOf(k) > -1 ? ' checked' : '') + '><span>' + esc(it) + '</span></label></li>'; }).join('') + '</ul><div class="fmt-act"><span class="chk-count ok"></span><button type="button" class="btn btn-line" data-print>' + icon('printer') + 'Распечатать список</button></div>';
    } else if (f.type === 'remind') {
      h += '<div class="fmt-act"><button type="button" class="btn btn-ghost" data-remind>' + icon('bell-plus') + 'Включить напоминание</button></div>';
    } else if (f.type === 'link') {
      h += '<div class="fmt-act"><a class="btn btn-line" href="' + f.href + '" target="_blank" rel="noopener">' + icon('external-link') + esc(f.label) + '</a></div>';
    } else if (f.type === 'peer') {
      h += '<div class="fmt-act"><button type="button" class="btn btn-ghost" data-toast="В пилоте здесь появится запись на встречу и контакты проверенного наставника.">' + icon('users') + esc(f.label) + '</button></div>';
    } else if (f.type === 'calc') {
      h += '<div class="calc"><input type="number" inputmode="numeric" min="0" step="1000" placeholder="Стоимость, ₽" aria-label="Стоимость обучения в рублях" data-calc><span class="calc-out" aria-live="polite">— ₽</span></div><p class="calc-note">13% от расходов, но не больше 19 500 ₽ в год (лимит — 150 000 ₽ расходов). Оформляется в личном кабинете налогоплательщика.</p>';
    } else if (f.type === 'mentor') {
      h += '<ol class="mentor">' + f.steps.map(function (m) { return '<li><b>' + esc(m[0]) + '</b>' + esc(m[1]) + '</li>'; }).join('') + '</ol><div class="fmt-act"><button type="button" class="btn btn-ghost" data-toast="Запрос принят (демо). В пилоте вам подберут наставника внутри Группы.">' + icon('send') + 'Оставить запрос на пробу</button></div>';
    } else if (f.type === 'questions') {
      h += '<div class="qcard" aria-live="polite">' + esc(f.items[0]) + '</div><div class="fmt-act"><button type="button" class="btn btn-ghost" data-nextq>' + icon('refresh-cw') + 'Другой вопрос</button></div>';
    }
    return h + '</div>';
  }

  function bindFormats(root, s, slug) {
    var chkCount = function () {
      var c = root.querySelector('.chk-count'); if (!c) return;
      var all = root.querySelectorAll('[data-chk]'), on = root.querySelectorAll('[data-chk]:checked').length;
      c.innerHTML = on === all.length ? icon('check-circle-2') + 'Дом готов к выписке' : 'Готово ' + on + ' из ' + all.length; icons();
    };
    chkCount();
    root.addEventListener('change', function (e) {
      if (e.target.matches('[data-chk]')) {
        var arr = []; root.querySelectorAll('[data-chk]').forEach(function (x) { if (x.checked) arr.push(+x.getAttribute('data-chk')); });
        store('chk-' + slug, arr); chkCount();
      }
    });
    root.addEventListener('input', function (e) {
      if (e.target.matches('[data-calc]')) {
        var v = parseFloat(e.target.value) || 0, r = Math.min(Math.round(v * 0.13), 19500);
        e.target.parentNode.querySelector('.calc-out').textContent = v > 0 ? 'вернётся ' + r.toLocaleString('ru-RU') + ' ₽' : '— ₽';
      }
    });
    var qi = 0;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-remind],[data-nextq],[data-print]'); if (!b) return;
      if (b.hasAttribute('data-remind')) { b.outerHTML = '<span class="ok">' + icon('check-circle-2') + 'Напоминание включено (демо)</span>'; icons(); }
      if (b.hasAttribute('data-nextq')) {
        var f = s.formats.filter(function (x) { return x.type === 'questions'; })[0];
        qi = (qi + 1) % f.items.length; b.closest('.fmt').querySelector('.qcard').textContent = f.items[qi];
      }
      if (b.hasAttribute('data-print')) window.print();
    });
  }

  function viewSituation(slug, fromBook) {
    var s = D.situations[slug];
    if (!s) return viewStub(slug, fromBook);
    var sp = sphereById(s.sphere), n = s.route.length;
    document.title = s.h1 + ' — Жизненные ситуации';
    var h = '';
    if (fromBook) h += '<div class="frombook"><div class="wrap frombook-in">' + icon('book-open') + '<span>Вы перешли по QR-коду из книги — ' + esc(s.bookRef.part) + ', раздел ' + s.bookRef.section + '. Здесь самые свежие сроки, суммы и контакты.</span><button type="button" aria-label="Скрыть" data-close>' + icon('x') + '</button></div></div>';
    h += '<section class="shero"><div class="wrap">' + crumbs([{ t: sp.title, href: '#/sphere/' + sp.id }, { t: s.title }]) + '<div class="shero-in"><div>' +
      '<div class="kicker">' + icon(sp.icon) + esc(sp.title) + ' · путеводитель</div><h1>' + esc(s.h1) + '</h1><p class="intro">' + esc(s.intro) + '</p>' +
      '<div class="smeta"><span>' + icon('route') + n + ' шагов маршрута</span><span>' + icon('clock') + 'Читать ' + s.readTime + ' минут' + (s.readTime < 5 ? 'ы' : '') + '</span><span>' + icon('shield-check') + 'Проверяется экспертами · ' + D.checkedAt + '</span><span>' + icon('book-open') + 'Книга: раздел ' + s.bookRef.section + '</span></div></div>' +
      '<aside class="persona"><div class="persona-top"><span class="avatar">' + esc(s.persona.initials) + '</span><div><div class="persona-name">' + esc(s.persona.name) + ', ' + esc(s.persona.age) + '</div><div class="persona-sub">История из интервью проекта</div></div></div>' +
      '<p class="persona-text">' + esc(s.persona.text) + '</p><q>' + esc(s.persona.quote) + '</q></aside></div>';
    var t = s.today, tbtn = '';
    if (t.tel) tbtn = '<a class="btn" href="tel:' + t.tel + '">' + icon('phone') + t.phone + '</a>';
    else if (t.link) tbtn = '<a class="btn" href="' + t.link.href + '" target="_blank" rel="noopener">' + icon('external-link') + esc(t.link.label) + '</a>';
    else if (t.demo) tbtn = '<button type="button" class="btn" data-toast="В прототипе запись не создаётся. На Госуслугах здесь откроется запись к врачу.">' + icon('calendar') + esc(t.demo.label) + '</button>';
    else tbtn = '<button type="button" class="btn" data-scroll="route">' + icon('arrow-down') + 'К маршруту</button>';
    h += '<div class="today"><span class="today-ico">' + icon('footprints') + '</span><div><div class="today-k">Сегодня сделайте только одно</div><div class="today-t">' + esc(t.text) + '</div><div class="today-n">' + esc(t.note) + '</div></div>' + tbtn + '</div></div></section>';

    var tabs = [['overview', 'Обзор'], ['route', 'Маршрут · ' + n + ' шагов']];
    if (s.beforeAfter) tabs.push(['ba', 'Как это меняет жизнь']);
    tabs.push(['formats', 'Поддержка'], ['wrong', 'Если что-то не так'], ['live', 'Живой человек'], ['trust', 'Источники']);
    h += '<nav class="ltabs" aria-label="Разделы страницы"><div class="wrap ltabs-in">' + tabs.map(function (x, i) { return '<a href="#" data-scroll="' + x[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + x[1] + '</a>'; }).join('') + '</div></nav>';

    h += '<div class="wrap">';
    h += '<section class="block anchor" id="overview"><div class="block-h"><div><h2>' + esc(s.stagesTitle) + '</h2><p>' + esc(s.stagesSub || 'Не нужно делать всё сразу. Вот из чего состоит путь.') + '</p></div></div>' + stagesHtml(s) +
      '<div class="important"><div class="important-h">' + icon('lightbulb') + 'Важно знать</div><div class="important-g">' + s.important.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</div></div></section>';
    h += '<section class="block anchor" id="route"><div class="block-h"><div><h2>' + esc(s.routeTitle) + '</h2><p>Выберите шаг — откроется всё, что нужно: куда идти, что взять, сколько стоит.</p></div>' +
      '<div class="legend"><span><span class="tag tag-UZNAT">УЗНАТЬ</span>куда обратиться</span><span><span class="tag tag-OFORMIT">ОФОРМИТЬ</span>заявление</span><span><span class="tag tag-POLUCHIT">ПОЛУЧИТЬ</span>что положено</span></div></div><div id="route-root"></div></section>';
    if (s.beforeAfter) {
      var ba = s.beforeAfter;
      h += '<section class="block anchor" id="ba"><div class="block-h"><div><h2>' + esc(ba.title) + '</h2></div></div><div class="ba">' +
        '<div class="ba-h b">' + esc(ba.beforeTitle || 'Без путеводителя') + '</div><div class="ba-h a">' + esc(ba.afterTitle || 'С путеводителем') + '</div>' +
        ba.rows.map(function (r) { return '<div class="ba-row b" data-l="' + esc(ba.beforeTitle || 'Без путеводителя') + '">' + icon('x') + '<span>' + esc(r[0]) + '</span></div><div class="ba-row a" data-l="' + esc(ba.afterTitle || 'С путеводителем') + '">' + icon('check') + '<span>' + esc(r[1]) + '</span></div>'; }).join('') +
        '</div><div class="ba-out">' + esc(ba.outro) + '</div></section>';
    }
    h += '<section class="block anchor" id="formats"><div class="block-h"><div><h2>Поддержка, которая придёт сама</h2><p>Не только инструкции: инструменты, напоминания и люди рядом.</p></div></div><div class="formats">' + s.formats.map(function (f, i) { return [f, i]; }).sort(function (a, b) { var w = function (x) { return x[0].type === 'mentor' || x[0].type === 'checklist' ? 0 : 1; }; return w(a) - w(b) || a[1] - b[1]; }).map(function (p) { return formatHtml(p[0], slug, p[1]); }).join('') + '</div></section>';
    h += '<section class="block anchor" id="wrong"><div class="block-h"><div><h2>Если что-то не так</h2><p>Отказ — не конец пути. Вот что можно сделать.</p></div></div><div class="wrong">' +
      s.ifWrong.map(function (w) { return '<div class="wrong-i"><div class="wrong-q">' + icon('alert-circle') + '<span>' + esc(w.q) + '</span></div><div class="wrong-a">' + icon('arrow-right-circle') + '<span>' + esc(w.a) + '</span></div></div>'; }).join('') + '</div></section>';
    var lh = s.liveHelp.hotline, pe = s.liveHelp.peer;
    var hbtn = lh.tel ? '<a class="btn" href="tel:' + lh.tel + '">' + icon('phone') + 'Позвонить</a>' : (lh.href ? '<a class="btn" href="' + lh.href + '" target="_blank" rel="noopener">' + icon('external-link') + 'Открыть сайт</a>' : '');
    h += '<section class="block anchor" id="live"><div class="block-h"><div><h2>Живой человек</h2><p>Иногда нужен не текст, а разговор.</p></div></div><div class="live">' +
      '<div class="live-i h"><span class="live-k">Позвонить</span><h3>' + esc(lh.title) + '</h3><div class="live-phone">' + esc(lh.phone) + '</div><p>' + esc(lh.note) + '</p>' + hbtn + '</div>' +
      '<div class="live-i p"><span class="live-k" style="color:#0D4CD3">Поговорить с тем, кто прошёл этот путь</span><h3>' + esc(pe.title) + '</h3><p>' + esc(pe.note) + '</p><button type="button" class="btn btn-primary" data-toast="В пилоте здесь появится запись к проверенному наставнику.">' + icon('message-circle') + 'Найти наставника</button></div></div></section>';
    h += '<section class="block anchor" id="trust"><div class="trust"><div>' +
      '<div class="trust-row">' + icon('shield-check') + '<div><b>Проверяется экспертами:</b> ' + esc(s.checkedBy) + '. Черновик от ' + D.checkedAt + '.</div></div>' +
      '<div class="trust-row">' + icon('book-open') + '<div><b>В книге:</b> ' + esc(s.bookRef.part) + ', раздел ' + s.bookRef.section + '. QR-код ведёт на эту страницу.</div></div>' +
      '<div class="trust-src"><b>Источники</b><ul>' + s.sources.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p style="margin-top:8px">Суммы, сроки и телефоны сверяйте на дату обращения.</p></div></div>' +
      '<div class="qrbox"><div class="qr" id="sit-qr"></div><p>QR-код раздела ' + s.bookRef.section + '</p></div></div>' +
      '<div class="fb"><b>Эта страница помогла?</b><button type="button" class="btn btn-line" data-fb="yes">' + icon('thumbs-up') + 'Да</button><button type="button" class="btn btn-line" data-fb="no">' + icon('thumbs-down') + 'Не совсем</button></div></section>';
    h += '</div>';
    app.innerHTML = h;

    mountRoute(document.getElementById('route-root'), slug, s, 0);
    if (s.stagesMode === 'tabs') {
      var ov = document.getElementById('overview'); setAge(ov, s, 2);
      ov.addEventListener('click', function (e) { var b = e.target.closest('[data-age]'); if (b) setAge(ov, s, +b.getAttribute('data-age')); });
    }
    bindFormats(document.getElementById('formats'), s, slug);
    qr(document.getElementById('sit-qr'), shareUrl(slug), 140);
    var fb = app.querySelector('.fb');
    fb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fb]'); if (!b) return;
      fb.innerHTML = b.getAttribute('data-fb') === 'yes' ? '<span class="ok">' + icon('check-circle-2') + 'Спасибо! Так мы понимаем, какие маршруты работают.</span>' : '<span class="ok">' + icon('check-circle-2') + 'Спасибо. Эксперты посмотрят, что улучшить.</span>';
      icons();
    });
    var cl = app.querySelector('[data-close]'); if (cl) cl.addEventListener('click', function () { cl.closest('.frombook').remove(); });
    spy();
  }

  function spy() {
    if (observer) observer.disconnect();
    var links = app.querySelectorAll('.ltabs a'); if (!links.length || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) links.forEach(function (a) {
          var on = a.getAttribute('data-scroll') === en.target.id; a.classList.toggle('on', on);
          if (on && a.scrollIntoView && window.innerWidth < 900) a.parentNode.scrollLeft = a.offsetLeft - 16;
        });
      });
    }, { rootMargin: '-140px 0px -60% 0px' });
    app.querySelectorAll('.anchor').forEach(function (s) { observer.observe(s); });
  }

  /* ---------- STUB ---------- */
  function viewStub(slug, fromBook) {
    var st = D.stubs[slug]; if (!st) return viewNotFound();
    var sp = sphereOf(slug);
    document.title = st[0] + ' — Жизненные ситуации';
    var h = (fromBook ? '<div class="frombook"><div class="wrap frombook-in">' + icon('book-open') + '<span>Вы перешли по QR-коду из книги.</span></div></div>' : '') +
      '<div class="wrap">' + crumbs([{ t: sp.title, href: '#/sphere/' + sp.id }, { t: st[0] }]) +
      '<div class="stub"><div><span class="stub-badge">' + icon('pencil-line') + 'Путеводитель в разработке</span><h1>' + esc(st[0]) + '</h1><p class="intro">' + esc(st[1]) + '</p>' +
      '<p style="margin-top:16px;color:#33475B">Этот раздел сейчас пишут и проверяют эксперты: врачи, юристы, социальные работники. Как только маршрут будет готов, здесь появятся шаги, сроки и контакты.</p>' +
      '<div class="how-cta"><button type="button" class="btn btn-primary" data-vote>' + icon('heart') + 'Эта тема важна для меня</button><a class="btn btn-line" href="#/sphere/' + sp.id + '">Другие ситуации сферы «' + esc(sp.title) + '»</a></div></div>' +
      '<aside class="stub-side"><h3>Уже можно пройти по шагам</h3>' + readySlugs().map(function (r) { return '<a href="#/situations/' + r + '">' + icon('arrow-right') + esc(D.situations[r].h1) + '</a>'; }).join('') + '</aside></div></div>';
    app.innerHTML = h;
    var v = app.querySelector('[data-vote]');
    v.addEventListener('click', function () { v.outerHTML = '<span class="ok">' + icon('check-circle-2') + 'Спасибо! Учтём, какие разделы нужнее всего.</span>'; icons(); });
  }

  /* ---------- SPHERE ---------- */
  function viewSphere(id) {
    var sp = sphereById(id); if (!sp) return viewNotFound();
    document.title = sp.title + ' — Жизненные ситуации';
    app.innerHTML = '<div class="wrap">' + crumbs([{ t: sp.title }]) + '<div class="pagehead"><div class="kicker">' + icon(sp.icon) + 'Сфера жизни</div><h1>' + esc(sp.title) + '</h1><p>' + esc(sp.lead) + '</p></div>' +
      '<div class="sit-list">' + sp.situations.map(sitRow).join('') + '</div>' +
      '<div class="sec-head" style="margin-top:40px"><h2 style="font-size:24px">Другие сферы</h2></div><div class="qchips">' +
      D.spheres.filter(function (x) { return x.id !== id; }).map(function (x) { return '<a class="agetab" style="display:inline-flex;align-items:center" href="#/sphere/' + x.id + '">' + esc(x.title) + '</a>'; }).join('') + '</div></div>';
  }

  /* ---------- SEARCH ---------- */
  function viewSearch(q) {
    document.title = 'Поиск — Жизненные ситуации';
    var r = q ? search(q) : [];
    var h = '<div class="wrap">' + crumbs([{ t: 'Поиск' }]) + '<div class="pagehead"><h1>Что у вас случилось?</h1><p>Пишите своими словами. Например: «маму выписывают после инсульта», «на работе внедряют ИИ», «сын замкнулся в школе».</p>' +
      '<div style="position:relative;max-width:760px"><form class="sbox big" role="search"><input type="search" name="q" autocomplete="off" aria-label="Что у вас случилось?" value="' + esc(q) + '" placeholder="Опишите ситуацию"><button type="submit" aria-label="Найти">' + icon('search') + '</button></form><div class="suggest" hidden></div></div></div>';
    if (q && r.length) h += '<p style="color:#66727F;margin-bottom:12px">' + (r.length) + ' ' + plural(r.length, 'совпадение', 'совпадения', 'совпадений') + ' по запросу «' + esc(q) + '»</p><div class="sit-list">' + r.slice(0, 12).map(function (x) { return sitRow(x.slug); }).join('') + '</div>';
    else if (q) h += '<div class="empty"><h3>Пока не нашли точного совпадения</h3><p style="color:#66727F">Попробуйте другими словами или выберите сферу жизни — так тоже быстро.</p><div class="qchips" style="margin-top:14px">' + D.spheres.map(function (x) { return '<a class="agetab" style="display:inline-flex;align-items:center" href="#/sphere/' + x.id + '">' + esc(x.title) + '</a>'; }).join('') + '</div></div>';
    else h += '<div class="sec-head"><h2 style="font-size:24px">Готовые путеводители</h2></div><div class="sit-list">' + readySlugs().map(sitRow).join('') + '</div>';
    app.innerHTML = h + '</div>';
    bindSuggest(app.querySelector('.sbox'));
    if (!q) app.querySelector('.sbox input').focus();
  }

  /* ---------- BOOK ---------- */
  function viewBook() {
    document.title = 'Книга — Путеводитель российской семьи';
    var map = {};
    readySlugs().forEach(function (sl) { var p = D.situations[sl].bookRef.part.split(' ')[1]; (map[p] = map[p] || []).push(sl); });
    app.innerHTML = '<div class="wrap">' + crumbs([{ t: 'Книга: 84 раздела' }]) + '<div class="pagehead"><div class="kicker">' + icon('book-open') + 'Путеводитель российской семьи</div><h1>12 частей, 84 раздела</h1><p>Книга открывается не подряд, а по ситуации. В каждом разделе — QR-код, который ведёт сюда, в навигатор, где сроки, суммы и телефоны всегда свежие.</p></div>' +
      '<div class="book">' + D.bookParts.map(function (b) {
        var l = (map[b.n] || []).map(function (sl) { return '<a href="#/situations/' + sl + '">→ ' + esc(D.situations[sl].h1) + ' (раздел ' + D.situations[sl].bookRef.section + ')</a>'; }).join('');
        return '<div class="book-i"><h3>' + b.n + '. ' + esc(b.title) + '</h3><div class="r">Разделы ' + b.range + '</div><p>' + esc(b.about) + '</p>' + (l ? '<div class="links">' + l + '</div>' : '') + '</div>';
      }).join('') + '</div></div>';
  }

  /* ---------- QR ---------- */
  function viewQR() {
    document.title = 'QR-коды для книги';
    var list = readySlugs();
    app.innerHTML = '<div class="wrap">' + crumbs([{ t: 'QR-коды для книги' }]) + '<div class="pagehead"><h1>QR-коды для печатной книги</h1><p>Каждый код ведёт сразу в нужную ситуацию и показывает плашку «Вы перешли из книги». Наведите камеру телефона, чтобы проверить.</p>' +
      '<div class="how-cta no-print"><button type="button" class="btn btn-primary" onclick="window.print()">' + icon('printer') + 'Распечатать</button></div></div>' +
      '<div class="qrgrid">' + list.map(function (sl) { var s = D.situations[sl]; return '<div class="qritem"><div class="qr" data-qr="' + sl + '"></div><h3>Раздел ' + s.bookRef.section + ' · ' + esc(s.title) + '</h3><p>' + esc(shareUrl(sl)) + '</p></div>'; }).join('') + '</div>' +
      '<p style="color:#66727F;margin-top:16px;font-size:14px">Для разделов в разработке коды появятся, когда маршрут пройдёт проверку экспертов.</p></div>';
    app.querySelectorAll('[data-qr]').forEach(function (el) { qr(el, shareUrl(el.getAttribute('data-qr')), 150); });
  }

  /* ---------- ABOUT ---------- */
  function viewAbout() {
    document.title = 'О проекте — Путеводитель российской семьи';
    var stats = [['50%', 'сотрудников испытывают страх перед будущим', 'Опрос 629 сотрудников Группы, 2026'], ['15%', 'родителей знают меры поддержки в деталях', 'НАФИ, 2023'], ['33%', 'не обращаются за льготами, потому что не знают о них', 'Росгосстрах / РБК, 2021'], ['69%', 'говорят, что страх снижают семья и близкие', 'Опрос сотрудников Группы'], ['60+', 'нацпроектов и госпрограмм уже работают', 'Кабинетный анализ'], ['85+', 'фондов и НКО готовы помочь', 'Кабинетный анализ']];
    var cond = [['Не нужно искать', 'Книга дома, навигатор — в привычных Госуслугах.'], ['Первый шаг', 'Каждая ситуация начинается со слов «Сегодня сделайте…».'], ['Можно доверять', 'Шаги проверены врачами, юристами, соцслужбами; на странице — дата проверки.'], ['Живой человек', 'В каждой ситуации — горячая линия и тот, кто уже прошёл этот путь.'], ['Для всей семьи', 'От рождения ребёнка до ухода за родителями.']];
    app.innerHTML = '<div class="wrap">' + crumbs([{ t: 'О проекте' }]) + '<div class="pagehead"><div class="kicker">' + icon('compass') + 'Уверенность в будущем · «Код лидера»</div><h1>Помощь есть. Дороги к ней нет.</h1><p>«Путеводитель российской семьи» — книга и онлайн-навигатор. Мы не создаём новые меры, а собираем путь к тем, что уже есть.</p></div>' +
      '<div class="about-g">' + stats.map(function (s) { return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span><small>' + s[2] + '</small></div>'; }).join('') + '</div>' +
      '<p class="quote-big">«Мир построил маршрут. Россия построила каталог. Маршрут ведёт к решению, каталог — к растерянности».</p>' +
      '<div class="prose"><p>Страх будущего нельзя отменить: он приходит вместе с переломными событиями — рождением ребёнка, болезнью близкого, потерей работы. Но люди боятся не столько будущего, сколько неизвестности: в трудный день непонятно, что делать первым.</p><p>Принцип решения — не лечить страх, а сокращать беспомощность. Дать человеку маршрут, карту и знание.</p></div>' +
      '<div class="sec-head" style="margin-top:36px"><h2 style="font-size:28px">Пять условий — пять ответов</h2></div><div class="stages">' + cond.map(function (c, i) { return '<div class="stage"><span class="stage-n">' + (i + 1) + '</span><h3>' + c[0] + '</h3><p>' + c[1] + '</p></div>'; }).join('') + '</div>' +
      '<div class="empty" style="margin-top:28px"><h3>Это концепт-прототип</h3><p style="color:#66727F">Сайт показывает, как раздел «Жизненные ситуации» мог бы встроиться в Госуслуги. Он не является официальным сервисом, не собирает данные и не связан с порталом. Исследование: опрос 629 сотрудников, 21 глубинное интервью, 2 экспертных интервью, 6 месяцев кабинетного анализа (ВЦИОМ, Левада, НАФИ, Росстат; госсервисы 10 стран).</p></div></div>';
  }

  function viewNotFound() {
    app.innerHTML = '<div class="wrap"><div class="pagehead"><h1>Такой страницы нет</h1><p>Возможно, ссылка устарела. Начните с главной или поиска.</p><div class="how-cta"><a class="btn btn-primary" href="#/">Все жизненные ситуации</a><a class="btn btn-line" href="#/search">Поиск</a></div></div></div>';
  }

  /* ---------- router ---------- */
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  function route() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qi = raw.indexOf('?'), path = qi > -1 ? raw.slice(0, qi) : raw, qs = qi > -1 ? raw.slice(qi + 1) : '';
    var params = {}; qs.split('&').forEach(function (p) { if (!p) return; var kv = p.split('='); params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); });
    var parts = path.split('/').filter(Boolean);
    document.title = 'Жизненные ситуации — концепт-прототип';
    if (observer) { observer.disconnect(); observer = null; }
    if (!parts.length) viewHome();
    else if (parts[0] === 'situations' && parts[1]) viewSituation(parts[1], false);
    else if (parts[0] === 's' && parts[1]) viewSituation(parts[1], true);
    else if (parts[0] === 'sphere' && parts[1]) viewSphere(parts[1]);
    else if (parts[0] === 'search') viewSearch(params.q || '');
    else if (parts[0] === 'kniga') viewBook();
    else if (parts[0] === 'qr') viewQR();
    else if (parts[0] === 'about') viewAbout();
    else viewNotFound();
    icons();
    window.scrollTo(0, 0);
    var m = document.querySelector('.mnav'); m.hidden = true; document.querySelector('.burger').setAttribute('aria-expanded', 'false');
  }

  /* ---------- global events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toast]');
    if (t) { e.preventDefault(); toast(t.getAttribute('data-toast')); return; }
    var l = e.target.closest('[data-toast-link]');
    if (l) { e.preventDefault(); toast('В прототипе работает раздел «Жизненные ситуации»'); return; }
    var sc = e.target.closest('[data-scroll]');
    if (sc) { e.preventDefault(); var el = document.getElementById(sc.getAttribute('data-scroll')); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    var b = e.target.closest('.burger');
    if (b) { var m = document.querySelector('.mnav'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); }
  });
  window.addEventListener('hashchange', route);
  route();
})();
