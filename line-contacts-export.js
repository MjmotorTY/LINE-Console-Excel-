(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 1. 從頁面已發出的請求找出 contacts 網址
  const found = performance.getEntriesByType('resource')
    .map(e => e.name).filter(n => /\/api\/v2\/bots\/[^/]+\/contacts\?/.test(n)).pop();
  if (!found) { console.log('找不到 contacts 網址，請重新整理頁面後再執行'); return; }

  const base = new URL(found);
  const botId = base.pathname.match(/\/bots\/([^/]+)\//)[1];
  base.searchParams.delete('next');
  base.searchParams.set('limit', '100');   // 若出現錯誤，改回 '20'

  // 2. 嘗試取得標籤名稱對照（失敗也沒關係，會改輸出標籤 ID）
  const tagMap = {};
  try {
    const t = await (await fetch(`https://chat.line.biz/api/v1/bots/${botId}/tags`, { credentials: 'include' })).json();
    (Array.isArray(t) ? t : t.list || []).forEach(x => { tagMap[x.tagId || x.id] = x.name; });
    console.log('標籤對照筆數：', Object.keys(tagMap).length);
  } catch (e) { console.log('標籤名稱取得失敗，將輸出標籤 ID'); }

  // 3. 逐頁抓取
  const all = new Map();
  let next = null, page = 0;
  while (true) {
    const u = new URL(base);
    if (next) u.searchParams.set('next', next);
    const res = await fetch(u, { credentials: 'include' });
    if (!res.ok) { console.log('請求失敗', res.status, '，已抓到', all.size, '筆'); break; }
    const j = await res.json();
    const before = all.size;
    (j.list || []).forEach(c => all.set(c.contactId, c));
    page++;
    console.log(`第 ${page} 頁，累計 ${all.size} 筆`);
    if (!j.next) { console.log('已到最後一頁'); break; }
    if (all.size === before) { console.log('這頁沒有新資料，翻頁參數可能不對，已停止'); break; }
    next = j.next;
    await sleep(400);
  }

  // 4. 輸出 CSV
  const fmt = ms => ms ? new Date(ms).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) : '';
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['UID', 'LINE名稱', '備註名(車牌)', '標籤', '是否好友', '最後聊天時間'];
  const lines = [...all.values()].map(c => [
    c.contactId,
    c.profile?.name,
    c.profile?.nickname,
    (c.tagIds || []).map(id => tagMap[id] || id).join(' | '),
    c.friend ? 'Y' : 'N',
    fmt(c.lastTalkedAt)
  ].map(esc).join(','));
  const csv = '﻿' + head.join(',') + '\n' + lines.join('\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `LINE聯絡人_${all.size}筆.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log('完成，共', all.size, '筆');
})();
