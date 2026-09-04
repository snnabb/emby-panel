let requestLogCategoryFilter = 'all';
let requestLogStatusFilter = 'all';
let requestLogSearchTimer = null;
let requestLogRefreshTimer = null;
let requestLogLoadGeneration = 0;
let requestLogLoading = false;
let requestLogReloadQueued = false;
let currentRenderedLogs = [];
let requestLogUserInteracting = false;
let requestLogDisplaySettings = { node: true, category: true, status: true, client_ip: true, ua: true, upstream_ua: true, backend_address: true, timeline: true };

function requestLogDateOnlyValue(value) {
  if (typeof meridianDateOnlyValue === 'function') return meridianDateOnlyValue(value);
  const date = value instanceof Date ? value : new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function requestLogParseDateOnly(value, endOfDay) {
  if (typeof meridianParseDateOnly === 'function') return meridianParseDateOnly(value, endOfDay);
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return date.getTime();
}

function requestLogFormatDateTime(timestamp) {
  if (typeof meridianFormatDateTime === 'function') return meridianFormatDateTime(timestamp);
  return new Date(Number(timestamp)).toLocaleString('zh-CN', { hour12: false });
}

function requestLogFormatDate(timestamp) {
  if (typeof meridianFormatDate === 'function') return meridianFormatDate(timestamp);
  return new Date(Number(timestamp)).toLocaleDateString('zh-CN');
}

function requestLogApplyDisplaySettings(settings) {
  requestLogDisplaySettings = {
    node: settings?.log_display_node !== false,
    category: settings?.log_display_category !== false,
    status: settings?.log_display_status !== false,
    client_ip: settings?.log_display_client_ip !== false,
    ua: settings?.log_display_ua !== false,
    upstream_ua: settings?.log_display_upstream_ua !== false,
    backend_address: settings?.log_display_backend_address !== false,
    timeline: settings?.log_display_timeline !== false,
  };
  document.querySelectorAll('[data-log-field="node"]').forEach(node => { node.hidden = !requestLogDisplaySettings.node; });
  document.querySelectorAll('[data-log-field="category"]').forEach(node => { node.hidden = !requestLogDisplaySettings.category; });
  document.querySelectorAll('[data-log-field="status"]').forEach(node => { node.hidden = !requestLogDisplaySettings.status; });
  document.querySelectorAll('[data-log-field="ip"]').forEach(node => { node.hidden = !requestLogDisplaySettings.client_ip; });
  document.querySelectorAll('[data-log-field="ua"]').forEach(node => { node.hidden = !requestLogDisplaySettings.ua; });
  document.querySelectorAll('[data-log-field="upstream-ua"]').forEach(node => { node.hidden = !requestLogDisplaySettings.upstream_ua; });
  document.querySelectorAll('[data-log-field="backend-address"]').forEach(node => { node.hidden = !requestLogDisplaySettings.backend_address; });
  document.querySelectorAll('[data-log-field="timeline"]').forEach(node => { node.hidden = !requestLogDisplaySettings.timeline; });
}

function requestLogDateInputValue(date) {
  return requestLogDateOnlyValue(date);
}

function requestLogRangeMilliseconds(fromValue, toValue) {
  const from = requestLogParseDateOnly(fromValue, false);
  const to = requestLogParseDateOnly(toValue, true);
  return {
    from_ms: Number.isFinite(from) ? from : 0,
    to_ms: Number.isFinite(to) ? to : 0,
  };
}

function requestLogCategoryLabel(category) {
  return ({
    playback: '播放信息',
    playback_sync: '播放状态同步',
    video: '视频流',
    stream: '主视频流',
    manifest: '播放清单',
    segment: '媒体分片',
    image: '图片海报',
    metadata: '媒体元数据',
    subtitle: '字幕',
    asset: '静态资源',
    websocket: 'WebSocket',
    api: '常规 API',
    auth: '用户认证',
  })[category] || '—';
}

function requestLogRelativeTime(timestamp, now) {
  if (!Number(timestamp)) return '—';
  const delta = Math.max(0, (now === undefined ? Date.now() : now) - Number(timestamp || 0));
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return requestLogFormatDate(Number(timestamp || 0));
}

function requestLogStatusClass(status) {
  status = Number(status || 0);
  if (status >= 200 && status < 400) return 'request-log-status-ok';
  if (status >= 400 && status < 500) return 'request-log-status-client';
  return 'request-log-status-server';
}

function renderRequestLogs() {
  const page = document.getElementById('page-request-logs');
  requestLogUserInteracting = false;
  const today = Date.now();
  const yesterday = today - 24 * 60 * 60 * 1000;
  requestLogCategoryFilter = 'all';
  requestLogStatusFilter = 'all';

  page.innerHTML = `
    <h1 class="section-title fade-up">日志记录</h1>
    <p class="section-sub fade-up">查看各站点的请求状态、客户端 IP、客户端 UA 与实际发往后端的上游 UA。日志不保存查询参数、令牌、Cookie 或正文。</p>

    <section class="request-log-controls fade-up">
      <div class="request-log-search-row">
        <label class="request-log-date-field">
          <span>开始日期</span>
          <input type="date" class="form-input" id="request-log-from" value="${requestLogDateInputValue(yesterday)}">
        </label>
        <span class="request-log-date-separator">至</span>
        <label class="request-log-date-field">
          <span>结束日期</span>
          <input type="date" class="form-input" id="request-log-to" value="${requestLogDateInputValue(today)}">
        </label>
        <label class="request-log-search-field">
          <span class="sr-only">搜索日志</span>
          <input type="search" class="form-input" id="request-log-search" placeholder="搜索节点、客户端 IP、客户端/上游 UA、路径或状态码（如 200）" autocomplete="off">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
        </label>
      </div>

      <div class="request-log-filter-row">
        <label class="request-log-filter-label" for="request-log-category">资源类别</label>
        <select class="form-select request-log-filter-select" id="request-log-category">
          <option value="all">全部资源</option>
          <option value="playback">播放信息</option>
          <option value="playback_sync">播放状态同步</option>
          <option value="video">视频与流媒体</option>
          <option value="image">图片海报</option>
          <option value="asset">静态资源</option>
          <option value="api">常规 API</option>
          <option value="auth">用户认证</option>
        </select>
      </div>

      <div class="request-log-filter-row">
        <label class="request-log-filter-label" for="request-log-status">状态</label>
        <select class="form-select request-log-filter-select" id="request-log-status">
          <option value="all">全部状态</option>
          <option value="2xx">正常 2xx</option>
          <option value="3xx">正常 3xx</option>
          <option value="4xx">客户端错误 4xx</option>
          <option value="5xx">服务端错误 5xx</option>
        </select>
      </div>

      <div class="request-log-actions">
        <button type="button" class="request-log-action danger" id="request-cache-clear">
          <svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><line x1="9" y1="10" x2="15" y2="16"/><line x1="15" y1="10" x2="9" y2="16"/></svg>
          清除缓存
        </button>
        <button type="button" class="request-log-action danger" id="request-log-clear">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M8 6V4h8v2"/></svg>
          清空日志
        </button>
        <button type="button" class="request-log-action" id="request-log-refresh">
          <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/></svg>
          刷新
        </button>
        <span class="request-log-summary" id="request-log-summary">正在读取日志…</span>
      </div>
    </section>

    <section class="request-log-table-card fade-up" aria-label="请求日志列表">
      <div class="request-log-table-scroll">
        <table class="request-log-table">
          <colgroup>
            <col class="request-log-col-node"><col class="request-log-col-category"><col class="request-log-col-status">
            <col class="request-log-col-ip"><col class="request-log-col-ua"><col class="request-log-col-upstream-ua"><col class="request-log-col-backend"><col class="request-log-col-time">
          </colgroup>
          <thead><tr>
            <th data-log-field="node">节点</th><th data-log-field="category">资源类别</th><th data-log-field="status">状态</th><th data-log-field="ip">客户端 IP</th><th data-log-field="ua">客户端 UA</th><th data-log-field="upstream-ua">上游 UA</th><th data-log-field="backend-address">后端地址</th><th data-log-field="timeline">时间线</th>
          </tr></thead>
          <tbody id="request-log-body">
            <tr><td colspan="8" class="request-log-empty">正在加载…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;

  const categorySelect = document.getElementById('request-log-category');
  if (categorySelect) categorySelect.onchange = event => {
    requestLogCategoryFilter = event.target.value;
    loadRequestLogs();
  };
  const statusSelect = document.getElementById('request-log-status');
  if (statusSelect) statusSelect.onchange = event => {
    requestLogStatusFilter = event.target.value;
    loadRequestLogs();
  };
  document.getElementById('request-log-from').onchange = loadRequestLogs;
  document.getElementById('request-log-to').onchange = loadRequestLogs;
  document.getElementById('request-log-search').oninput = () => {
    if (requestLogSearchTimer) clearTimeout(requestLogSearchTimer);
    requestLogSearchTimer = setTimeout(loadRequestLogs, 300);
  };
  document.getElementById('request-log-refresh').onclick = loadRequestLogs;
  document.getElementById('request-log-clear').onclick = clearRequestLogs;
  document.getElementById('request-cache-clear').onclick = clearAssetCache;
  if (API.getSystemSettings) API.getSystemSettings().then(settings => {
    if (typeof meridianSetTimezoneName === 'function' && settings?.schedule_timezone) meridianSetTimezoneName(settings.schedule_timezone);
    if (typeof meridianSetTimezoneOffset === 'function') meridianSetTimezoneOffset(settings?.schedule_timezone_offset);
    requestLogApplyDisplaySettings(settings);
  }).catch(() => requestLogApplyDisplaySettings(null));
  const scroller = document.querySelector ? document.querySelector('.request-log-table-scroll') : null;
  if (scroller) {
    scroller.addEventListener('mouseenter', () => { requestLogUserInteracting = true; });
    scroller.addEventListener('mouseleave', () => { requestLogUserInteracting = false; });
  }
  const logBody = document.getElementById('request-log-body');
  if (logBody && logBody.addEventListener) {
    logBody.addEventListener('click', event => {
      const row = event.target.closest ? event.target.closest('tr[data-log-id]') : null;
      if (!row) return;
      const logId = row.dataset.logId;
      const next = row.nextElementSibling;
      if (next && next.classList && next.classList.contains('log-detail-row')) {
        next.remove();
        row.classList.remove('log-row-expanded');
        return;
      }
      document.querySelectorAll('.log-detail-row').forEach(r => r.remove());
      document.querySelectorAll('.log-row-expanded').forEach(r => r.classList.remove('log-row-expanded'));
      const entry = currentRenderedLogs.find(l => String(l.id) === String(logId));
      if (!entry) return;
      row.classList.add('log-row-expanded');
      const detailTr = document.createElement('tr');
      detailTr.className = 'log-detail-row';
      const exactTime = entry.recorded_at_ms ? requestLogFormatDateTime(Number(entry.recorded_at_ms)) : '未写入时间线';
      detailTr.innerHTML = `
        <td colspan="8">
          <div class="log-detail-card">
            <div class="log-detail-header">
              <span class="log-detail-path-badge">${esc(entry.method || 'GET')} ${esc(entry.path || '/')}</span>
              <button type="button" class="log-detail-copy-btn">复制路径</button>
            </div>
            <div class="log-detail-grid">
              <div class="log-detail-item"><span class="log-detail-label">客户端 IP & 地区</span><span class="log-detail-val">${esc(entry.client_ip || '—')} (${esc(entry.client_region || '未知')})</span></div>
              <div class="log-detail-item"><span class="log-detail-label">后端回源目标</span><span class="log-detail-val">${esc(entry.backend_address || '—')}</span></div>
              <div class="log-detail-item"><span class="log-detail-label">精准时间</span><span class="log-detail-val">${esc(exactTime)}</span></div>
              <div class="log-detail-item"><span class="log-detail-label">客户端完整 UA</span><span class="log-detail-val">${esc(entry.user_agent || '—')}</span></div>
              <div class="log-detail-item"><span class="log-detail-label">改写后上游 UA</span><span class="log-detail-val">${esc(entry.upstream_user_agent || '—')}</span></div>
            </div>
          </div>
        </td>
      `;
      detailTr.querySelector?.('.log-detail-copy-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(entry.path || '/').then(() => Toast.success('路径已复制'));
        }
      });
      if (typeof row.after === 'function') row.after(detailTr);
    });
  }
  loadRequestLogs({ showLoading: true });
  if (requestLogRefreshTimer) clearInterval(requestLogRefreshTimer);
  requestLogRefreshTimer = setInterval(() => {
    if (Router.current === 'request-logs' && !requestLogUserInteracting && !document.querySelector('.log-detail-row')) {
      loadRequestLogs({ showLoading: false });
    }
  }, 5000);
}

function stopRequestLogRefresh() {
  requestLogLoadGeneration += 1;
  if (requestLogRefreshTimer) {
    clearInterval(requestLogRefreshTimer);
    requestLogRefreshTimer = null;
  }
  if (requestLogSearchTimer) {
    clearTimeout(requestLogSearchTimer);
    requestLogSearchTimer = null;
  }
  requestLogReloadQueued = false;
  requestLogUserInteracting = false;
}

function setRequestLogActivePill(containerId, activeButton) {
  document.querySelectorAll(`#${containerId} .request-log-pill`).forEach(button => {
    button.classList.toggle('active', button === activeButton);
  });
}

