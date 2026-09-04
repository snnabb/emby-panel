'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadHelpers() {
  const source = loadSitesSource();
  const sandbox = { window: {}, URL, esc: value => String(value) };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'sites.js' });
  return sandbox;
}

function loadSitesSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'web', 'static', 'js', 'pages', 'sites.js'), 'utf8');
}

test('ingress form exposes the secure host-only mode without a listener', () => {
  const { ingressFormState } = loadHelpers();
  const host = ingressFormState('host');
  assert.equal(host.showPublicHost, true);
  assert.equal(host.requirePublicHost, true);
	assert.equal(host.requireListenPort, false);
	assert.match(host.portLabel, /可选/);
	assert.match(host.warning, /不会绑定/);
	assert.match(host.warning, /TLS .*\u8bc1\u4e66/);
	assert.equal(ingressFormState('port').requireListenPort, true);
	assert.equal(ingressFormState('path').requireListenPort, false);
	assert.equal(ingressFormState('path').requirePathPrefix, true);
	assert.match(ingressFormState('path').warning, /面板域名和端口/);
	assert.equal(ingressFormState('unset').requireListenPort, false);
	assert.match(ingressFormState('unset').warning, /请选择可用入口/);
});

test('ingress payload clears stale host for port mode and preserves it otherwise', () => {
  const { buildIngressPayload } = loadHelpers();
  assert.deepEqual(JSON.parse(JSON.stringify(buildIngressPayload('port', '8001', 'stale.example.com'))), {
    ingress_mode: 'port', listen_port: 8001, public_host: '', path_prefix: '',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildIngressPayload('host', '8002', ' media.example.com '))), {
    ingress_mode: 'host', listen_port: 8002, public_host: 'media.example.com', path_prefix: '',
  });
	assert.deepEqual(JSON.parse(JSON.stringify(buildIngressPayload('host', '', ' media.example.com '))), {
		ingress_mode: 'host', listen_port: 0, public_host: 'media.example.com', path_prefix: '',
	});
  assert.deepEqual(JSON.parse(JSON.stringify(buildIngressPayload('both', '8003', 'media.example.com'))), {
    ingress_mode: 'both', listen_port: 8003, public_host: 'media.example.com', path_prefix: '',
  });
	assert.deepEqual(JSON.parse(JSON.stringify(buildIngressPayload('path', '', 'stale.example.com', '', '', ' Emby '))), {
		ingress_mode: 'path', listen_port: 0, public_host: '', path_prefix: 'Emby',
	});
});

test('new-site ingress defaults follow backend host-only capability', () => {
  const { defaultIngressMode } = loadHelpers();
  assert.equal(defaultIngressMode({ host_only_available: true, domain_prefix_available: true, panel_tls_enabled: true }), 'host');
  assert.equal(defaultIngressMode({ host_only_available: false }), 'port');
	assert.equal(defaultIngressMode({ host_only_available: true, domain_prefix_available: true, panel_tls_enabled: false }), 'port');
	assert.equal(defaultIngressMode({ host_only_available: true, domain_prefix_available: false, panel_tls_enabled: true }), 'port');
  assert.equal(defaultIngressMode(undefined), 'host');
});

test('ingress mode labels remain concise for the site card', () => {
  const { siteIngressModeLabel } = loadHelpers();
  assert.equal(siteIngressModeLabel({ ingress_mode: 'host' }), '域名前缀');
  assert.equal(siteIngressModeLabel({ ingress_mode: 'port' }), '独立端口');
	assert.equal(siteIngressModeLabel({ ingress_mode: 'path' }), '路径');
  assert.equal(siteIngressModeLabel({ ingress_mode: 'both' }), '域名前缀（兼容）');
  assert.equal(siteIngressModeLabel({ ingress_mode: 'unset' }), '入口未配置');
});

test('site cards place ingress mode above running status and omit playback rows', () => {
  const source = loadSitesSource();
  const start = source.indexOf('async function loadSites()');
  const end = source.indexOf('function filterSiteCards', start);
  const cardSource = source.slice(start, end);

  assert.match(cardSource, /class="site-card-state"/);
  assert.match(cardSource, /siteIngressModeLabel\(s\)/);
  assert.match(cardSource, /normalizedIngressMode\(s\) === 'unset'/);
  assert.match(cardSource, /待配置/);
  assert.match(cardSource, /data-access-address/);
  assert.match(cardSource, /toggleSiteAccessAddress/);
  assert.match(cardSource, /data-site-action="copy"/);
  assert.match(cardSource, /copySiteAccessAddress/);
  assert.match(cardSource, /class="status-badge site-status"/);
  assert.doesNotMatch(cardSource, /renderPlaybackRow\(s\)/);
  assert.doesNotMatch(cardSource, /renderIngressSummary\(s\)/);
  assert.doesNotMatch(cardSource, /播放回源/);
});

test('access addresses use the full card width without ellipsis wrapping', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'web', 'static', 'css', 'style.css'), 'utf8');
  assert.match(css, /\.site-row\.site-access-row > \.site-access-value[\s\S]*?width:\s*100%/);
  assert.match(css, /\.site-row\.site-access-row \.site-access-address[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.site-row\.site-access-row \.site-access-address[\s\S]*?text-overflow:\s*clip/);
  assert.match(css, /\.site-row\.site-access-row \.site-access-address[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.site-row\.site-access-row \.site-access-address[\s\S]*?font-family:\s*inherit/);
  assert.match(css, /\.site-row\.site-access-row \.site-access-address[\s\S]*?border-radius:\s*999px/);
});

