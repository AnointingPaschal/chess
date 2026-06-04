import React, { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Model { name: string; id: string }

const MODELS_KEY = 'ritual-models'
const ACTIVE_KEY = 'ritual-active-model'

function loadModels(): Model[] {
  try {
    const s = localStorage.getItem(MODELS_KEY)
    if (s) return JSON.parse(s) as Model[]
  } catch { /* ignore */ }
  return []
}

function saveModels(models: Model[]) {
  try { localStorage.setItem(MODELS_KEY, JSON.stringify(models)) } catch { /* ignore */ }
}

function loadActive(): string {
  try { return localStorage.getItem(ACTIVE_KEY) ?? '' } catch { return '' }
}

function saveActive(id: string) {
  try { localStorage.setItem(ACTIVE_KEY, id) } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed,     setAuthed]     = useState(false)
  const [password,   setPassword]   = useState('')
  const [pwError,    setPwError]    = useState('')
  const [pwLoading,  setPwLoading]  = useState(false)
  const [showPw,     setShowPw]     = useState(false)

  const [models,     setModels]     = useState<Model[]>([])
  const [activeId,   setActiveId]   = useState('')
  const [newName,    setNewName]    = useState('')
  const [newId,      setNewId]      = useState('')
  const [addError,   setAddError]   = useState('')
  const [saved,      setSaved]      = useState(false)
  const [toast,      setToast]      = useState<string | null>(null)

  // Check if already authed this session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ok = sessionStorage.getItem('admin-ok')
      if (ok === 'true') {
        setAuthed(true)
        setModels(loadModels())
        setActiveId(loadActive())
      }
    }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Auth ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!password.trim()) return
    setPwLoading(true); setPwError('')
    try {
      const res  = await fetch('/api/auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        sessionStorage.setItem('admin-ok', 'true')
        setAuthed(true)
        setModels(loadModels())
        setActiveId(loadActive())
      } else {
        setPwError(data.error ?? 'Incorrect password')
      }
    } catch {
      setPwError('Network error — try again')
    } finally {
      setPwLoading(false)
    }
  }

  // ── Models ──
  function addModel() {
    const name = newName.trim()
    const id   = newId.trim()
    if (!name || !id) { setAddError('Both fields are required'); return }
    if (models.some(m => m.id === id)) { setAddError('Model ID already exists'); return }
    setAddError('')
    const updated = [...models, { name, id }]
    setModels(updated); saveModels(updated)
    setNewName(''); setNewId('')
    showToast(`"${name}" added`)
  }

  function removeModel(id: string) {
    const updated = models.filter(m => m.id !== id)
    setModels(updated); saveModels(updated)
    if (activeId === id) { setActiveId(''); saveActive('') }
    showToast('Model removed')
  }

  function selectActive(id: string) {
    setActiveId(id); saveActive(id)
  }

  function handleSave() {
    saveModels(models); saveActive(activeId)
    setSaved(true); showToast('Settings saved')
    setTimeout(() => setSaved(false), 2000)
  }

  function handleLogout() {
    sessionStorage.removeItem('admin-ok')
    setAuthed(false); setPassword('')
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="login-page">
          <form className="login-box" onSubmit={handleLogin}>
            <div className="login-icon">♞</div>
            <div className="login-title">Access Required</div>
            <div className="input-group">
              <input
                className={`pw-input${pwError ? ' error' : ''}`}
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setPwError('') }}
                placeholder="Enter password"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            {pwError && <div className="pw-error">{pwError}</div>}
            <button
              className="btn btn-ink login-btn"
              type="submit"
              disabled={pwLoading}
            >
              {pwLoading ? 'Checking…' : 'Continue →'}
            </button>
          </form>
        </div>
      </>
    )
  }

  // ── Admin panel ───────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="admin-page">

        {/* Header */}
        <header className="admin-header">
          <div className="admin-header-left">
            <div className="logo-icon">♞</div>
            <div>
              <div className="logo-text">Chess on Ritual</div>
              <div className="logo-sub">Configuration Panel</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href="/" className="back-link">← Game</a>
            <button className="logout-btn" onClick={handleLogout}>Log out</button>
          </div>
        </header>

        <div className="admin-body">
          <div className="admin-container">

            {/* ── Active Model ── */}
            <div className="active-bar">
              <div className="active-left">
                <div className="active-label">Active AI Model</div>
                <div className="active-value">
                  {activeId
                    ? (models.find(m => m.id === activeId)?.name ?? activeId)
                    : <span style={{ color: 'var(--ink3)' }}>None selected</span>}
                </div>
              </div>
              {activeId && (
                <div className="active-id">{activeId}</div>
              )}
            </div>

            {/* ── Model List ── */}
            <section className="section">
              <div className="section-hdr">
                <h2 className="section-title">Models</h2>
                <span className="model-count">{models.length} configured</span>
              </div>

              {models.length === 0 ? (
                <div className="model-empty">
                  <span className="me-icon">⚙</span>
                  No models added yet. Add one below.
                </div>
              ) : (
                <div className="model-list">
                  {models.map(m => (
                    <div key={m.id} className={`model-item${activeId === m.id ? ' is-active' : ''}`}>
                      <div className="model-item-l">
                        <div
                          className={`model-radio${activeId === m.id ? ' checked' : ''}`}
                          onClick={() => selectActive(m.id)}
                        />
                        <div className="model-info">
                          <div className="model-name">{m.name}</div>
                          <div className="model-id">{m.id}</div>
                        </div>
                      </div>
                      <div className="model-item-r">
                        {activeId !== m.id && (
                          <button
                            className="btn-set-active"
                            onClick={() => selectActive(m.id)}
                          >
                            Set active
                          </button>
                        )}
                        {activeId === m.id && (
                          <span className="active-tag">Active</span>
                        )}
                        <button
                          className="btn-remove"
                          onClick={() => removeModel(m.id)}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add model form */}
              <div className="add-form">
                <div className="add-form-title">Add Model</div>
                <div className="add-fields">
                  <input
                    className="add-input"
                    type="text"
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setAddError('') }}
                    placeholder="Display name  e.g. Standard"
                    onKeyDown={e => e.key === 'Enter' && addModel()}
                  />
                  <input
                    className="add-input mono"
                    type="text"
                    value={newId}
                    onChange={e => { setNewId(e.target.value); setAddError('') }}
                    placeholder="Model ID  e.g. anthropic/claude-sonnet-4-5"
                    onKeyDown={e => e.key === 'Enter' && addModel()}
                  />
                  <button className="btn btn-gold btn-add" onClick={addModel}>+ Add</button>
                </div>
                {addError && <div className="add-error">{addError}</div>}
                <div className="add-hint">
                  Use any model ID supported by your provider.
                </div>
              </div>
            </section>

            {/* ── Save ── */}
            <div className="save-row">
              <button
                className={`btn btn-ink btn-save${saved ? ' saved' : ''}`}
                onClick={handleSave}
              >
                {saved ? '✓ Saved' : '✓ Save Settings'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Playfair+Display+SC:wght@400;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

:root {
  --bg:#ffffff;--bg2:#f8f6f2;--bg3:#f0ece4;
  --border:#e2ddd6;--border2:#c8c0b4;
  --ink:#1a1610;--ink2:#4a4540;--ink3:#8a857e;
  --gold:#d4af37;--gold2:#aa8529;--gold-bg:#fdfaf0;
  --red:#b83232;--green:#2d7a4f;
  --shadow:0 2px 8px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;line-height:1.5}

/* Login */
.login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg2)}
.login-box{background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:44px 48px;text-align:center;width:360px;max-width:92vw;box-shadow:var(--shadow),0 16px 48px rgba(0,0,0,.08);display:flex;flex-direction:column;align-items:center;gap:18px}
.login-icon{font-size:40px;width:64px;height:64px;background:var(--ink);border-radius:14px;display:flex;align-items:center;justify-content:center;color:var(--gold)}
.login-title{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--ink)}
.input-group{position:relative;width:100%}
.pw-input{width:100%;font-family:'DM Mono',monospace;font-size:14px;border:1px solid var(--border);border-radius:9px;padding:11px 44px 11px 14px;background:var(--bg2);color:var(--ink);outline:none;transition:all .15s;letter-spacing:.08em}
.pw-input:focus{border-color:var(--gold2);background:var(--bg);box-shadow:0 0 0 3px rgba(212,175,55,.1)}
.pw-input.error{border-color:var(--red)}
.pw-input::placeholder{font-family:'DM Sans',sans-serif;letter-spacing:0;color:var(--ink3);font-size:13px}
.pw-toggle{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:14px;color:var(--ink3);padding:4px;transition:color .15s}
.pw-toggle:hover{color:var(--ink)}
.pw-error{font-size:12px;color:var(--red);text-align:left;width:100%;margin-top:-8px}
.login-btn{width:100%;padding:11px;font-size:14px}

