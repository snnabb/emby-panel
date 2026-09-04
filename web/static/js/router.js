const Router = {
  routes: Object.create(null),
  current: null,
  initialized: false,
  pageMeta: {
    dashboard: ['仪表盘', '反代服务运行概览'],
    sites: ['站点管理', '管理入口、回源与站点策略'],
    'request-logs': ['日志记录', '检索客户端请求与视频流记录'],
    'telegram-report': ['Telegram 日报', '配置请求与流量数据的定时通知'],
    'settings-tls': ['TLS 设置', '管理面板域名、监听端口与证书'],
    'global-settings': ['全局设置', ''],
    'backup-restore': ['备份与恢复', '创建加密备份或恢复 Meridian 数据'],
    account: ['账户', '查看账户信息并修改用户名或密码'],
    diagnostics: ['故障诊断', '检查入口、回源与运行状态'],
  },
  parentRoutes: new Set(['settings-tls', 'telegram-report', 'diagnostics', 'backup-restore']),

  register(path, handler) {
    this.routes[path] = handler;
  },

  navigate(path) {
    location.hash = path;
  },

  resolve() {
    const hash = location.hash.slice(1) || 'dashboard';
    if (hash === 'traffic') {
      location.hash = 'dashboard';
      return;
    }
    const previous = this.current;

    if (previous === 'dashboard' && hash !== 'dashboard' && typeof stopDashSSE === 'function') {
      stopDashSSE();
    }
    if (previous === 'request-logs' && hash !== 'request-logs' && typeof stopRequestLogRefresh === 'function') {
      stopRequestLogRefresh();
    }

    this.current = hash;

    let activeNav = null;
    document.querySelectorAll('.topnav-link').forEach(link => {
      const active = link.dataset.page === hash || (link.dataset.page === 'global-settings' && this.parentRoutes.has(hash));
      link.classList.toggle('active', active);
      if (typeof link.setAttribute === 'function' && typeof link.removeAttribute === 'function') {
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      if (active) activeNav = link;
    });
    const accountButton = document.getElementById('avatar-btn');
    if (accountButton) {
      const active = hash === 'account';
      accountButton.classList.toggle('active', active);
      if (typeof accountButton.setAttribute === 'function' && typeof accountButton.removeAttribute === 'function') {
        if (active) accountButton.setAttribute('aria-current', 'page');
        else accountButton.removeAttribute('aria-current');
      }
    }
    document.querySelectorAll('.mobile-tab').forEach(tab => {
      const active = tab.dataset.page === hash;
      tab.classList.toggle('active', active);
      if (typeof tab.setAttribute === 'function' && typeof tab.removeAttribute === 'function') {
        if (active) tab.setAttribute('aria-current', 'page');
        else tab.removeAttribute('aria-current');
      }
    });

    const meta = this.parentRoutes.has(hash) ? this.pageMeta['global-settings'] : (this.pageMeta[hash] || [hash, '']);
    const title = document.getElementById('app-page-title');
    const subtitle = document.getElementById('app-page-subtitle');
    const icon = document.getElementById('app-page-icon');
    if (title) title.textContent = meta[0];
    if (subtitle) {
      subtitle.textContent = meta[1];
      subtitle.hidden = !meta[1];
    }
    document.title = `${meta[0]} — Meridian`;
    if (icon && hash === 'account') {
      icon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
    } else if (icon && activeNav && typeof activeNav.querySelector === 'function') {
      const svg = activeNav.querySelector('svg');
      if (svg) icon.innerHTML = svg.outerHTML;
    }

    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active', 'page-entering');
    });
    const target = document.getElementById('page-' + hash);
    if (target) {
      target.classList.add('active');
    }

    const handler = this.routes[hash];
    if (handler) handler();
  },

  init() {
    if (this.initialized) return;
    window.addEventListener('hashchange', () => this.resolve());
    this.initialized = true;
  }
};
