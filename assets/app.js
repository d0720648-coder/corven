/* ============================================================
   CORVEN — محرك الموقع + نظام التحرير المباشر
   ============================================================ */
(function () {
  'use strict';

  const BASE = window.CORVEN_BASE || '';
  const PAGE = window.CORVEN_PAGE || 'home';
  const LSK = 'corven_site_v1';
  const LSH = 'corven_pass_hash';

  const S = {
    data: null,
    admin: false,
    editing: false,
    cloud: null,     // {db, auth, ref, set, onValue}
    cloudOn: false,
    remoteReady: false
  };

  /* ============ أدوات ============ */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clone = o => JSON.parse(JSON.stringify(o));
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function getP(o, p) {
    return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  }
  function setP(o, p, v) {
    const ks = p.split('.'); const last = ks.pop();
    let cur = o;
    for (const k of ks) { if (cur[k] == null) cur[k] = /^\d+$/.test(k) ? [] : {}; cur = cur[k]; }
    cur[last] = v;
  }
  function merge(def, sav) {
    if (sav === undefined || sav === null) return clone(def);
    if (Array.isArray(def)) return Array.isArray(sav) ? clone(sav) : clone(def);
    if (typeof def === 'object' && def !== null) {
      if (typeof sav !== 'object' || sav === null) return clone(def);
      const out = {};
      const keys = new Set([...Object.keys(def), ...Object.keys(sav)]);
      keys.forEach(k => { out[k] = merge(def[k], sav[k]); });
      return out;
    }
    return sav;
  }
  async function sha256(t) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }

  let toastT;
  function toast(msg, kind) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg;
    el.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.className = ''; }, 2600);
  }

  /* ============ الهيدر والفوتر ============ */
  const NAV = [
    { k: 'home', t: 'الرئيسية', h: 'index.html' },
    { k: 'constitution', t: 'الدستور', h: 'pages/constitution.html' },
    { k: 'members', t: 'الأعضاء', h: 'pages/justice-members.html' },
    { k: 'commercial', t: 'الغرفة التجارية', h: 'pages/commercial.html' },
    { k: 'projects', t: 'المشاريع', h: 'pages/projects.html' },
    { k: 'updates', t: 'التحديثات', h: 'pages/updates.html' }
  ];

  function chrome() {
    const b = S.data.brand;
    const hdr = $('#hdr');
    if (hdr) {
      hdr.outerHTML = `
      <header class="site">
        <div class="bar">
          <a class="brand" href="${BASE}index.html">
            <img src="${BASE}assets/logo.png" alt="Corven">
            <span class="t">
              <b data-k="brand.ministry">${esc(b.ministry)}</b>
              <span data-k="brand.name">${esc(b.name)}</span>
            </span>
          </a>
          <button class="burger" id="burger" aria-label="القائمة">☰</button>
          <nav class="main" id="nav">
            ${NAV.map(n => `<a href="${BASE}${n.h}" class="${n.k === PAGE ? 'on' : ''}">${n.t}</a>`).join('')}
          </nav>
        </div>
      </header>`;
      const bg = $('#burger'), nv = $('#nav');
      if (bg) bg.onclick = () => nv.classList.toggle('open');
    }

    const ftr = $('#ftr');
    if (ftr) {
      ftr.outerHTML = `
      <footer class="site">
        <img class="lg" src="${BASE}assets/logo.png" alt="">
        <h4 data-k="brand.footTitle">${esc(b.footTitle)}</h4>
        <p data-k="brand.footLine">${esc(b.footLine)}</p>
        <div class="cp">
          <span data-k="brand.copy">${esc(b.copy)}</span>
          <button id="lockBtn" title="لوحة التحكم">🔒</button>
        </div>
      </footer>`;
      $('#lockBtn').onclick = openAdmin;
    }
  }

  /* ============ قوالب مساعدة ============ */
  function ctlRow(path, kind) {
    return `<div class="ctl"><button onclick="CORVEN.add('${path}','${kind}')">＋ إضافة</button></div>`;
  }
  function itemCtl(path, i) {
    return `<div class="item-ctl">
      <button title="أعلى" onclick="CORVEN.move('${path}',${i},-1)">▲</button>
      <button title="أسفل" onclick="CORVEN.move('${path}',${i},1)">▼</button>
      <button class="del" title="حذف" onclick="CORVEN.del('${path}',${i})">✕</button>
    </div>`;
  }
  function emptyBox(txt, ic) {
    return `<div class="empty"><div class="ic">${ic || '◇'}</div><p>${esc(txt)}</p></div>`;
  }

  /* ============ الصفحات ============ */
  const R = {};

  R.home = function () {
    const h = S.data.home;
    $('#hero').innerHTML = `
      <div class="emblem-wrap">
        <video class="crest-vid" autoplay muted loop playsinline preload="auto"
               poster="${BASE}assets/emblem-poster.jpg" aria-label="${esc(h.heroTitle)} — ${esc(h.heroEn)}">
          <source src="${BASE}assets/emblem.webm" type="video/webm">
          <source src="${BASE}assets/emblem.mp4" type="video/mp4">
        </video>
      </div>
      <p class="tag" data-k="home.heroTag">${esc(h.heroTag)}</p>
      <div class="cta">
        <a class="btn solid" href="${BASE}pages/constitution.html">الدستور</a>
        <a class="btn" href="${BASE}pages/justice-members.html">أعضاء الوزارة</a>
      </div>`;

    $('#stats').innerHTML = h.stats.map((s, i) => `
      <div class="card stat has-ctl">${itemCtl('home.stats', i)}
        <b data-k="home.stats.${i}.num">${esc(s.num)}</b>
        <span data-k="home.stats.${i}.label">${esc(s.label)}</span>
      </div>`).join('') ;
    $('#statsCtl').innerHTML = ctlRow('home.stats', 'stat');

    $('#about').innerHTML = `
      <div class="head">
        <span class="kicker" data-k="home.aboutKicker">${esc(h.aboutKicker)}</span>
        <h2 data-k="home.aboutTitle">${esc(h.aboutTitle)}<span class="u"></span></h2>
      </div>
      <div class="about"><p class="ml" data-k="home.aboutBody">${esc(h.aboutBody)}</p></div>`;

    $('#svcHead').innerHTML = `
      <span class="kicker" data-k="home.svcKicker">${esc(h.svcKicker)}</span>
      <h2 data-k="home.svcTitle">${esc(h.svcTitle)}<span class="u"></span></h2>
      <p data-k="home.svcSub">${esc(h.svcSub)}</p>`;

    $('#svc').innerHTML = h.services.map((s, i) => `
      <div class="card svc has-ctl">${itemCtl('home.services', i)}
        <div class="ic" data-k="home.services.${i}.icon">${esc(s.icon)}</div>
        <h3 data-k="home.services.${i}.title">${esc(s.title)}</h3>
        <p class="ml" data-k="home.services.${i}.desc">${esc(s.desc)}</p>
      </div>`).join('');
    $('#svcCtl').innerHTML = ctlRow('home.services', 'service');

    $('#annHead').innerHTML = `
      <span class="kicker" data-k="home.annKicker">${esc(h.annKicker)}</span>
      <h2 data-k="home.annTitle">${esc(h.annTitle)}<span class="u"></span></h2>
      <p data-k="home.annSub">${esc(h.annSub)}</p>`;

    $('#ann').innerHTML = h.announcements.length
      ? h.announcements.map((a, i) => `
        <div class="card ann has-ctl">${itemCtl('home.announcements', i)}
          <h3 style="color:var(--gold-3);font-size:1.18rem;margin-bottom:8px">
            <span class="dot"></span><span data-k="home.announcements.${i}.title">${esc(a.title)}</span>
          </h3>
          <p class="ml" style="color:var(--txt-2)" data-k="home.announcements.${i}.body">${esc(a.body)}</p>
          <p style="color:var(--txt-3);font-size:.82rem;margin-top:10px" data-k="home.announcements.${i}.date">${esc(a.date)}</p>
        </div>`).join('')
      : emptyBox('لا توجد إعلانات حالياً.', '◈');
    $('#annCtl').innerHTML = ctlRow('home.announcements', 'ann');
  };

  R.constitution = function () {
    const c = S.data.constitution;
    $('#pgHead').innerHTML = `
      <h1 data-k="constitution.title">${esc(c.title)}</h1>
      <p data-k="constitution.subtitle">${esc(c.subtitle)}</p>`;

    $('#toc').innerHTML = `<h4>الفهرس</h4>` +
      c.chapters.map((ch, i) => `<a href="#ch${i}">${esc(ch.title)}</a>`).join('');

    let n = 0;
    $('#chapters').innerHTML = c.chapters.map((ch, ci) => {
      const arts = ch.articles.map((a, ai) => {
        n++;
        return `<div class="art has-ctl" data-txt="${esc(a)}">${itemCtl('constitution.chapters.' + ci + '.articles', ai)}
          <span class="n">المادة ${n}</span>
          <p class="ml" data-k="constitution.chapters.${ci}.articles.${ai}">${esc(a)}</p>
        </div>`;
      }).join('');
      return `<div class="chapter has-ctl" id="ch${ci}">${itemCtl('constitution.chapters', ci)}
        <h3 data-k="constitution.chapters.${ci}.title">${esc(ch.title)}</h3>
        ${arts}
        ${ctlRow('constitution.chapters.' + ci + '.articles', 'article')}
      </div>`;
    }).join('') + ctlRow('constitution.chapters', 'chapter');

    $('#seal').innerHTML = `
      <div class="card" style="text-align:center;border-color:var(--line)">
        <img src="${BASE}assets/logo.png" style="width:74px;margin:0 auto 14px;opacity:.9" alt="">
        <h3 style="color:var(--gold);font-size:1.2rem;margin-bottom:10px" data-k="constitution.sealTitle">${esc(c.sealTitle)}</h3>
        <p class="ml" style="color:var(--txt-2);max-width:760px;margin-inline:auto" data-k="constitution.sealBody">${esc(c.sealBody)}</p>
      </div>`;

    const sb = $('#q');
    if (sb) sb.oninput = () => {
      const q = sb.value.trim();
      $$('.art').forEach(a => {
        a.classList.toggle('hide', q && !a.textContent.includes(q));
      });
      $$('.chapter').forEach(ch => {
        const any = $$('.art', ch).some(a => !a.classList.contains('hide'));
        ch.style.display = (q && !any && !ch.querySelector('h3').textContent.includes(q)) ? 'none' : '';
      });
    };
  };

  R.members = function () {
    const m = S.data.members;
    $('#pgHead').innerHTML = `
      <h1 data-k="members.title">${esc(m.title)}</h1>
      <p data-k="members.subtitle">${esc(m.subtitle)}</p>`;

    $('#groups').innerHTML = m.groups.map((g, gi) => {
      const ppl = g.people.length
        ? `<div class="grid g3">` + g.people.map((p, pi) => `
            <div class="card person has-ctl">${itemCtl('members.groups.' + gi + '.people', pi)}
              <div class="av">${esc((p.name || '؟').trim().charAt(0))}</div>
              <div class="info">
                <div class="nm" data-k="members.groups.${gi}.people.${pi}.name">${esc(p.name)}</div>
                <div><span class="rk" data-k="members.groups.${gi}.people.${pi}.role">${esc(p.role)}</span></div>
                <p class="bio ml" data-k="members.groups.${gi}.people.${pi}.bio">${esc(p.bio)}</p>
              </div>
            </div>`).join('') + `</div>`
        : emptyBox('لا يوجد أعضاء مسجلون في هذا القسم حالياً.', '◈');
      return `<div class="mgroup has-ctl">${itemCtl('members.groups', gi)}
        <h3 data-k="members.groups.${gi}.title">${esc(g.title)}</h3>
        ${ppl}
        ${ctlRow('members.groups.' + gi + '.people', 'person')}
      </div>`;
    }).join('') + ctlRow('members.groups', 'group');
  };

  R.commercial = function () {
    const c = S.data.commercial;
    $('#pgHead').innerHTML = `
      <h1 data-k="commercial.title">${esc(c.title)}</h1>
      <p data-k="commercial.subtitle">${esc(c.subtitle)}</p>`;

    $('#admins').innerHTML = `
      <h3 class="sec" data-k="commercial.adminTitle">${esc(c.adminTitle)}</h3>
      <div class="grid g2">` + c.admins.map((a, i) => `
        <div class="card has-ctl">${itemCtl('commercial.admins', i)}
          <div class="rk" style="display:inline-block;font-size:.78rem;color:var(--gold-2);background:rgba(232,194,90,.1);border:1px solid var(--line);padding:2px 12px;border-radius:99px;margin-bottom:10px"
               data-k="commercial.admins.${i}.role">${esc(a.role)}</div>
          <h3 style="color:var(--gold-3);font-size:1.16rem;margin-bottom:8px" data-k="commercial.admins.${i}.name">${esc(a.name)}</h3>
          <p class="ml" style="color:var(--txt-2);font-size:.94rem" data-k="commercial.admins.${i}.desc">${esc(a.desc)}</p>
        </div>`).join('') + `</div>` + ctlRow('commercial.admins', 'admin');

    const listBlock = (titleKey, listKey, title, arr) => `
      <div class="card">
        <h3 class="sec" data-k="commercial.${titleKey}">${esc(title)}</h3>
        <ul class="rules">` + arr.map((x, i) => `
          <li class="has-ctl">${itemCtl('commercial.' + listKey, i)}
            <span class="ml" data-k="commercial.${listKey}.${i}">${esc(x)}</span>
          </li>`).join('') + `</ul>` + ctlRow('commercial.' + listKey, 'text') + `</div>`;

    $('#blocks').innerHTML =
      `<div class="grid g2">
        ${listBlock('lawsTitle', 'laws', c.lawsTitle, c.laws)}
        ${listBlock('regTitle', 'reg', c.regTitle, c.reg)}
      </div>

      <div class="grid g2" style="margin-top:22px">
        <div class="card">
          <h3 class="sec" data-k="commercial.feesTitle">${esc(c.feesTitle)}</h3>
          ${c.fees.map((f, i) => `
            <div class="fee has-ctl">${itemCtl('commercial.fees', i)}
              <span class="lb" data-k="commercial.fees.${i}.lb">${esc(f.lb)}</span>
              <span class="vl" data-k="commercial.fees.${i}.vl">${esc(f.vl)}</span>
            </div>`).join('')}
          ${ctlRow('commercial.fees', 'fee')}
          <p class="ml" style="color:var(--txt-3);font-size:.88rem;margin-top:12px" data-k="commercial.feesNote">${esc(c.feesNote)}</p>
        </div>
        ${listBlock('lateTitle', 'late', c.lateTitle, c.late)}
      </div>

      <div class="grid g2" style="margin-top:22px">
        ${listBlock('violTitle', 'viol', c.violTitle, c.viol)}
        ${listBlock('penTitle', 'pen', c.penTitle, c.pen)}
      </div>

      <div class="grid g2" style="margin-top:22px">
        ${listBlock('powTitle', 'pow', c.powTitle, c.pow)}
        ${listBlock('renameTitle', 'rename', c.renameTitle, c.rename)}
      </div>`;
  };

  R.projects = function () {
    const p = S.data.projects;
    $('#pgHead').innerHTML = `
      <h1 data-k="projects.title">${esc(p.title)}</h1>
      <p data-k="projects.subtitle">${esc(p.subtitle)}</p>`;

    const badgeCls = st => /موقوف|مغلق|ملغ/.test(st) ? 'bad' : (/مراجعة|انتظار|معلق/.test(st) ? 'warn' : 'ok');

    $('#projects').innerHTML = p.items.length
      ? p.items.map((it, i) => `
        <div class="card proj has-ctl">${itemCtl('projects.items', i)}
          <div class="top">
            <h3 data-k="projects.items.${i}.name">${esc(it.name)}</h3>
            <span class="badge ${badgeCls(it.status)}" data-k="projects.items.${i}.status">${esc(it.status)}</span>
          </div>
          <div class="rows">
            <div class="row"><span class="k">رقم السجل</span><span class="v" data-k="projects.items.${i}.record">${esc(it.record)}</span></div>
            <div class="row"><span class="k">المالك</span><span class="v" data-k="projects.items.${i}.owner">${esc(it.owner)}</span></div>
            <div class="row"><span class="k">الموقع</span><span class="v" data-k="projects.items.${i}.location">${esc(it.location)}</span></div>
            <div class="row"><span class="k">تاريخ الإصدار</span><span class="v" data-k="projects.items.${i}.issued">${esc(it.issued)}</span></div>
            <div class="row"><span class="k">تاريخ الانتهاء</span><span class="v" data-k="projects.items.${i}.expires">${esc(it.expires)}</span></div>
            <div class="row"><span class="k">النشاط</span><span class="v" data-k="projects.items.${i}.activity">${esc(it.activity)}</span></div>
          </div>
        </div>`).join('')
      : emptyBox('لا توجد مشاريع مسجلة حالياً. يتم اعتماد المشاريع عبر الغرفة التجارية.', '◈');

    $('#projCtl').innerHTML = ctlRow('projects.items', 'project');
    $('#projNote').innerHTML = `
      <div class="card ann">
        <h3 style="color:var(--gold-3);font-size:1.08rem;margin-bottom:8px">ملاحظات مهمة</h3>
        <p class="ml" style="color:var(--txt-2)" data-k="projects.note">${esc(p.note)}</p>
      </div>`;
  };

  R.updates = function () {
    const u = S.data.updates;
    $('#pgHead').innerHTML = `
      <h1 data-k="updates.title">${esc(u.title)}</h1>
      <p data-k="updates.subtitle">${esc(u.subtitle)}</p>`;

    $('#tl').innerHTML = u.items.length
      ? u.items.map((it, i) => `
        <div class="tl-item">
          <div class="card has-ctl">${itemCtl('updates.items', i)}
            <div class="ver">
              <b data-k="updates.items.${i}.ver">${esc(it.ver)}</b>
              <span class="dt" data-k="updates.items.${i}.date">${esc(it.date)}</span>
            </div>
            <p class="bd ml" data-k="updates.items.${i}.body">${esc(it.body)}</p>
            <ul class="rules">` + it.points.map((pt, pi) => `
              <li class="has-ctl">${itemCtl('updates.items.' + i + '.points', pi)}
                <span class="ml" data-k="updates.items.${i}.points.${pi}">${esc(pt)}</span>
              </li>`).join('') + `</ul>
            ${ctlRow('updates.items.' + i + '.points', 'text')}
          </div>
        </div>`).join('')
      : emptyBox('لا توجد تحديثات منشورة حالياً.', '◈');

    $('#tlCtl').innerHTML = ctlRow('updates.items', 'update');
  };

  /* ============ العرض ============ */
  function render() {
    chrome();
    if (R[PAGE]) R[PAGE]();
    if (S.editing) applyEditable(true);
    reveal();
  }

  function reveal() {
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .08, rootMargin: '0px 0px -40px' });
    $$('.card, .head, .about, .chapter, .mgroup, .empty').forEach((el, i) => {
      if (el.classList.contains('in')) return;
      el.classList.add('rv');
      el.style.transitionDelay = Math.min(i % 6, 5) * 55 + 'ms';
      io.observe(el);
    });
  }

  /* ============ التحرير ============ */
  const TPL = {
    stat: () => ({ num: '0', label: 'عنوان' }),
    service: () => ({ icon: '⚖️', title: 'خدمة جديدة', desc: 'وصف الخدمة.' }),
    ann: () => ({ title: 'إعلان جديد', body: 'نص الإعلان.', date: new Date().toLocaleDateString('ar-EG') }),
    chapter: () => ({ title: 'فصل جديد', articles: ['نص المادة.'] }),
    article: () => 'نص المادة الجديدة.',
    group: () => ({ title: 'قسم جديد', people: [] }),
    person: () => ({ name: 'الاسم', role: 'الرتبة', bio: 'نبذة مختصرة.' }),
    admin: () => ({ role: 'المنصب', name: 'الاسم', desc: 'الوصف.' }),
    fee: () => ({ lb: 'البند', vl: '0' }),
    text: () => 'نص جديد.',
    project: () => ({
      name: 'مشروع جديد', status: 'مشروع موثق ✔', record: '0000', owner: '—',
      location: '—', issued: '—', expires: '—', activity: '—'
    }),
    update: () => ({ ver: 'إصدار جديد', date: new Date().toLocaleDateString('ar-EG'), body: 'وصف التحديث.', points: ['بند.'] })
  };

  function collect() {
    $$('[data-k]').forEach(el => {
      const v = el.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      setP(S.data, el.dataset.k, v);
    });
  }

  function applyEditable(on) {
    $$('[data-k]').forEach(el => {
      el.contentEditable = on ? 'true' : 'false';
      el.spellcheck = false;
    });
    document.body.classList.toggle('editing', on);
  }

  const CORVEN = {
    add(path, kind) {
      collect();
      const arr = getP(S.data, path) || [];
      arr.push(TPL[kind] ? TPL[kind]() : 'نص جديد.');
      setP(S.data, path, arr);
      render(); toast('تمت الإضافة — لا تنسَ الحفظ');
    },
    del(path, i) {
      if (!confirm('حذف هذا العنصر؟')) return;
      collect();
      const arr = getP(S.data, path);
      arr.splice(i, 1);
      render(); toast('تم الحذف — لا تنسَ الحفظ');
    },
    move(path, i, d) {
      collect();
      const arr = getP(S.data, path);
      const j = i + d;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      render();
    }
  };
  window.CORVEN = CORVEN;

  /* ============ الحفظ ============ */
  function saveLocal() {
    try { localStorage.setItem(LSK, JSON.stringify(S.data)); return true; }
    catch (e) { return false; }
  }

  async function save() {
    collect();
    saveLocal();
    if (S.cloudOn && S.cloud) {
      try {
        await S.cloud.set(S.cloud.ref(S.cloud.db, 'site'), S.data);
        toast('✔ تم الحفظ ونشره لجميع الزوار', 'ok');
      } catch (e) {
        toast('حُفظ محلياً — تعذّر النشر السحابي', 'err');
        console.error(e);
      }
    } else {
      toast('✔ تم الحفظ في متصفحك', 'ok');
    }
  }

  function exportFile() {
    collect();
    const blob = new Blob([JSON.stringify(S.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'corven-content.json';
    a.click();
    toast('تم تنزيل نسخة من المحتوى', 'ok');
  }

  function importFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          S.data = merge(window.CORVEN_DEFAULT, JSON.parse(rd.result));
          render(); toast('تم استيراد المحتوى — اضغط حفظ', 'ok');
        } catch (e) { toast('الملف غير صالح', 'err'); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  function resetAll() {
    if (!confirm('إرجاع كل المحتوى للنسخة الأصلية؟ سيتم فقدان كل تعديلاتك.')) return;
    S.data = clone(window.CORVEN_DEFAULT);
    render(); toast('تمت الاستعادة — اضغط حفظ للتثبيت');
  }

  /* ============ الدخول ولوحة التحكم ============ */
  function openAdmin() {
    if (S.admin) {
      if (S.editing) openPanel(); else enterEdit();
      return;
    }
    const fb = window.CORVEN_FIREBASE || {};
    $('#ovLogin').classList.add('open');
    $('#lgEmailWrap').style.display = fb.enabled ? '' : 'none';
    $('#lgMsg').textContent = '';
    setTimeout(() => (fb.enabled ? $('#lgEmail') : $('#lgPass')).focus(), 80);
  }

  async function doLogin() {
    const fb = window.CORVEN_FIREBASE || {};
    const msg = $('#lgMsg');
    const pass = $('#lgPass').value;
    msg.className = 'msg'; msg.textContent = 'جارٍ التحقق…';

    if (fb.enabled && S.cloud) {
      try {
        await S.cloud.signIn(S.cloud.auth, $('#lgEmail').value.trim(), pass);
        S.admin = true; closeAll(); enterEdit();
      } catch (e) {
        msg.className = 'msg err';
        msg.textContent = 'البريد أو كلمة السر غير صحيحة.';
      }
      return;
    }

    const stored = localStorage.getItem(LSH) || window.CORVEN_LOCAL_HASH;
    const h = await sha256(pass);
    if (h === stored) { S.admin = true; closeAll(); enterEdit(); }
    else { msg.className = 'msg err'; msg.textContent = 'كلمة السر غير صحيحة.'; }
  }

  function enterEdit() {
    S.editing = true;
    applyEditable(true);
    $('#editbar').classList.add('on');
    toast('وضع التحرير مفعّل — اضغط على أي نص لتعديله', 'ok');
  }
  function exitEdit() {
    S.editing = false;
    applyEditable(false);
    $('#editbar').classList.remove('on');
  }

  function openPanel() { $('#ovPanel').classList.add('open'); }
  function closeAll() { $$('.ov').forEach(o => o.classList.remove('open')); }

  async function changePass() {
    const p1 = $('#np1').value, p2 = $('#np2').value;
    const m = $('#npMsg');
    if (p1.length < 4) { m.className = 'msg err'; m.textContent = 'كلمة السر قصيرة جداً.'; return; }
    if (p1 !== p2) { m.className = 'msg err'; m.textContent = 'الكلمتان غير متطابقتين.'; return; }
    const h = await sha256(p1);
    localStorage.setItem(LSH, h);
    m.className = 'msg ok';
    m.innerHTML = 'تم التغيير على هذا الجهاز.<br>لتثبيتها لكل الأجهزة ضع هذا السطر في ملف firebase-config.js:<br>' +
      '<code style="display:block;direction:ltr;margin-top:8px;font-size:.72rem;word-break:break-all;color:var(--gold-3)">window.CORVEN_LOCAL_HASH = "' + h + '";</code>';
  }

  /* ============ السحابة ============ */
  async function initCloud() {
    const cfg = window.CORVEN_FIREBASE;
    const badge = $('#cloudBadge');
    if (!cfg || !cfg.enabled || !cfg.databaseURL) {
      if (badge) { badge.className = 'on off'; badge.innerHTML = '<i></i> وضع محلي'; }
      return;
    }
    try {
      const V = 'https://www.gstatic.com/firebasejs/10.12.2/';
      const [{ initializeApp }, dbm, am] = await Promise.all([
        import(V + 'firebase-app.js'),
        import(V + 'firebase-database.js'),
        import(V + 'firebase-auth.js')
      ]);
      const app = initializeApp({
        apiKey: cfg.apiKey, authDomain: cfg.authDomain,
        databaseURL: cfg.databaseURL, projectId: cfg.projectId, appId: cfg.appId
      });
      const db = dbm.getDatabase(app);
      const auth = am.getAuth(app);
      S.cloud = {
        db, auth, ref: dbm.ref, set: dbm.set, onValue: dbm.onValue,
        signIn: am.signInWithEmailAndPassword, signOut: am.signOut
      };
      S.cloudOn = true;

      am.onAuthStateChanged(auth, u => { S.admin = !!u; });

      dbm.onValue(dbm.ref(db, 'site'), snap => {
        const v = snap.val();
        if (v && !S.editing) {
          S.data = merge(window.CORVEN_DEFAULT, v);
          saveLocal();
          render();
        }
        S.remoteReady = true;
        if (badge) { badge.className = 'on'; badge.innerHTML = '<i></i> متصل بالسحابة'; }
      }, err => {
        console.error(err);
        if (badge) { badge.className = 'on off'; badge.innerHTML = '<i></i> تعذّر الاتصال'; }
      });
    } catch (e) {
      console.error(e);
      if (badge) { badge.className = 'on off'; badge.innerHTML = '<i></i> وضع محلي'; }
    }
  }

  /* ============ واجهة التحرير (HTML مشترك) ============ */
  function ui() {
    const fb = window.CORVEN_FIREBASE || {};
    const d = document.createElement('div');
    d.innerHTML = `
    <div id="toast"></div>
    <div id="cloudBadge"></div>

    <div class="ov" id="ovLogin">
      <div class="modal">
        <h3>دخول الإدارة</h3>
        <p class="sub">هذه المنطقة مخصصة لإدارة وزارة العدل فقط</p>
        <div class="fld" id="lgEmailWrap">
          <label>البريد الإلكتروني</label>
          <input type="email" id="lgEmail" dir="ltr" autocomplete="username" placeholder="admin@corven.com">
        </div>
        <div class="fld">
          <label>كلمة السر</label>
          <input type="password" id="lgPass" dir="ltr" autocomplete="current-password" placeholder="••••••••">
        </div>
        <div class="msg" id="lgMsg"></div>
        <div class="acts">
          <button class="btn solid" id="lgGo">دخول</button>
          <button class="btn ghost" id="lgX">إلغاء</button>
        </div>
      </div>
    </div>

    <div class="ov" id="ovPanel">
      <div class="modal wide">
        <h3>لوحة التحكم</h3>
        <p class="sub">${fb.enabled ? 'الحفظ السحابي مفعّل — تعديلاتك تظهر لكل الزوار' : 'وضع محلي — التعديلات تُحفظ في متصفحك فقط'}</p>
        <div class="acts" style="flex-wrap:wrap">
          <button class="btn sm" id="pnExport">⬇ تصدير المحتوى</button>
          <button class="btn sm" id="pnImport">⬆ استيراد محتوى</button>
          <button class="btn sm" id="pnReset">↺ استعادة الأصل</button>
        </div>
        <hr style="border:none;border-top:1px solid var(--line-soft);margin:22px 0">
        <h4 style="color:var(--gold-3);margin-bottom:12px;font-size:1rem">تغيير كلمة السر</h4>
        <div class="fld"><label>كلمة السر الجديدة</label><input type="password" id="np1" dir="ltr"></div>
        <div class="fld"><label>تأكيد كلمة السر</label><input type="password" id="np2" dir="ltr"></div>
        <div class="msg" id="npMsg"></div>
        <div class="acts">
          <button class="btn solid" id="npGo">حفظ كلمة السر</button>
          <button class="btn ghost" id="pnX">إغلاق</button>
        </div>
      </div>
    </div>

    <div id="editbar">
      <span class="st"><i></i> وضع التحرير</span>
      <span class="hint">اضغط على أي نص لتعديله • استخدم ＋ للإضافة و ✕ للحذف</span>
      <span class="sp"></span>
      <button class="btn sm solid" id="ebSave">💾 حفظ</button>
      <button class="btn sm" id="ebPanel">⚙ الإعدادات</button>
      <button class="btn sm ghost" id="ebExit">✕ خروج</button>
    </div>`;
    document.body.appendChild(d);

    $('#lgGo').onclick = doLogin;
    $('#lgX').onclick = closeAll;
    $('#lgPass').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
    $('#lgEmail').onkeydown = e => { if (e.key === 'Enter') $('#lgPass').focus(); };
    $('#ebSave').onclick = save;
    $('#ebPanel').onclick = openPanel;
    $('#ebExit').onclick = () => { if (confirm('الخروج من وضع التحرير؟ احفظ أولاً إن كان لديك تعديلات.')) exitEdit(); };
    $('#pnExport').onclick = exportFile;
    $('#pnImport').onclick = importFile;
    $('#pnReset').onclick = () => { closeAll(); resetAll(); };
    $('#npGo').onclick = changePass;
    $('#pnX').onclick = closeAll;
    $$('.ov').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeAll(); }));

    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); openAdmin(); }
      if (e.ctrlKey && (e.key === 's' || e.key === 'S') && S.editing) { e.preventDefault(); save(); }
      if (e.key === 'Escape') closeAll();
    });
    window.addEventListener('beforeunload', e => {
      if (S.editing) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ============ الإقلاع ============ */
  function boot() {
    S.data = clone(window.CORVEN_DEFAULT);
    try {
      const sv = localStorage.getItem(LSK);
      if (sv) S.data = merge(window.CORVEN_DEFAULT, JSON.parse(sv));
    } catch (e) { }

    ui();
    render();
    initCloud();

    setTimeout(() => { const l = $('#loader'); if (l) l.classList.add('done'); }, 380);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