/* Header */
.admin-page{display:flex;flex-direction:column;min-height:100vh}
.admin-header{display:flex;align-items:center;justify-content:space-between;padding:0 40px;height:64px;background:linear-gradient(135deg,#1a1610,#2a2010);border-bottom:1px solid var(--gold2);box-shadow:0 2px 20px rgba(0,0,0,.3);position:sticky;top:0;z-index:100}
.admin-header-left{display:flex;align-items:center;gap:14px}
.logo-icon{width:38px;height:38px;background:rgba(212,175,55,.15);border:1px solid rgba(212,175,55,.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--gold)}
.logo-text{font-family:'Playfair Display SC',serif;font-size:17px;font-weight:700;color:var(--gold);letter-spacing:.04em}
.logo-sub{font-size:10px;color:rgba(212,175,55,.45);letter-spacing:.12em;text-transform:uppercase;font-family:'DM Mono',monospace}
.back-link{font-size:13px;font-weight:500;color:rgba(212,175,55,.7);text-decoration:none;border:1px solid rgba(212,175,55,.25);border-radius:8px;padding:6px 14px;transition:all .15s}
.back-link:hover{color:var(--gold);border-color:rgba(212,175,55,.5)}
.logout-btn{font-size:12px;font-weight:500;color:var(--ink3);background:none;border:1px solid var(--border);border-radius:8px;padding:6px 12px;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
.logout-btn:hover{background:rgba(255,255,255,.08);color:rgba(212,175,55,.7);border-color:rgba(212,175,55,.25)}

/* Body */
.admin-body{flex:1;padding:40px 20px 60px;background:var(--bg2)}
.admin-container{max-width:680px;margin:0 auto}

/* Active bar */
.active-bar{display:flex;align-items:center;justify-content:space-between;background:var(--gold-bg);border:1px solid rgba(212,175,55,.4);border-radius:12px;padding:14px 20px;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.active-left{display:flex;flex-direction:column;gap:3px}
.active-label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold2)}
.active-value{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--ink)}
.active-id{font-family:'DM Mono',monospace;font-size:11px;color:var(--ink3);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Section */
.section{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:24px 24px 20px;margin-bottom:16px;box-shadow:var(--shadow)}
.section-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-title{font-family:'Playfair Display',serif;font-size:17px;font-weight:700;color:var(--ink)}
.model-count{font-size:11px;color:var(--ink3);font-family:'DM Mono',monospace}

/* Model list */
.model-list{border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:20px}
.model-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px;text-align:center;font-size:13px;color:var(--ink3);background:var(--bg2);border:1px solid var(--border);border-radius:10px;margin-bottom:20px}
.me-icon{font-size:28px;opacity:.4}
.model-item{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);transition:background .12s;gap:12px}
.model-item:last-child{border-bottom:none}
.model-item:hover{background:var(--bg2)}
.model-item.is-active{background:var(--gold-bg)}
.model-item-l{display:flex;align-items:center;gap:12px;min-width:0}
.model-radio{width:16px;height:16px;border-radius:50%;border:2px solid var(--border2);flex-shrink:0;cursor:pointer;transition:all .15s;position:relative}
.model-radio.checked{border-color:var(--gold2);background:var(--gold2);box-shadow:0 0 0 3px rgba(212,175,55,.2)}
.model-radio.checked::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:5px;height:5px;border-radius:50%;background:#fff}
.model-info{min-width:0}
.model-name{font-size:14px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.model-id{font-family:'DM Mono',monospace;font-size:10px;color:var(--ink3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.model-item-r{display:flex;align-items:center;gap:8px;flex-shrink:0}
.btn-set-active{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;background:var(--bg3);color:var(--ink2);border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-set-active:hover{background:var(--gold-bg);color:var(--gold2);border-color:var(--gold)}
.active-tag{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold2);background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.25);border-radius:5px;padding:3px 8px;white-space:nowrap}
.btn-remove{background:none;border:none;color:var(--ink3);cursor:pointer;font-size:14px;padding:4px 6px;border-radius:5px;transition:all .15s;line-height:1}
.btn-remove:hover{background:#fff5f5;color:var(--red)}

/* Add form */
.add-form{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px}
.add-form-title{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);margin-bottom:10px}
.add-fields{display:flex;gap:8px;align-items:flex-start}
.add-input{flex:1;font-family:'DM Sans',sans-serif;font-size:13px;border:1px solid var(--border);border-radius:8px;padding:9px 12px;background:var(--bg);color:var(--ink);outline:none;transition:all .15s}
.add-input:focus{border-color:var(--gold2);box-shadow:0 0 0 3px rgba(212,175,55,.1)}
.add-input.mono{font-family:'DM Mono',monospace;font-size:12px}
.add-input::placeholder{color:var(--ink3);font-size:12px}
.add-error{font-size:11px;color:var(--red);margin-top:6px}
.add-hint{font-size:11px;color:var(--ink3);margin-top:8px;line-height:1.5}
.btn-add{white-space:nowrap;flex-shrink:0}

/* Buttons */
.btn{font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;border-radius:8px;padding:9px 18px;cursor:pointer;transition:all .15s;border:1px solid var(--border);text-align:center}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-ink{background:var(--ink);color:#fff;border-color:var(--ink)}
.btn-ink:hover:not(:disabled){background:#2e2922}
.btn-gold{background:var(--gold-bg);color:var(--gold2);border-color:var(--gold)}
.btn-gold:hover:not(:disabled){background:#faedc8}
.btn-save{min-width:160px}
.btn-save.saved{background:var(--green);border-color:var(--green);color:#fff}

/* Save row */
.save-row{display:flex;justify-content:flex-end}

/* Toast */
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--gold);border:1px solid var(--gold2);border-radius:10px;padding:12px 24px;font-size:13px;font-weight:600;z-index:999;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.3);animation:slideUp .3s cubic-bezier(.34,1.56,.64,1)}
@keyframes slideUp{from{transform:translateX(-50%) translateY(40px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}

@media(max-width:600px){
  .admin-header{padding:0 20px}
  .admin-body{padding:20px 12px 40px}
  .section{padding:18px 14px}
  .add-fields{flex-direction:column}
  .login-box{padding:32px 24px}
  .active-bar{flex-direction:column;align-items:flex-start}
}
`