test('copySiteAccessAddress copies the raw address even while it is hidden', async () => {
  const sandbox = loadHelpers();
  let copied = '';
  let success = '';
  sandbox.navigator = { clipboard: { writeText: async value => { copied = value; } } };
  sandbox.Toast = { success: value => { success = value; }, error: () => {} };
  const value = { dataset: { accessAddress: 'https://123.divine.de5.net:9090' } };
  const row = { querySelector: selector => selector === '[data-access-address]' ? value : null };
  const button = { closest: () => row };

  await sandbox.copySiteAccessAddress(button);

  assert.equal(copied, 'https://123.divine.de5.net:9090');
  assert.equal(success, '访问地址已复制');
});

test('target authority comparison ignores path and explicit default ports', () => {
  const { normalizedTargetAuthority } = loadHelpers();
	assert.equal(normalizedTargetAuthority('https://origin.example.com/emby'), 'https://origin.example.com:443');
	assert.equal(normalizedTargetAuthority('https://origin.example.com:443/other'), 'https://origin.example.com:443');
	assert.equal(normalizedTargetAuthority('origin.example.com:443/other'), 'https://origin.example.com:443');
  assert.notEqual(normalizedTargetAuthority('https://origin.example.com'), normalizedTargetAuthority('https://other.example.com'));
});

test('site modal always loads deployment capabilities for create and edit flows', () => {
  const source = loadSitesSource();
  const start = source.indexOf('async function showSiteModal(site)');
  const end = source.indexOf('// Global actions', start);
  const modalSource = source.slice(start, end);

  assert.match(modalSource, /API\.ingressCapabilities\(\)\.then\(normalizeSiteCapabilities\)/);
  assert.doesNotMatch(modalSource, /if \(!isEdit\)[\s\S]{0,200}ingressCapabilities/);
	assert.doesNotMatch(modalSource, /id="m-port"[^>]*\srequired(?:\s|>)/);
	assert.match(modalSource, /portInput\.required = state\.requireListenPort/);
	assert.match(modalSource, /panelTLSReady = siteCapabilities\.panel_tls_enabled === true/);
	assert.match(modalSource, /PANEL_ROUTE_DOMAIN/);
	assert.match(modalSource, /TLS .*\u8bc1\u4e66/);
});

test('stream host normalization accepts the array API and legacy JSON strings', () => {
  const { normalizeStreamHosts } = loadHelpers();
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeStreamHosts([' one.example ', '', 42, 'two.example']))), [
    'one.example',
    'two.example',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeStreamHosts('[" legacy-one.example ","legacy-two.example"]'))), [
    'legacy-one.example',
    'legacy-two.example',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeStreamHosts('{'))), []);

});

test('playback limit follows backend capabilities and has a safe compatibility default', () => {
  const { normalizeSiteCapabilities, playbackAddressCount, canAddPlaybackAddress } = loadHelpers();
  const configured = normalizeSiteCapabilities({
    host_only_available: false,
    upstream_headers_available: false,
    max_playback_addresses: 100,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(configured)), {
    host_only_available: false,
    upstream_headers_available: false,
    max_playback_addresses: 100,
  });
  assert.equal(canAddPlaybackAddress(99, configured.max_playback_addresses), true);
  assert.equal(canAddPlaybackAddress(100, configured.max_playback_addresses), false);
  assert.equal(playbackAddressCount('', ['one.example']), 1);
  assert.equal(playbackAddressCount('https://playback.example', ['one.example']), 2);
  assert.equal(canAddPlaybackAddress(99, configured.max_playback_addresses, true), false);
  assert.equal(canAddPlaybackAddress(99, configured.max_playback_addresses, false), true);

  const fallback = normalizeSiteCapabilities({});
  assert.equal(fallback.host_only_available, true);
  assert.equal(fallback.upstream_headers_available, true);
  assert.equal(fallback.max_playback_addresses, 128);
});

test('site refresh reapplies the current search query after rebuilding cards', () => {
  const source = loadSitesSource();
  assert.match(source, /const searchQuery = document\.getElementById\('sites-search'\)\?\.value \|\| '';/);
  assert.match(source, /setupSiteSorting\(grid\);\s*filterSiteCards\(searchQuery\);/);
});

test('missing upstream header key disables edits but leaves deletion available', () => {
  const { renderUpstreamHeaderRows } = loadHelpers();
  const disabled = renderUpstreamHeaderRows([
    { name: 'X-Origin-Secret', configured: true },
  ], false);
  assert.equal((disabled.match(/ disabled/g) || []).length, 2, 'name and value inputs must be disabled');
  const removeButton = disabled.match(/<button[^>]*m-upstream-header-remove[^>]*>/)?.[0] || '';
  assert.ok(removeButton, 'configured row must retain a delete control');
  assert.ok(!removeButton.includes('disabled'), 'delete control must remain enabled');

  const enabled = renderUpstreamHeaderRows([
    { name: 'X-Origin-Secret', configured: true },
  ], true);
  assert.ok(!enabled.includes(' disabled'), 'configured key must keep inputs editable');
});
