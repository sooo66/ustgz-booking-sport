// ==UserScript==
// @name         HKUST(GZ) 场馆抢订助手
// @namespace    venue-grab
// @version      2.0
// @description  网球场 / 羽毛球场抢订面板：点选时段和场地，定时放号或持续捡漏
// @match        https://venue-frontend.hkust-gz.edu.cn/venue-h5/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/sooo66/ustgz-booking-sport
// @downloadURL  https://raw.githubusercontent.com/sooo66/ustgz-booking-sport/main/ustgz-booking.user.js
// @updateURL    https://raw.githubusercontent.com/sooo66/ustgz-booking-sport/main/ustgz-booking.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VENUES = [{ id: 1008, name: '网球' }, { id: 1005, name: '羽毛球' }];
  const HOURS = Array.from({ length: 15 }, (_, i) => `${String(7 + i).padStart(2, '0')}:00`); // 07:00 – 21:00
  const KEY = 'venueGrabCfg2';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ok = r => String(r && r.code) === '200';
  const http = () => document.querySelector('#app')?.__vue__?.$http;
  const pad = n => String(n).padStart(2, '0');
  const dateStr = off => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  // ---------- 状态 ----------
  let cfg = { venueId: 1005, day: 1, times: [], courts: [], waitRelease: true };
  try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} };
  let snapshot = null;     // 最近一次查询结果 data
  let releaseTime = '12:00:00';
  let running = false;

  // ---------- 样式 ----------
  const css = document.createElement('style');
  css.textContent = `
  #vg{position:fixed;right:16px;bottom:16px;z-index:99999;width:340px;background:#fff;border-radius:12px;
      box-shadow:0 6px 24px rgba(0,0,0,.18);font:13px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1f2329;overflow:hidden}
  #vg .hd{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#1f4e9a;color:#fff;cursor:pointer;user-select:none}
  #vg .hd b{font-weight:600}
  #vg .bd{padding:12px 14px;display:flex;flex-direction:column;gap:12px}
  #vg .row{display:flex;flex-direction:column;gap:6px}
  #vg .lbl{font-size:12px;color:#646a73;display:flex;justify-content:space-between}
  #vg .lbl a{color:#1f4e9a;cursor:pointer}
  #vg .seg{display:flex;background:#f0f1f3;border-radius:8px;padding:3px}
  #vg .seg button{flex:1;border:0;background:transparent;padding:6px 0;border-radius:6px;cursor:pointer;color:#646a73;font:inherit}
  #vg .seg button.on{background:#fff;color:#1f4e9a;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  #vg .grid{display:grid;gap:6px}
  #vg .chip{position:relative;border:1px solid #dee0e3;background:#fff;border-radius:6px;padding:5px 0;text-align:center;cursor:pointer;font:inherit;color:#1f2329}
  #vg .chip.free{border-color:#34a853;color:#1e7e34}
  #vg .chip.full{color:#b0b4ba;background:#f7f8fa}
  #vg .chip.on{background:#1f4e9a;border-color:#1f4e9a;color:#fff}
  #vg .chip i{position:absolute;top:-6px;right:-6px;background:#f5a623;color:#fff;font-style:normal;font-size:10px;
      width:16px;height:16px;line-height:16px;border-radius:50%}
  #vg .chip small{display:block;font-size:10px;opacity:.75}
  #vg .opt{display:flex;align-items:center;gap:6px;font-size:12px;color:#646a73}
  #vg .go{border:0;border-radius:8px;padding:10px;font:inherit;font-weight:600;cursor:pointer;background:#1f4e9a;color:#fff}
  #vg .go.stop{background:#d93025}
  #vg .status{font-size:12px;color:#1f4e9a;min-height:16px}
  #vg .log{max-height:110px;overflow:auto;background:#f7f8fa;border-radius:6px;padding:6px 8px;font-size:11.5px;white-space:pre-wrap;color:#444}
  #vg .log:empty{display:none}
  #vg .legend{font-size:11px;color:#8f959e}
  #vg .legend span{margin-right:8px}
  `;
  document.head.appendChild(css);

  const box = document.createElement('div');
  box.id = 'vg';
  box.innerHTML = `
    <div class="hd"><b>抢订助手</b><span class="tg">收起</span></div>
    <div class="bd">
      <div class="row"><div class="seg" data-k="venue"></div></div>
      <div class="row"><div class="seg" data-k="day"></div></div>
      <div class="row">
        <div class="lbl"><span>时段（按点击顺序为优先级）</span><a data-a="clrT">清空</a></div>
        <div class="grid times" style="grid-template-columns:repeat(5,1fr)"></div>
        <div class="legend"><span style="color:#1e7e34">■ 可订</span><span style="color:#b0b4ba">■ 已满</span>已满的也可选（等人退订）</div>
      </div>
      <div class="row">
        <div class="lbl"><span>场地（按点击顺序为优先级，不选 = 任意）</span><a data-a="clrC">清空</a></div>
        <div class="grid courts" style="grid-template-columns:repeat(8,1fr)"></div>
      </div>
      <label class="opt"><input type="checkbox" class="wr"> <span class="wrt"></span></label>
      <button class="go">开始抢订</button>
      <div class="status"></div>
      <div class="log"></div>
    </div>`;
  document.body.appendChild(box);
  const q = s => box.querySelector(s);

  q('.hd').onclick = () => { const b = q('.bd'), hide = b.style.display !== 'none'; b.style.display = hide ? 'none' : ''; q('.tg').textContent = hide ? '展开' : '收起'; };
  const log = m => { q('.log').textContent = `${new Date().toTimeString().slice(0, 8)} ${m}\n` + q('.log').textContent; };
  const status = m => { q('.status').textContent = m; };

  // ---------- 渲染 ----------
  function seg(k, items, cur, onPick) {
    const el = q(`.seg[data-k="${k}"]`);
    el.innerHTML = items.map(([v, t]) => `<button data-v="${v}" class="${v == cur ? 'on' : ''}">${t}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { if (!running) onPick(+b.dataset.v); });
  }

  function slotInfo(t) {
    if (!snapshot) return null;
    const pool = (snapshot.childList || []).filter(c => !cfg.courts.length || cfg.courts.includes(courtNo(c)));
    let free = 0;
    pool.forEach(c => c.timeList.forEach(s => { if (s.startTime === t && s.reserveStatus === 0) free++; }));
    return free;
  }

  function render() {
    seg('venue', VENUES.map(v => [v.id, v.name]), cfg.venueId, v => { cfg.venueId = v; cfg.courts = []; save(); refresh(); });
    seg('day', [[0, `今天 ${dateStr(0).slice(5)}`], [1, `明天 ${dateStr(1).slice(5)}`]], cfg.day, v => { cfg.day = v; save(); refresh(); });

    q('.times').innerHTML = HOURS.map(t => {
      const idx = cfg.times.indexOf(t), free = slotInfo(t);
      const cls = ['chip', idx >= 0 ? 'on' : free == null ? '' : free > 0 ? 'free' : 'full'].join(' ');
      return `<button class="${cls}" data-t="${t}">${t.slice(0, 2)}${idx >= 0 ? `<i>${idx + 1}</i>` : ''}<small>${free == null ? '' : free > 0 ? `余${free}` : '满'}</small></button>`;
    }).join('');
    q('.times').querySelectorAll('.chip').forEach(b => b.onclick = () => {
      if (running) return;
      const t = b.dataset.t, i = cfg.times.indexOf(t);
      i >= 0 ? cfg.times.splice(i, 1) : cfg.times.push(t);
      save(); render();
    });

    const n = snapshot ? snapshot.childList.length : (cfg.venueId === 1008 ? 3 : 8);
    q('.courts').innerHTML = Array.from({ length: n }, (_, i) => i + 1)
      .map(k => { const i = cfg.courts.indexOf(k); return `<button class="chip ${i >= 0 ? 'on' : ''}" data-c="${k}">${k}${i >= 0 && cfg.courts.length > 1 ? `<i>${i + 1}</i>` : ''}</button>`; }).join('');
    q('.courts').querySelectorAll('.chip').forEach(b => b.onclick = () => {
      if (running) return;
      const k = +b.dataset.c, i = cfg.courts.indexOf(k);
      i >= 0 ? cfg.courts.splice(i, 1) : cfg.courts.push(k);
      save(); render();
    });

    q('.wr').checked = cfg.waitRelease;
    q('.wrt').textContent = `等到放号时间 ${releaseTime} 再开抢（不勾选 = 立即开始/持续捡漏）`;
    q('.go').textContent = running ? '停止' : '开始抢订';
    q('.go').classList.toggle('stop', running);
  }

  q('.wr').onchange = e => { cfg.waitRelease = e.target.checked; save(); };
  q('[data-a="clrT"]').onclick = () => { if (!running) { cfg.times = []; save(); render(); } };
  q('[data-a="clrC"]').onclick = () => { if (!running) { cfg.courts = []; save(); render(); } };

  const courtNo = c => +(String(c.childName).match(/\d+/) || [0])[0];

  async function query(date) {
    return http().post('/venueInfo/queryVenueInfoByVenueId', { venueId: cfg.venueId, queryTime: date });
  }

  async function refresh() {
    snapshot = null; render();
    try {
      const r = await query(dateStr(cfg.day));
      if (ok(r)) {
        snapshot = r.data;
        if (r.data.appointmentTime) releaseTime = r.data.appointmentTime;
      } else status('查询失败：' + (r && r.message || '可能未登录'));
    } catch (e) { status('查询异常：' + e); }
    render();
  }

  // ---------- 抢订 ----------
  function candidates(data) {
    const chs = data.childList || [];
    const ordered = cfg.courts.length ? cfg.courts.map(n => chs.find(c => courtNo(c) === n)).filter(Boolean) : chs;
    const out = [];
    for (const t of cfg.times) for (const c of ordered) for (const s of c.timeList)
      if (s.startTime === t && s.reserveStatus === 0) out.push([c, s]);
    return out;
  }

  async function book(c, s, date) {
    return http().post('/venueInfo/appointmentVenueInfo', {
      childId: c.childId, venueId: c.venueId,
      startTime: `${date} ${s.startTime}`, endTime: `${date} ${s.endTime}`,
      lockerRoom: 0,
    }).catch(e => ({ message: String(e) }));
  }

  async function run() {
    if (!cfg.times.length) { status('先点选至少一个时段'); return; }
    running = true; render();
    const vname = VENUES.find(v => v.id === cfg.venueId).name;

    if (cfg.waitRelease) {
      const [h, m, s] = releaseTime.split(':').map(Number);
      const t = new Date(); t.setHours(h, m, s || 0, 0);
      if (t > Date.now()) {
        log(`等待放号 ${releaseTime}`);
        let lastPing = Date.now();
        while (running && Date.now() < t - 1500) {
          const left = Math.round((t - Date.now()) / 1000);
          status(`等待放号，还有 ${Math.floor(left / 3600)}时${Math.floor(left % 3600 / 60)}分${left % 60}秒`);
          if (Date.now() - lastPing > 5 * 60e3) { lastPing = Date.now(); query(dateStr(0)).catch(() => {}); } // 保持登录
          await sleep(500);
        }
      } else log(`放号时间 ${releaseTime} 已过，直接开抢`);
    }

    const date = dateStr(cfg.day);
    log(`开抢 ${vname} ${date} 时段 ${cfg.times.map(t => t.slice(0, 2)).join('>')} 场地 ${cfg.courts.join(',') || '任意'}`);
    const failed = new Set();
    const start = Date.now();
    let n = 0;

    while (running) {
      n++;
      let r;
      try { r = await query(date); } catch (e) { status(`第 ${n} 次查询异常`); await sleep(1000); continue; }
      if (!ok(r)) { log('查询失败：' + (r && r.message)); await sleep(1000); continue; }
      snapshot = r.data;

      const cands = candidates(r.data).filter(([c, s]) => !failed.has(c.childId + s.startTime));
      for (const [c, s] of cands) {
        const res = await book(c, s, date);
        if (ok(res)) {
          log(`✅ 预订成功：${vname} ${c.childName} ${date} ${s.startTime}-${s.endTime}`);
          status('预订成功，请到“我的预约”确认');
          try { new Notification('场馆预订成功', { body: `${vname} ${c.childName} ${s.startTime}` }); } catch {}
          running = false; render(); return;
        }
        const msg = (res && res.message) || '未知错误';
        log(`❌ ${c.childName} ${s.startTime}：${msg}`);
        failed.add(c.childId + s.startTime);
        if (/上限|已预约|限制|limit/i.test(msg)) { status('已达预约上限，停止'); running = false; render(); return; }
      }

      const secs = Math.round((Date.now() - start) / 1000);
      // 放号后前 60 秒高频，之后降为每 3 秒（捡漏模式）
      const interval = secs < 60 ? 300 : 3000;
      status(`第 ${n} 次查询，已运行 ${secs}s，目标时段暂无空位${secs >= 60 ? '（捡漏中，每 3 秒查一次）' : ''}`);
      if (n % 5 === 0) render();
      await sleep(interval);
    }
    status('已停止'); render();
  }

  q('.go').onclick = () => { if (running) { running = false; status('正在停止…'); } else run(); };

  // ---------- 启动 ----------
  (async () => {
    for (let i = 0; i < 50 && !http(); i++) await sleep(200);
    if (!http()) { status('页面未就绪，请刷新'); return; }
    try { Notification.requestPermission(); } catch {}
    refresh();
  })();
})();
