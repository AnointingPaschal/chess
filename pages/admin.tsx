import React, { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenRouterModel {
  id: string
  name: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
}

interface Settings { apiKey: string; model: string }

type ConnStatus = 'idle' | 'ok' | 'err' | 'loading'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ritual-chess-admin'

function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) return { ...{ apiKey: '', model: '' }, ...JSON.parse(s) }
  } catch { /* ignore */ }
  return { apiKey: '', model: '' }
}

function saveSettings(s: Settings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

function providerKey(id: string): string {
  const l = id.toLowerCase()
  if (l.startsWith('anthropic')) return 'anthropic'
  if (l.startsWith('openai')) return 'openai'
  if (l.startsWith('google')) return 'google'
  if (l.startsWith('meta')) return 'meta'
  if (l.startsWith('mistralai') || l.startsWith('mistral')) return 'mistral'
  if (l.startsWith('cohere')) return 'cohere'
  if (l.startsWith('x-ai')) return 'xai'
  if (l.startsWith('deepseek')) return 'deepseek'
  if (l.startsWith('qwen')) return 'qwen'
  return 'other'
}

function providerLabel(id: string): string {
  const map: Record<string, string> = {
    anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google',
    meta: 'Meta', mistral: 'Mistral', cohere: 'Cohere',
    xai: 'xAI', deepseek: 'DeepSeek', qwen: 'Qwen', other: 'Other'
  }
  return map[providerKey(id)] ?? 'Other'
}

function fmtCtx(n?: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

function fmtPrice(pricing?: { prompt?: string }): string {
  if (!pricing?.prompt) return 'free'
  const p = parseFloat(pricing.prompt) * 1_000_000
  if (p === 0) return 'free'
  if (p < 0.01) return `$${p.toFixed(3)}/M`
  if (p < 1) return `$${p.toFixed(2)}/M`
  return `$${p.toFixed(1)}/M`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [apiKey, setApiKey]       = useState('')
  const [showKey, setShowKey]     = useState(false)
  const [models, setModels]       = useState<OpenRouterModel[]>([])
  const [activeModel, setActive]  = useState('')
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [conn, setConn]           = useState<ConnStatus>('idle')
  const [connMsg, setConnMsg]     = useState('Not tested')
  const [saved, setSaved]         = useState(false)
  const [toast, setToast]         = useState<string | null>(null)

  useEffect(() => {
    const s = loadSettings()
    setApiKey(s.apiKey)
    setActive(s.model)
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const loadModels = useCallback(async () => {
    if (!apiKey.trim()) { showToast('Enter your API key first'); return }
    setLoading(true)
    setConn('loading')
    setConnMsg('Connecting…')
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': 'https://chess.ritual',
          'X-Title': 'Chess on Ritual'
        }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list: OpenRouterModel[] = data.data ?? []
      setModels(list)
      setConn('ok')
      setConnMsg(`Connected · ${list.length} models`)
      showToast(`Loaded ${list.length} models`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setConn('err')
      setConnMsg(`Error: ${msg}`)
      showToast(`Failed: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [apiKey])

  async function testConnection() {
    if (!apiKey.trim()) { setConn('err'); setConnMsg('No API key'); return }
    setConn('loading'); setConnMsg('Testing…')
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
      })
      if (res.ok) {
        const d = await res.json()
        const label = d?.data?.label ? ` · ${d.data.label}` : ''
        setConn('ok'); setConnMsg(`Connected${label}`)
      } else {
        setConn('err'); setConnMsg(`Invalid key (${res.status})`)
      }
    } catch {
      setConn('err'); setConnMsg('Network error')
    }
  }

  function handleSave() {
    if (!apiKey.trim()) { showToast('API key is required'); return }
    if (!activeModel) { showToast('Select a model first'); return }
    saveSettings({ apiKey: apiKey.trim(), model: activeModel })
    setSaved(true)
    showToast('Settings saved!')
    setTimeout(() => setSaved(false), 2000)
  }

  const filtered = models
    .filter(m => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (a.id === activeModel) return -1
      if (b.id === activeModel) return 1
      return (a.name ?? a.id).localeCompare(b.name ?? b.id)
    })
    .slice(0, 150)

  const connColor = conn === 'ok' ? '#2d7a4f' : conn === 'err' ? '#b83232' : '#8a857e'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="admin-page">
        {/* ── Header ── */}
        <header className="admin-header">
          <div className="admin-header-left">
            <div className="logo-icon">♞</div>
            <div>
              <div className="logo-text">Chess on Ritual</div>
              <div className="logo-sub">Admin Panel</div>
            </div>
          </div>
          <a href="/" className="back-link">← Back to Game</a>
        </header>

        <div className="admin-body">
          <div className="admin-container">

            {/* ── API Key ── */}
            <section className="section">
              <h2 className="section-title">OpenRouter API Key</h2>
              <div className="apikey-row">
                <input
                  className="apikey-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setConn('idle'); setConnMsg('Not tested') }}
                  placeholder="sk-or-v1-…"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button className="icon-btn" onClick={() => setShowKey(v => !v)} title="Show/hide">
                  {showKey ? '🙈' : '👁'}
                </button>
                <button
                  className="btn btn-gold btn-sm"
                  onClick={loadModels}
                  disabled={loading}
                >
                  {loading ? '⏳ Loading…' : '⟳ Load Models'}
                </button>
              </div>
              <div className="apikey-hint">
                Get your key at{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
                  openrouter.ai/keys
                </a>{' '}
                — free tier available, 300+ models.
              </div>

              {/* Connection badge */}
              <div className="conn-row">
                <button className="btn btn-outline btn-sm" onClick={testConnection}>
                  Test Connection
                </button>
                <span className="conn-badge" style={{ color: connColor }}>
                  <span
                    className="conn-dot"
                    style={{ background: connColor }}
                  />
                  {connMsg}
                </span>
              </div>
            </section>

            {/* ── Model Browser ── */}
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Model Selection</h2>
                <span className="model-count">
                  {models.length > 0 ? `${models.length} models` : ''}
                </span>
              </div>

              <input
                className="search-input"
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="⌕  Search by model name or provider…"
              />

              <div className="model-list">
                {models.length === 0 ? (
                  <div className="model-empty">
                    <span className="model-empty-icon">⚙</span>
                    <span>Enter your API key and click <strong>Load Models</strong></span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="model-empty">
                    <span className="model-empty-icon">🔍</span>
                    <span>No models match "<em>{search}</em>"</span>
                  </div>
                ) : (
                  filtered.map(m => {
                    const pk = providerKey(m.id)
                    const pl = providerLabel(m.id)
                    const isActive = m.id === activeModel
                    const displayName = m.name ?? m.id.split('/')[1] ?? m.id
                    return (
                      <div
                        key={m.id}
                        className={`model-item${isActive ? ' is-active' : ''}`}
                        onClick={() => setActive(m.id)}
                      >
                        <div className="model-item-left">
                          <div className={`model-radio${isActive ? ' checked' : ''}`} />
                          <div className="model-info">
                            <div className="model-name">{displayName}</div>
                            <div className="model-id">{m.id}</div>
                          </div>
                        </div>
                        <div className="model-item-right">
                          <span className={`provider-badge pb-${pk}`}>{pl}</span>
                          <div className="model-stats">
                            <span className="mstat">{fmtCtx(m.context_length)}</span>
                            <span className="mstat">{fmtPrice(m.pricing)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            {/* ── Active Model ── */}
            <div className="active-bar">
              <span className="active-label">Active Model</span>
              <span className="active-value">
                {activeModel
                  ? activeModel
                  : <span style={{ color: 'var(--ink3)' }}>None selected</span>}
              </span>
            </div>

            {/* ── Save ── */}
            <div className="save-row">
              <button
                className={`btn btn-ink btn-save${saved ? ' saved' : ''}`}
                onClick={handleSave}
              >
                {saved ? '✓ Saved!' : '✓ Save Settings'}
              </button>
              <span className="save-hint">
                Settings are stored locally in your browser.
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="toast show">{toast}</div>}
    </>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #ffffff; --bg2: #f8f6f2; --bg3: #f0ece4;
  --border: #e2ddd6; --border2: #c8c0b4;
  --ink: #1a1610; --ink2: #4a4540; --ink3: #8a857e;
  --gold: #d4af37; --gold2: #aa8529; --gold-bg: #fdfaf0;
  --red: #b83232; --green: #2d7a4f;
  --shadow: 0 2px 8px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-height: 100vh;
  line-height: 1.5;
}

.admin-page { display: flex; flex-direction: column; min-height: 100vh; }

/* Header */
.admin-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px; height: 64px;
  background: linear-gradient(135deg, #1a1610 0%, #2a2010 100%);
  border-bottom: 1px solid var(--gold2);
  box-shadow: 0 2px 20px rgba(0,0,0,.3);
  position: sticky; top: 0; z-index: 100;
}
.admin-header-left { display: flex; align-items: center; gap: 14px; }
.logo-icon {
  width: 38px; height: 38px;
  background: rgba(212,175,55,.15);
  border: 1px solid rgba(212,175,55,.3);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: var(--gold); font-family: serif;
}
.logo-text {
  font-family: 'Playfair Display SC', serif;
  font-size: 17px; font-weight: 700; color: var(--gold); letter-spacing: .04em;
}
.logo-sub {
  font-size: 10px; color: rgba(212,175,55,.5);
  letter-spacing: .12em; text-transform: uppercase;
  font-family: 'DM Mono', monospace;
}
.back-link {
  font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
  color: rgba(212,175,55,.7); text-decoration: none;
  border: 1px solid rgba(212,175,55,.25);
  border-radius: 8px; padding: 6px 14px;
  transition: all .15s;
}
.back-link:hover { color: var(--gold); border-color: rgba(212,175,55,.5); background: rgba(212,175,55,.08); }

/* Body */
.admin-body { flex: 1; padding: 40px 20px 60px; background: var(--bg2); }
.admin-container { max-width: 720px; margin: 0 auto; }

/* Sections */
.section {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px 28px;
  margin-bottom: 20px;
  box-shadow: var(--shadow);
}
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.section-title {
  font-family: 'Playfair Display', serif;
  font-size: 17px; font-weight: 700; color: var(--ink);
  margin-bottom: 14px;
}
.section-header .section-title { margin-bottom: 0; }
.model-count { font-size: 11px; color: var(--ink3); font-family: 'DM Mono', monospace; }

/* API Key */
.apikey-row { display: flex; gap: 8px; align-items: center; }
.apikey-input {
  flex: 1; font-family: 'DM Mono', monospace; font-size: 13px;
  border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 14px; background: var(--bg2); color: var(--ink);
  outline: none; transition: all .15s; letter-spacing: .04em;
}
.apikey-input:focus { border-color: var(--gold2); background: var(--bg); box-shadow: 0 0 0 3px rgba(212,175,55,.1); }
.apikey-input::placeholder { color: var(--ink3); font-size: 12px; letter-spacing: .02em; }
.icon-btn {
  background: var(--bg2); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px; cursor: pointer; font-size: 14px; transition: all .15s;
}
.icon-btn:hover { background: var(--bg3); }
.apikey-hint { font-size: 11px; color: var(--ink3); margin-top: 8px; line-height: 1.6; }
.apikey-hint a { color: var(--gold2); text-decoration: none; }
.apikey-hint a:hover { text-decoration: underline; }

.conn-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.conn-badge {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; font-family: 'DM Sans', sans-serif;
  transition: color .3s;
}
.conn-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  transition: background .3s;
}

/* Buttons */
.btn {
  font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
  border-radius: 8px; padding: 9px 18px; cursor: pointer;
  transition: all .15s; letter-spacing: .02em; border: 1px solid var(--border);
}
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn-sm { font-size: 12px; padding: 8px 14px; }
.btn-ink { background: var(--ink); color: #fff; border-color: var(--ink); box-shadow: 0 2px 8px rgba(0,0,0,.2); }
.btn-ink:hover:not(:disabled) { background: #2e2922; }
.btn-outline { background: var(--bg); color: var(--ink); }
.btn-outline:hover:not(:disabled) { background: var(--bg2); border-color: var(--border2); }
.btn-gold { background: var(--gold-bg); color: var(--gold2); border-color: var(--gold); }
.btn-gold:hover:not(:disabled) { background: #faedc8; }
.btn-save { min-width: 160px; }
.btn-save.saved { background: var(--green); border-color: var(--green); color: #fff; }

/* Search */
.search-input {
  width: 100%; font-family: 'DM Sans', sans-serif; font-size: 13px;
  border: 1px solid var(--border); border-radius: 8px;
  padding: 9px 14px; background: var(--bg2); color: var(--ink);
  outline: none; transition: all .15s; margin-bottom: 10px;
}
.search-input:focus { border-color: var(--border2); background: var(--bg); }
.search-input::placeholder { color: var(--ink3); }

/* Model List */
.model-list {
  max-height: 360px; overflow-y: auto;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--bg2);
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.model-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 32px 16px; text-align: center;
  font-size: 13px; color: var(--ink3); line-height: 1.7;
}
.model-empty-icon { font-size: 32px; opacity: .4; }
.model-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 16px; cursor: pointer; border-bottom: 1px solid var(--border);
  transition: background .12s; gap: 12px;
}
.model-item:last-child { border-bottom: none; }
.model-item:hover { background: var(--bg3); }
.model-item.is-active { background: var(--gold-bg); }
.model-item-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.model-radio {
  width: 15px; height: 15px; border-radius: 50%;
  border: 2px solid var(--border2); flex-shrink: 0;
  transition: all .15s; position: relative;
}
.model-radio.checked {
  border-color: var(--gold2); background: var(--gold2);
  box-shadow: 0 0 0 3px rgba(212,175,55,.2);
}
.model-radio.checked::after {
  content: ''; position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 5px; height: 5px; border-radius: 50%; background: #fff;
}
.model-info { min-width: 0; }
.model-name { font-size: 13px; font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.model-id { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--ink3); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px; }
.model-item-right { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
.provider-badge {
  font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  border-radius: 4px; padding: 2px 7px; font-family: 'DM Sans', sans-serif; white-space: nowrap;
}
.pb-anthropic { background: rgba(212,175,55,.14); color: var(--gold2); border: 1px solid rgba(212,175,55,.28); }
.pb-openai    { background: rgba(16,163,127,.1);  color: #0a6b52;      border: 1px solid rgba(16,163,127,.28); }
.pb-google    { background: rgba(66,133,244,.1);  color: #1a56db;      border: 1px solid rgba(66,133,244,.28); }
.pb-meta      { background: rgba(24,119,242,.1);  color: #1560bd;      border: 1px solid rgba(24,119,242,.28); }
.pb-mistral   { background: rgba(255,111,0,.1);   color: #c25a00;      border: 1px solid rgba(255,111,0,.28); }
.pb-cohere    { background: rgba(57,181,74,.1);   color: #1a7a2a;      border: 1px solid rgba(57,181,74,.28); }
.pb-xai       { background: rgba(0,0,0,.06);      color: var(--ink2);  border: 1px solid var(--border); }
.pb-deepseek  { background: rgba(0,80,180,.1);    color: #004db3;      border: 1px solid rgba(0,80,180,.28); }
.pb-qwen      { background: rgba(130,0,255,.08);  color: #6600cc;      border: 1px solid rgba(130,0,255,.2); }
.pb-other     { background: var(--bg3); color: var(--ink3); border: 1px solid var(--border); }
.model-stats { display: flex; gap: 4px; }
.mstat {
  font-size: 9px; color: var(--ink3); background: var(--bg);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 2px 6px; font-family: 'DM Mono', monospace;
}
.model-item.is-active .mstat { background: var(--gold-bg); }

/* Active Bar */
.active-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--gold-bg); border: 1px solid rgba(212,175,55,.4);
  border-radius: 10px; padding: 12px 18px; margin-bottom: 20px;
}
.active-label {
  font-family: 'DM Sans', sans-serif; font-size: 10px; font-weight: 700;
  letter-spacing: .12em; text-transform: uppercase; color: var(--gold2);
}
.active-value {
  font-family: 'DM Mono', monospace; font-size: 13px;
  color: var(--ink); font-weight: 500;
  max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Save Row */
.save-row { display: flex; align-items: center; gap: 16px; }
.save-hint { font-size: 11px; color: var(--ink3); }

/* Toast */
.toast {
  position: fixed; bottom: 28px; left: 50%;
  transform: translateX(-50%) translateY(60px);
  background: var(--ink); color: var(--gold);
  border: 1px solid var(--gold2); border-radius: 10px;
  padding: 12px 24px; font-size: 13px; font-weight: 600;
  z-index: 999; white-space: nowrap;
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  transition: transform .3s cubic-bezier(.34,1.56,.64,1);
}
.toast.show { transform: translateX(-50%) translateY(0); }

@media (max-width: 640px) {
  .admin-header { padding: 0 20px; }
  .admin-body { padding: 24px 12px 40px; }
  .section { padding: 18px 16px; }
  .apikey-row { flex-wrap: wrap; }
  .model-name { max-width: 180px; }
  .model-id { max-width: 180px; }
}
`
