'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const accountScript = fs.readFileSync(path.join(root, 'web', 'static', 'js', 'pages', 'account.js'), 'utf8');

test('account entry navigates to an account page and logout is presented as a red account action', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'static', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'web', 'static', 'js', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'web', 'static', 'css', 'style.css'), 'utf8');

  assert.match(html, /id="avatar-btn"[^>]*href="#account"[^>]*aria-label="打开账户页面"/);
  assert.match(html, /id="page-account"/);
  assert.match(html, /pages\/account\.js/);
  assert.match(app, /getElementById\('avatar-btn'\)\.addEventListener/);
  assert.match(accountScript, /id="account-logout"/);
  assert.match(css, /\.account-logout-button[\s\S]*?background:\s*var\(--red\)/);
});

test('configured login no longer exposes a manual administrator registration link', () => {
  const app = fs.readFileSync(path.join(root, 'web', 'static', 'js', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /id="link-register"/);
  assert.doesNotMatch(app, /创建管理员账户|创建管理员账号<\/a>/);
  assert.match(app, /用户名或密码错误/);
});

test('account page translates credential validation errors for the administrator', () => {
  const sandbox = { window: {}, API: {}, document: {}, Router: {}, Toast: {}, esc: value => String(value) };
  vm.createContext(sandbox);
  vm.runInContext(accountScript, sandbox, { filename: 'account.js' });

  assert.equal(sandbox.accountErrorMessage(new Error('current password is incorrect')), '当前密码不正确');
  assert.equal(sandbox.accountErrorMessage(new Error('password must be 12-72 bytes')), '新密码需要为 12–72 个字符');
});

test('account page provides secret toggle buttons for current and new passwords', () => {
  assert.match(accountScript, /data-toggle-target="account-current-password"/);
  assert.match(accountScript, /data-toggle-target="account-new-password"/);
  assert.match(accountScript, /data-toggle-target="account-confirm-password"/);
});

