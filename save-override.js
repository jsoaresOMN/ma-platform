/* M&A Platform — Admin override save/load
   Injected into every analysis page via <script src="../save-override.js">
   - Admins see a "Gravar atualização" button (float bottom-right)
   - On save: all slider/input values → overrides/{id}.json on GitHub
   - On load: overrides applied for all users before first render
*/
(function () {
  const SEG      = location.pathname.split('/').filter(Boolean)
  const ANID     = SEG[SEG.length - 2] || 'unknown'
  const GH_REPO  = 'jsoaresOMN/ma-platform'
  const OVR_PATH = `overrides/${ANID}.json`
  const OVR_URL  = `https://jsoaresomn.github.io/ma-platform/${OVR_PATH}`

  // All saveable input IDs (range + number sliders across all tabs)
  const INPUT_IDS = [
    // Summary
    'sRevM','sEbM','sBearD','sBullP','sWR','sWE','sRD',
    // DCF
    'wacc','grt','fcfc',
    'gr0','gr1','gr2','gr3','gr4',
    'mg0','mg1','mg2','mg3','mg4',
    // WACC
    'wRf','wCRP','wERP','wBU','wTx','wDE','wKd',
    // LBO
    'lEM','lXM','lHY'
  ]

  // ── Load overrides ──────────────────────────────────────────
  async function loadOverrides() {
    try {
      const r = await fetch(OVR_URL + '?t=' + Date.now())
      if (!r.ok) return
      const data = await r.json()
      if (!data.inputs) return
      // Apply values silently
      for (const [id, val] of Object.entries(data.inputs)) {
        const el = document.getElementById(id)
        if (el) el.value = val
      }
      // Trigger all recalculations once
      ;['uSum','uDcf','uWacc','uLbo'].forEach(fn => {
        if (typeof window[fn] === 'function') window[fn]()
      })
      if (data.saved_at) showBadge('Premissas de ' + data.saved_at)
    } catch (e) { /* no overrides yet — use defaults */ }
  }

  // ── Admin save button ───────────────────────────────────────
  function addSaveButton() {
    const btn = document.createElement('button')
    btn.id = 'ma-save-btn'
    btn.innerHTML = '&#128190; Gravar atualização'
    btn.style.cssText = [
      'position:fixed','bottom:20px','right:20px',
      'background:#2563eb','color:#fff','border:none',
      'border-radius:10px','padding:10px 20px',
      'font-size:13px','font-weight:600','cursor:pointer',
      'box-shadow:0 4px 20px rgba(37,99,235,0.45)',
      'z-index:9999','transition:opacity 0.15s,background 0.2s'
    ].join(';')
    btn.onmouseenter = () => btn.style.opacity = '0.88'
    btn.onmouseleave = () => btn.style.opacity = '1'
    btn.onclick = saveOverrides
    document.body.appendChild(btn)
  }

  // ── Save overrides via GitHub API ───────────────────────────
  async function saveOverrides() {
    let token = localStorage.getItem('ma_gh_token')
    if (!token) {
      token = prompt('GitHub Personal Access Token (scope: repo):')
      if (!token) return
      localStorage.setItem('ma_gh_token', token)
    }

    const btn = document.getElementById('ma-save-btn')
    btn.textContent = '⏳ A guardar...'
    btn.disabled = true

    const inputs = {}
    INPUT_IDS.forEach(id => {
      const el = document.getElementById(id)
      if (el) inputs[id] = el.value
    })

    const today   = new Date().toISOString().slice(0, 10)
    const payload = { version: 1, analysis_id: ANID, saved_at: today, inputs }
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))))

    try {
      // Get SHA of existing file (needed for update)
      const info = await fetch(
        `https://api.github.com/repos/${GH_REPO}/contents/${OVR_PATH}`,
        { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' } }
      )
      const sha = info.ok ? (await info.json()).sha : undefined

      const res = await fetch(
        `https://api.github.com/repos/${GH_REPO}/contents/${OVR_PATH}`,
        {
          method: 'PUT',
          headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `chore: update overrides ${ANID}`, content, ...(sha && { sha }) })
        }
      )
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || res.status) }

      btn.innerHTML = '&#10003; Guardado'
      btn.style.background = '#10b981'
      setTimeout(() => {
        btn.innerHTML = '&#128190; Gravar atualização'
        btn.style.background = '#2563eb'
        btn.disabled = false
      }, 2500)
      showBadge('Guardado a ' + today)
    } catch (e) {
      alert('Erro ao guardar: ' + e.message)
      if (e.message.includes('Bad credentials') || e.message.includes('401')) localStorage.removeItem('ma_gh_token')
      btn.innerHTML = '&#128190; Gravar atualização'
      btn.style.background = '#2563eb'
      btn.disabled = false
    }
  }

  // ── Small badge "saved on date" ─────────────────────────────
  function showBadge(text) {
    let b = document.getElementById('ma-ovr-badge')
    if (!b) {
      b = document.createElement('div')
      b.id = 'ma-ovr-badge'
      b.style.cssText = [
        'position:fixed','bottom:62px','right:20px',
        'background:rgba(16,185,129,0.12)','color:#10b981',
        'border:1px solid rgba(16,185,129,0.25)','border-radius:6px',
        'padding:4px 10px','font-size:11px','z-index:9998',
        'pointer-events:none'
      ].join(';')
      document.body.appendChild(b)
    }
    b.textContent = text
  }

  // ── Init ────────────────────────────────────────────────────
  window.addEventListener('load', () => {
    loadOverrides()
    if (localStorage.getItem('ma_is_admin') === '1') addSaveButton()
  })
})()
