(function() {
  'use strict';

  const loginEl = document.getElementById('page-login');
  const shellEl = document.getElementById('app-shell');
  const loginFooterEl = document.getElementById('login-footer');
  const loginButtonEl = document.getElementById('btn-login');
  let dashboardRefreshTimer = null;
  let appBootstrapped = false;
  let modalBackdropClosable = false;
  let authStatus = {
    needs_setup: false,
    mode: 'single_admin',
    jwt_secret_ephemeral: false,
  };

  window.openModal = function(options) {
    modalBackdropClosable = !!(options && options.closeOnBackdrop);
    document.getElementById('modal-overlay').classList.add('active');
  };

  window.closeModal = function() {
    modalBackdropClosable = false;
    document.getElementById('modal-overlay').classList.remove('active');
  };

  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this && modalBackdropClosable) closeModal();
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);

  async function checkAuth() {
    if (API.token) {
      enterApp();
      return;
    }

    try {
      const res = await API.checkSetup();
      authStatus = Object.assign({}, authStatus, res || {});
      if (res.needs_setup) {
        showSetupMode();
        return;
      }
    } catch (e) {
      // Server not available, just show login
    }

    showLoginMode();
  }

  function renderLoginFooter(isSetup) {
    const lines = [];
    if (authStatus.mode === 'single_admin') {
      lines.push(isSetup
        ? '当前为单管理员模式，请创建唯一的管理员账号。'
        : '当前为单管理员模式。首次使用？<a href="#" id="link-register">创建管理员账号</a>');
    } else {
      lines.push(isSetup
        ? '首次使用，请创建管理员账号。'
        : '首次使用？<a href="#" id="link-register">创建管理员账号</a>');
    }

    if (authStatus.jwt_secret_ephemeral) {
      lines.push('<span class="login-note warn">当前未固定 JWT_SECRET，服务重启后需要重新登录。</span>');
    }

    return lines.join('');
  }

  function showSetupMode() {
    loginButtonEl.textContent = '注册';
    loginButtonEl.disabled = false;
    loginFooterEl.innerHTML = renderLoginFooter(true);
    loginEl._isSetup = true;
  }

  function showLoginMode() {
    loginButtonEl.textContent = '登录';
    loginButtonEl.disabled = false;
    loginFooterEl.innerHTML = renderLoginFooter(false);
    loginEl._isSetup = false;
  }

  function startDashboardRefresh() {
    if (dashboardRefreshTimer) clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer = setInterval(() => {
      if (Router.current === 'dashboard') loadDashboardData();
    }, 15000);
  }

  function stopDashboardRefresh() {
    if (!dashboardRefreshTimer) return;
    clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer = null;
  }

  function teardownAppRuntime() {
    stopDashboardRefresh();
    if (typeof stopDashSSE === 'function') stopDashSSE();
  }

  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('inp-username').value.trim();
    const password = document.getElementById('inp-password').value;

    if (!username || !password) {
      Toast.error('请填写用户名和密码');
      return;
    }

    if (password.length < 6) {
      Toast.error('密码至少 6 位');
      return;
    }

    loginButtonEl.disabled = true;
    loginButtonEl.textContent = '处理中...';

    try {
      let res;
      if (loginEl._isSetup) {
        res = await API.setup(username, password);
        Toast.success('管理员创建成功');
      } else {
        res = await API.login(username, password);
        Toast.success('欢迎回来, ' + res.username + '!');
      }
      API.token = res.token;
      API.username = res.username;
      enterApp();
    } catch (err) {
      Toast.error(err.message);
      loginButtonEl.disabled = false;
      loginButtonEl.textContent = loginEl._isSetup ? '注册' : '登录';
    }
  });

  loginFooterEl.addEventListener('click', function(e) {
    const registerLink = e.target.closest('#link-register');
    if (!registerLink) return;
    e.preventDefault();
    showSetupMode();
  });

  function enterApp() {
    loginEl.classList.add('hidden');
    shellEl.classList.add('active');

    const avatar = document.getElementById('avatar-btn');
    avatar.textContent = (API.username || 'A')[0].toUpperCase();

    if (!appBootstrapped) {
      Router.register('dashboard', renderDashboard);
      Router.register('sites', renderSites);
      Router.register('traffic', renderTraffic);
      Router.register('diagnostics', renderDiag);
      Router.init();
      appBootstrapped = true;
    }

    Router.resolve();
    startDashboardRefresh();
  }

  document.getElementById('avatar-btn').addEventListener('click', function() {
    if (!confirm('确认退出登录？')) return;

    teardownAppRuntime();
    API.logout();
    loginEl.classList.remove('hidden');
    shellEl.classList.remove('active');
    showLoginMode();
    document.getElementById('inp-password').value = '';
    Toast.info('已退出登录');
  });

  checkAuth();
})();