async function loadRequestLogs(options = {}) {
  const body = document.getElementById('request-log-body');
  if (!body) return;
  if (requestLogLoading) {
    requestLogReloadQueued = true;
    return;
  }
  requestLogReloadQueued = false;
  const from = document.getElementById('request-log-from').value;
  const to = document.getElementById('request-log-to').value;
  const range = requestLogRangeMilliseconds(from, to);
  if (!range.from_ms || !range.to_ms || range.from_ms > range.to_ms) {
    Toast.error('请选择有效的日志日期范围');
    return;
  }
  const generation = ++requestLogLoadGeneration;
  const scroller = body.closest('.request-log-table-scroll');
  const previousScrollTop = scroller ? scroller.scrollTop : 0;
  const previousScrollHeight = scroller ? scroller.scrollHeight : 0;
  const preserveViewport = previousScrollTop > 0;
  requestLogLoading = true;
  if (options.showLoading === true && !body.querySelector('tr[data-log-id]')) {
    body.innerHTML = '<tr><td colspan="8" class="request-log-empty">正在加载…</td></tr>';
  }
  try {
    const response = await API.getRequestLogs({
      ...range,
      category: requestLogCategoryFilter,
      status: requestLogStatusFilter,
      q: document.getElementById('request-log-search').value.trim(),
      limit: 500,
    });
    if (generation !== requestLogLoadGeneration || Router.current !== 'request-logs' || !response) return;
    renderRequestLogRows(response.logs || []);
    if (scroller && preserveViewport) {
      const addedHeight = Math.max(0, scroller.scrollHeight - previousScrollHeight);
      scroller.scrollTop = previousScrollTop + addedHeight;
    }
    const dropped = Number(response.dropped_logs || 0);
    document.getElementById('request-log-summary').textContent = dropped > 0
      ? `显示 ${response.logs.length} 条，繁忙时已丢弃 ${dropped} 条`
      : `显示 ${response.logs.length} 条（最多 500 条）`;
  } catch (error) {
    if (generation !== requestLogLoadGeneration) return;
    if (!body.querySelector('tr[data-log-id]')) {
      body.innerHTML = '<tr><td colspan="8" class="request-log-empty request-log-error">日志读取失败</td></tr>';
    }
    Toast.error(error.message);
  } finally {
    requestLogLoading = false;
    if (requestLogReloadQueued && Router.current === 'request-logs') {
      requestLogReloadQueued = false;
      loadRequestLogs({ showLoading: false });
    }
  }
}

