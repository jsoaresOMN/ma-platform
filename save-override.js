/* M&A Platform — Admin override save/load
   Injected into every analysis page via <script src="../save-override.js">
   - Admins see "Gravar atualização" button (float bottom-right)
   - On save: inputs → overrides/{id}.json + ev_base → manifest.json
   - On load: overrides applied for all users before first render
*/
(function () {
  const SEG      = location.pathname.split('/').filter(Boolean)
  const ANID     = SEG[SEG.length - 2] || 'unknown'
  const GH_REPO  = 'jsoaresOMN/ma-platform'
  const OVR_PATH = `overrides/${ANID}.json`
  const OVR_URL  = `https://jsoaresomn.github.io/ma-platform/${OVR_PATH}`

  const INPUT_IDS = [
    'sRevM','sEbM','sBearD','sBullP','sWR','sWE','sRD',
    'wacc','grt','fcfc',
    'gr0','gr1','gr2','gr3','gr4',
    'mg0','mg1','mg2','mg3','mg4',
    'wRf','wCRP','wERP','wBU','wTx','wDE','wKd',
    'lEM','lXM','lHY'
  ]

  // ── Load overrides on page load ─────────────────────────────
  async function loadOverrides() {
    try {
      const r = await fetch(OVR_URL + '?t=' + Date.now())
      if (!r.ok) return
      const data = await r.json()
      if (!data.inputs) return
      for (const [id, val] of Object.entries(data.inputs)) {
        const el = document.getElementById(id)
        if (el) el.value = val
      }
      ;['uSum','uDcf','uWacc','uLbo'].forEach(fn => {
        if (typeof window[fn] === 'function') window[fn]()
      })
      if (data.saved_at) showBadge('Premissas de ' + data.saved_at)
    } catch (e) { /* no overrides yet */ }
  }

  // ── Calculate weighted EV Base from live inputs ─────────────
  function getCurrentEvBase() {
    try {
      const BR_ = typeof BR !== 'undefined' ? BR : null
      const BE_ = typeof BE !== 'undefined' ? BE : null
      if (!BR_ || !BE_) return null

      const revM = parseInt(document.getElementById('sRevM').value) / 10
      const ebM  = parseInt(document.getElementById('sEbM').value)
      const wR   = parseInt(document.getElementById('sWR').value)  / 100
      const wE   = parseInt(document.getElementById('sWE').value)  / 100
      const wD   = Math.max(0, 1 - wR - wE)
      const wacc = parseInt(document.getElementById('wacc').value) / 100
      const gT   = parseInt(document.getElementById('grt').value)  / 100
      const fc   = parseInt(document.getElementById('fcfc').value) / 100
      const g    = [0,1,2,3,4].map(i => parseInt(document.getElementById('gr'+i).value) / 100)
      const m    = [0,1,2,3,4].map(i => parseInt(document.getElementById('mg'+i).value) / 100)

      let rev = BR_, pvSum = 0, lastFcf = 0
      for (let i = 0; i < 5; i++) {
        rev *= (1 + g[i])
        const fcf = rev * m[i] * fc
        pvSum += fcf / Math.pow(1 + wacc, i + 1)
        lastFcf = fcf
      }
      const dcfEv = pvSum + (lastFcf * (1 + gT) / (wacc - gT)) / Math.pow(1 + wacc, 5)
      const cBase = wR * BR_ * revM + wE * BE_ * ebM + wD * dcfEv
      return Math.round(cBase)
    } catch (e) { return null }
  }

  // ── GitHub API: PUT a file ──────────────────────────────────
  async function ghPut(path, obj, token) {
    const infoRes = await fetch(
      `https://api.github.com/repos/${GH_REPO}/contents/${path}`,
      { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' } }
    )
    const sha     = infoRes.ok ? (await infoRes.json()).sha : undefined
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))))
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `chore: update ${path}`, content, ...(sha && { sha }) })
      }
    )
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || res.status) }
  }

  // ── Save overrides + update manifest.json ev_base ──────────
  async function saveOverrides() {
    const token = localStorage.getItem('ma_gh_token')
    if (!token) {
      alert('Token GitHub não configurado.\nVai ao painel Admin → secção 🔑 GitHub Token.')
      return
    }

    const btn = document.getElementById('ma-save-btn')
    btn.textContent = '⏳ A guardar...'
    btn.disabled = true

    const inputs = {}
    INPUT_IDS.forEach(id => { const el = document.getElementById(id); if (el) inputs[id] = el.value })

    const today  = new Date().toISOString().slice(0, 10)
    const evBase = getCurrentEvBase()

    try {
      // 1. Save overrides file
      await ghPut(OVR_PATH, { version: 1, analysis_id: ANID, saved_at: today, inputs }, token)

      // 2. Update ev_base in manifest.json
      if (evBase !== null) {
        const mRes = await fetch(
          `https://api.github.com/repos/${GH_REPO}/contents/manifest.json`,
          { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' } }
        )
        if (mRes.ok) {
          const mFile    = await mRes.json()
          const manifest = JSON.parse(decodeURIComponent(escape(atob(mFile.content.replace(/\n/g, '')))))
          const idx      = manifest.analyses.findIndex(a => a.id === ANID)
          if (idx >= 0) {
            manifest.analyses[idx].ev_base = evBase
            const mContent = btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2))))
            await fetch(`https://api.github.com/repos/${GH_REPO}/contents/manifest.json`, {
              method: 'PUT',
              headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: `chore: update ev_base for ${ANID}`, content: mContent, sha: mFile.sha })
            })
          }
        }
      }

      btn.innerHTML = '&#10003; Guardado'
      btn.style.background = '#10b981'
      const evLabel = evBase ? ' · EV ' + (evBase >= 1000 ? (evBase/1000).toFixed(1)+'M' : evBase+'k') : ''
      showBadge('Guardado a ' + today + evLabel)
      setTimeout(() => {
        btn.innerHTML = '&#128190; Gravar atualização'
        btn.style.background = '#2563eb'
        btn.disabled = false
      }, 2500)
    } catch (e) {
      alert('Erro ao guardar: ' + e.message)
      if (e.message.includes('Bad credentials') || e.message.includes('401')) localStorage.removeItem('ma_gh_token')
      btn.innerHTML = '&#128190; Gravar atualização'
      btn.style.background = '#2563eb'
      btn.disabled = false
    }
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

  // ── Badge ───────────────────────────────────────────────────
  function showBadge(text) {
    let b = document.getElementById('ma-ovr-badge')
    if (!b) {
      b = document.createElement('div')
      b.id = 'ma-ovr-badge'
      b.style.cssText = [
        'position:fixed','bottom:62px','right:20px',
        'background:rgba(16,185,129,0.12)','color:#10b981',
        'border:1px solid rgba(16,185,129,0.25)','border-radius:6px',
        'padding:4px 10px','font-size:11px','z-index:9998','pointer-events:none'
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
