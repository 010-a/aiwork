const $ = s => document.querySelector(s);
const storageKey = 'aiwork-town-v1';
let state, initial, busy = false, timer = null, storageWorks = true;
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(text) { $('#message').textContent = text || ''; }
async function request(path, data) {
  const response = await fetch(path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { storageWorks = false; message('浏览器存储不可用，刷新后进度可能丢失。'); }
}
function render() {
  $('#day').textContent = `第 ${state.day} 天`;
  $('#phase').textContent = ['清晨 ☀','午后 🌤','傍晚 🌇','夜晚 🌙'][state.turn ? (state.turn - 1) % 4 : 0];
  $('#turn').textContent = `已推进 ${state.turn} 回合`;
  $('#resources').innerHTML = Object.entries(state.resources).map(([key,v]) => `<div><div class="resource-top"><span>${{food:'🥕 食物',power:'⚡ 电力',trust:'🤝 信任'}[key]}</span><b>${v}/100</b></div><div class="bar ${v < 35 ? 'low' : ''}"><div style="width:${v}%"></div></div></div>`).join('');
  document.querySelectorAll('[data-place]').forEach(node => {
    node.innerHTML = state.residents.filter(p => p.location === node.dataset.place).map(p => `<span class="person-dot">${escapeHtml(p.emoji)} ${escapeHtml(p.name)}</span>`).join('');
  });
  $('#residents').innerHTML = state.residents.map(p => `<button class="resident" data-resident="${escapeHtml(p.id)}"><div class="resident-title"><span class="avatar">${escapeHtml(p.emoji)}</span><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.role)} · ${escapeHtml(p.location)}</small></div></div><p>${escapeHtml(p.goal)}</p><div class="mood"><span>心情 ${p.mood >= 60 ? '🙂' : '😟'} ${p.mood}</span><span>${p.memory.length} 条记忆 ↗</span></div></button>`).join('');
  $('#timeline').innerHTML = [...state.log].reverse().map(entry => {
    if (entry.kind === 'event') return `<div class="event-entry"><small>小镇广播 · 第 ${escapeHtml(entry.turn)} 回合</small>${escapeHtml(entry.text)}</div>`;
    const person = state.residents.find(p => p.id === entry.id);
    return `<div class="entry"><div class="entry-heading"><span>${escapeHtml(person?.emoji || '💬')}</span><b>${escapeHtml(entry.name)}</b><small>第 ${escapeHtml(entry.turn)} 回合</small></div><div class="bubble">${escapeHtml(entry.text)}</div><div class="entry-action">${escapeHtml(entry.action)}</div></div>`;
  }).join('');
  $('#timeline').scrollTop = 0;
  $('#log-count').textContent = `${state.log.length} 条动态`;
}
function lock(value) {
  busy = value;
  document.querySelectorAll('button:not(#close-dialog)').forEach(b => b.disabled = value);
  $('#custom-event').disabled = value;
  $('#busy').textContent = value ? '居民正在回应…' : '';
}
function stopAuto() {
  clearTimeout(timer); timer = null;
  $('#auto').textContent = '▶ 自动生活';
}
async function step(event = '') {
  if (busy) return;
  lock(true); message('');
  try {
    const result = await request('/api/step', {state, event});
    state = result.state;
    $('#mode').textContent = result.mode === 'ai' ? '✦ AI 对话模式' : '◉ 本地规则模拟';
    render(); save();
    if (result.warning) { message(result.warning); stopAuto(); }
    else if (!storageWorks) message('浏览器存储不可用，刷新后进度可能丢失。');
    return true;
  } catch (error) {
    message(`${error.message}；当前进度已保留。`); stopAuto();
    return false;
  } finally { lock(false); }
}
$('#step').addEventListener('click', () => step());
document.querySelectorAll('[data-event]').forEach(button => button.addEventListener('click', () => step(button.dataset.event)));
$('#event-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('#custom-event').value.trim();
  if (!text) { message('先写一件要发生的事吧。'); return; }
  if (await step(text)) $('#custom-event').value = '';
});
$('#auto').addEventListener('click', () => {
  if (timer !== null) { stopAuto(); return; }
  $('#auto').textContent = '⏸ 暂停生活';
  const tick = async () => {
    await step();
    if (timer !== null) timer = setTimeout(tick, 5000);
  };
  timer = setTimeout(tick, 5000);
});
$('#reset').addEventListener('click', () => {
  if (!confirm('重新开始会清空当前浏览器的小镇进度，确定吗？')) return;
  stopAuto(); state = structuredClone(initial); render(); message(''); save();
});
$('#residents').addEventListener('click', event => {
  const button = event.target.closest('[data-resident]');
  if (!button) return;
  const p = state.residents.find(p => p.id === button.dataset.resident);
  $('#memory-content').innerHTML = `<h2>${escapeHtml(p.emoji)} ${escapeHtml(p.name)}</h2><p>${escapeHtml(p.personality)}</p><p>正在做：${escapeHtml(p.action)}</p><h3>最近的记忆</h3>${p.memory.length ? `<ol>${[...p.memory].reverse().map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ol>` : '<p>还没有经历。推进一个回合，让故事开始吧。</p>'}`;
  $('#memory-dialog').showModal();
});
$('#close-dialog').addEventListener('click', () => $('#memory-dialog').close());
async function init() {
  lock(true);
  try {
    const status = await request('/api/status'); initial = status.initial; state = structuredClone(initial);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const candidate = JSON.parse(saved);
        if (candidate && Number.isInteger(candidate.turn) && Number.isInteger(candidate.day) && candidate.resources && Object.keys(candidate.resources).sort().join() === 'food,power,trust' && Object.values(candidate.resources).every(v => Number.isInteger(v) && v >= 0 && v <= 100) && Array.isArray(candidate.residents) && candidate.residents.length === 5 && candidate.residents.every((p,i) => p.id === initial.residents[i].id && Array.isArray(p.memory) && p.memory.length <= 8 && Number.isInteger(p.mood)) && Array.isArray(candidate.log) && candidate.log.length <= 150) state = candidate;
        else message('旧存档格式无效，已开始新小镇。');
      }
    } catch { message('存档读取失败，已开始新小镇。'); }
    $('#mode').textContent = status.ai_configured ? '✦ AI 已配置' : '◉ 本地规则模拟';
    render(); lock(false);
  } catch { message('无法连接小镇服务，请启动 server.py 后刷新页面。'); }
}
init();