function renderRequestLogRows(logs) {
  const body = document.getElementById('request-log-body');
  if (!body) return;
  currentRenderedLogs = Array.isArray(logs) ? logs : [];
  if (!logs.length) {
    body.innerHTML = '<tr><td colspan="8" class="request-log-empty">当前条件下暂无日志</td></tr>';
    return;
  }
  body.innerHTML = logs.map(entry => {
    const status = Number(entry.status_code || 0);
    const recordedAtMS = Number(entry.recorded_at_ms || 0);
    const exactTime = recordedAtMS ? requestLogFormatDateTime(recordedAtMS) : '未写入时间线';
    const requestTitle = `${String(entry.method || 'GET')} ${String(entry.path || '/')}`;
    return `
      <tr data-log-id="${esc(entry.id || '')}" title="${esc(requestTitle)}">
        <td data-log-field="node"><span class="request-log-node">${esc(entry.site_name || '—')}</span></td>
        <td data-log-field="category"><span class="request-log-category">${esc(requestLogCategoryLabel(entry.resource_category))}</span></td>
        <td data-log-field="status"><span class="request-log-status ${requestLogStatusClass(status)}">${status || '—'}</span></td>
        <td data-log-field="ip"><span class="request-log-ip mono">${esc(entry.client_ip || '—')}</span><small class="request-log-region">${esc(entry.client_region || '')}</small></td>
        <td data-log-field="ua"><span class="request-log-ua">${esc(entry.user_agent || '—')}</span></td>
        <td data-log-field="upstream-ua"><span class="request-log-ua">${esc(entry.upstream_user_agent || '—')}</span></td>
        <td data-log-field="backend-address"><span class="request-log-backend mono">${esc(entry.backend_address || '—')}</span></td>
        <td data-log-field="timeline"><time class="request-log-time"${recordedAtMS ? ` datetime="${new Date(recordedAtMS).toISOString()}"` : ''} title="${esc(exactTime)}">${esc(requestLogRelativeTime(recordedAtMS))}</time></td>
      </tr>
    `;
  }).join('');
}

async function clearRequestLogs() {
  if (!confirm('确认清空全部请求日志？该操作不可撤销。')) return;
  try {
    await API.clearRequestLogs();
    Toast.success('请求日志已清空');
    loadRequestLogs();
  } catch (error) {
    Toast.error(error.message);
  }
}

async function clearAssetCache() {
  if (!confirm('确认清除所有站点的图片与静态资源缓存？站点配置和请求日志不会受到影响。')) return;
  try {
    await API.clearAssetCache();
    Toast.success('资产缓存已清除');
  } catch (error) {
    Toast.error(error.message);
  }
}
