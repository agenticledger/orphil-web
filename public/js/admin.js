// ─── Orphil Admin Panel ──────────────────────────────────────────────
(function () {
  const API = '/api';
  let adminKey = null;
  let providers = [];

  const $loginScreen = document.getElementById('loginScreen');
  const $dashboard = document.getElementById('dashboardScreen');
  const $password = document.getElementById('adminPassword');
  const $loginError = document.getElementById('loginError');
  const $btnLogin = document.getElementById('btnLogin');

  // ─── Auth ──────────────────────────────────────────────────────────
  function headers() {
    return {
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    };
  }

  async function login() {
    const pw = $password.value.trim();
    if (!pw) return;

    $btnLogin.disabled = true;
    $loginError.style.display = 'none';

    try {
      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const json = await res.json();

      if (json.ok) {
        adminKey = json.data.token;
        sessionStorage.setItem('orphil_admin_key', adminKey);
        showDashboard();
      } else {
        $loginError.textContent = json.error || 'Invalid password';
        $loginError.style.display = 'block';
      }
    } catch {
      $loginError.textContent = 'Connection error';
      $loginError.style.display = 'block';
    }

    $btnLogin.disabled = false;
  }

  function showDashboard() {
    $loginScreen.style.display = 'none';
    $dashboard.style.display = 'block';
    loadAgents();
    loadKbAgents();
    loadLlmConfig();
    loadSettings();
  }

  // Check saved session
  const savedKey = sessionStorage.getItem('orphil_admin_key');
  if (savedKey) {
    adminKey = savedKey;
    showDashboard();
  }

  $btnLogin.addEventListener('click', login);
  $password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
  });

  // ─── Tabs ──────────────────────────────────────────────────────────
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ─── Agents ────────────────────────────────────────────────────────
  const $agentList = document.getElementById('agentList');
  const $agentModal = document.getElementById('agentModal');

  async function loadAgents() {
    try {
      const res = await fetch(`${API}/agents`, { headers: headers() });
      const json = await res.json();

      if (!json.ok || json.data.length === 0) {
        $agentList.innerHTML = '<p class="empty-state">No agents yet. Create one to get started.</p>';
        return;
      }

      $agentList.innerHTML = json.data.map(a => `
        <div class="agent-card">
          <div class="agent-card-info">
            <h4>${escapeHtml(a.name)}</h4>
            <p>${escapeHtml(a.description)} &middot; ${a.kbDocumentCount || 0} docs</p>
          </div>
          <div class="agent-card-actions">
            <button class="btn-sm" onclick="window._adminEditAgent('${a.id}')">Edit</button>
            <button class="btn-sm danger" onclick="window._adminDeleteAgent('${a.id}', '${escapeHtml(a.name)}')">Delete</button>
          </div>
        </div>
      `).join('');
    } catch {
      $agentList.innerHTML = '<p class="empty-state">Failed to load agents</p>';
    }
  }

  function populateAgentModelSelect(currentValue) {
    const $sel = document.getElementById('agentModelInput');
    $sel.innerHTML = '<option value="">Use platform default</option>';
    providers.forEach(p => {
      const grp = document.createElement('optgroup');
      grp.label = p.name;
      p.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        grp.appendChild(opt);
      });
      $sel.appendChild(grp);
    });
    if (currentValue) $sel.value = currentValue;
  }

  document.getElementById('btnCreateAgent').addEventListener('click', () => {
    document.getElementById('agentModalTitle').textContent = 'Create Agent';
    document.getElementById('agentEditId').value = '';
    document.getElementById('agentNameInput').value = '';
    document.getElementById('agentDescInput').value = '';
    document.getElementById('agentInstructionsInput').value = '';
    populateAgentModelSelect('');
    $agentModal.classList.remove('hidden');
  });

  document.getElementById('btnCancelAgent').addEventListener('click', () => {
    $agentModal.classList.add('hidden');
  });

  document.getElementById('btnSaveAgent').addEventListener('click', async () => {
    const editId = document.getElementById('agentEditId').value;
    const payload = {
      name: document.getElementById('agentNameInput').value.trim(),
      description: document.getElementById('agentDescInput').value.trim(),
      instructions: document.getElementById('agentInstructionsInput').value.trim(),
      defaultModel: document.getElementById('agentModelInput').value.trim() || null,
    };

    if (!payload.name || !payload.description || !payload.instructions) {
      toast('Name, description, and instructions are required', 'error');
      return;
    }

    try {
      const url = editId ? `${API}/agents/${editId}` : `${API}/agents`;
      const method = editId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.ok) {
        $agentModal.classList.add('hidden');
        toast(editId ? 'Agent updated' : 'Agent created', 'success');
        loadAgents();
      } else {
        toast(json.error || 'Failed to save', 'error');
      }
    } catch {
      toast('Connection error', 'error');
    }
  });

  window._adminEditAgent = async function (id) {
    try {
      const res = await fetch(`${API}/agents/${id}`, { headers: headers() });
      const json = await res.json();
      if (!json.ok) return;

      const a = json.data;
      document.getElementById('agentModalTitle').textContent = 'Edit Agent';
      document.getElementById('agentEditId').value = id;
      document.getElementById('agentNameInput').value = a.name;
      document.getElementById('agentDescInput').value = a.description;
      document.getElementById('agentInstructionsInput').value = a.instructions;
      populateAgentModelSelect(a.defaultModel || '');
      $agentModal.classList.remove('hidden');
    } catch {
      toast('Failed to load agent', 'error');
    }
  };

  window._adminDeleteAgent = async function (id, name) {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${API}/agents/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const json = await res.json();
      if (json.ok) {
        toast('Agent deleted', 'success');
        loadAgents();
      } else {
        toast(json.error || 'Failed to delete', 'error');
      }
    } catch {
      toast('Connection error', 'error');
    }
  };

  // ─── LLM Config ───────────────────────────────────────────────────
  const $llmProvider = document.getElementById('llmProvider');
  const $llmModel = document.getElementById('llmModel');

  async function loadLlmConfig() {
    try {
      // Load providers list
      const provRes = await fetch(`${API}/llm-config/providers`, { headers: headers() });
      const provJson = await provRes.json();
      if (provJson.ok) {
        providers = provJson.data;
        $llmProvider.innerHTML = providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      }

      // Load current config
      const cfgRes = await fetch(`${API}/llm-config`, { headers: headers() });
      const cfgJson = await cfgRes.json();
      if (cfgJson.ok) {
        $llmProvider.value = cfgJson.data.provider;
        updateModelOptions();
        $llmModel.value = cfgJson.data.model;
      }

      // Render API key rows
      renderApiKeys();
    } catch {
      // silently fail
    }
  }

  function updateModelOptions() {
    const provider = providers.find(p => p.id === $llmProvider.value);
    if (!provider) return;
    $llmModel.innerHTML = provider.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  }

  $llmProvider.addEventListener('change', updateModelOptions);

  document.getElementById('btnSaveLlm').addEventListener('click', async () => {
    try {
      const res = await fetch(`${API}/llm-config`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ provider: $llmProvider.value, model: $llmModel.value }),
      });
      const json = await res.json();
      toast(json.ok ? 'Model saved' : (json.error || 'Failed'), json.ok ? 'success' : 'error');
    } catch {
      toast('Connection error', 'error');
    }
  });

  function renderApiKeys() {
    const $list = document.getElementById('apiKeyList');
    $list.innerHTML = providers.map(p => `
      <div class="card-row">
        <div>
          <span class="label">${p.name}</span>
          ${p.hasKey ? `<span class="badge badge-green" style="margin-left:8px">configured</span>` : `<span class="badge badge-yellow" style="margin-left:8px">not set</span>`}
          ${p.keyPrefix ? `<span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${p.keyPrefix}</span>` : ''}
        </div>
        <div class="inline-form" style="gap:6px">
          <input type="password" placeholder="Paste API key" id="apikey-${p.id}" style="width:200px;padding:6px 10px;font-size:13px">
          <button class="btn-sm" onclick="window._saveApiKey('${p.id}')">Save</button>
          ${p.hasKey ? `<button class="btn-sm danger" onclick="window._deleteApiKey('${p.id}')">Remove</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  window._saveApiKey = async function (provider) {
    const input = document.getElementById('apikey-' + provider);
    const apiKey = input.value.trim();
    if (!apiKey) return;

    try {
      const res = await fetch(`${API}/llm-config/api-key`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ provider, apiKey }),
      });
      const json = await res.json();
      if (json.ok) {
        input.value = '';
        toast('API key saved', 'success');
        loadLlmConfig();
      } else {
        toast(json.error || 'Failed', 'error');
      }
    } catch {
      toast('Connection error', 'error');
    }
  };

  window._deleteApiKey = async function (provider) {
    if (!confirm(`Remove ${provider} API key?`)) return;
    try {
      const res = await fetch(`${API}/llm-config/api-key/${provider}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const json = await res.json();
      if (json.ok) {
        toast('API key removed', 'success');
        loadLlmConfig();
      }
    } catch {
      toast('Connection error', 'error');
    }
  };

  // ─── Settings ──────────────────────────────────────────────────────
  async function loadSettings() {
    const $list = document.getElementById('settingsList');
    try {
      const res = await fetch(`${API}/settings`, { headers: headers() });
      const json = await res.json();
      if (!json.ok) {
        $list.innerHTML = '<p class="empty-state">Failed to load settings</p>';
        return;
      }

      $list.innerHTML = json.data.map(s => `
        <div class="card-row">
          <div>
            <span class="label">${escapeHtml(s.label)}</span>
            ${s.configured ? `<span class="badge badge-green" style="margin-left:8px">${s.source}</span>` : `<span class="badge badge-yellow" style="margin-left:8px">not set</span>`}
            ${s.keyPrefix ? `<span style="font-size:11px;color:var(--text-tertiary);margin-left:8px">${s.keyPrefix}</span>` : ''}
            <br><span style="font-size:11px;color:var(--text-tertiary)">${escapeHtml(s.description)}</span>
          </div>
          <div class="inline-form" style="gap:6px">
            <input type="password" placeholder="Paste value" id="setting-${s.key}" style="width:200px;padding:6px 10px;font-size:13px">
            <button class="btn-sm" onclick="window._saveSetting('${s.key}')">Save</button>
            ${s.source === 'db' ? `<button class="btn-sm danger" onclick="window._deleteSetting('${s.key}')">Remove</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch {
      $list.innerHTML = '<p class="empty-state">Failed to load settings</p>';
    }
  }

  window._saveSetting = async function (key) {
    const input = document.getElementById('setting-' + key);
    const value = input.value.trim();
    if (!value) return;

    try {
      const res = await fetch(`${API}/settings/${key}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ value }),
      });
      const json = await res.json();
      if (json.ok) {
        input.value = '';
        toast('Setting saved', 'success');
        loadSettings();
      } else {
        toast(json.error || 'Failed', 'error');
      }
    } catch {
      toast('Connection error', 'error');
    }
  };

  window._deleteSetting = async function (key) {
    if (!confirm(`Remove setting ${key}?`)) return;
    try {
      const res = await fetch(`${API}/settings/${key}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const json = await res.json();
      if (json.ok) {
        toast('Setting removed', 'success');
        loadSettings();
      }
    } catch {
      toast('Connection error', 'error');
    }
  };

  // ─── Knowledge Base ────────────────────────────────────────────────
  const $kbAgentSelect = document.getElementById('kbAgentSelect');
  const $kbDocPanel = document.getElementById('kbDocPanel');
  const $docList = document.getElementById('docList');
  const $docModal = document.getElementById('docModal');
  let currentKbAgentId = null;

  async function loadKbAgents() {
    try {
      const res = await fetch(`${API}/agents`, { headers: headers() });
      const json = await res.json();
      if (json.ok && json.data.length > 0) {
        $kbAgentSelect.innerHTML = '<option value="">Select an agent to manage its documents...</option>' +
          json.data.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
      } else {
        $kbAgentSelect.innerHTML = '<option value="">No agents yet — create one in the Agents tab first</option>';
      }
    } catch {
      // silently fail
    }
  }

  $kbAgentSelect.addEventListener('change', () => {
    currentKbAgentId = $kbAgentSelect.value || null;
    if (currentKbAgentId) {
      $kbDocPanel.style.display = 'block';
      loadDocuments();
    } else {
      $kbDocPanel.style.display = 'none';
    }
  });

  async function loadDocuments() {
    if (!currentKbAgentId) return;
    $docList.innerHTML = '<p class="empty-state">Loading...</p>';
    try {
      const res = await fetch(`${API}/agents/${currentKbAgentId}/documents`, { headers: headers() });
      const json = await res.json();
      if (!json.ok || json.data.length === 0) {
        $docList.innerHTML = '<p class="empty-state">No documents yet. Click "+ Add Document" to give this agent knowledge.</p>';
        return;
      }
      $docList.innerHTML = json.data.map(d => `
        <div class="agent-card">
          <div class="agent-card-info">
            <h4>${escapeHtml(d.name)}</h4>
            <p>${escapeHtml(d.sourceType)} &middot; ${d.chunkCount || 0} chunks &middot; ${new Date(d.createdAt).toLocaleDateString()}</p>
          </div>
          <div class="agent-card-actions">
            <button class="btn-sm danger" onclick="window._adminDeleteDoc('${d.id}')">Delete</button>
          </div>
        </div>
      `).join('');
    } catch {
      $docList.innerHTML = '<p class="empty-state">Failed to load documents</p>';
    }
  }

  document.getElementById('btnAddDoc').addEventListener('click', () => {
    document.getElementById('docNameInput').value = '';
    document.getElementById('docContentInput').value = '';
    $docModal.classList.remove('hidden');
  });

  document.getElementById('btnCancelDoc').addEventListener('click', () => {
    $docModal.classList.add('hidden');
  });

  document.getElementById('btnSaveDoc').addEventListener('click', async () => {
    const name = document.getElementById('docNameInput').value.trim();
    const content = document.getElementById('docContentInput').value.trim();

    if (!name || !content) {
      toast('Name and content are required', 'error');
      return;
    }

    const btn = document.getElementById('btnSaveDoc');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const res = await fetch(`${API}/agents/${currentKbAgentId}/documents`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name, content, sourceType: 'text' }),
      });
      const json = await res.json();

      if (json.ok) {
        $docModal.classList.add('hidden');
        const msg = json.data.ingested ? 'Document saved & embedded' : 'Document saved (add OpenAI key to enable embeddings)';
        toast(msg, 'success');
        loadDocuments();
        loadAgents();
      } else {
        toast(json.error || 'Failed to save document', 'error');
      }
    } catch {
      toast('Connection error', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Save Document';
  });

  window._adminDeleteDoc = async function (id) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API}/agents/${currentKbAgentId}/documents/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const json = await res.json();
      if (json.ok) {
        toast('Document deleted', 'success');
        loadDocuments();
        loadAgents();
      } else {
        toast(json.error || 'Failed to delete', 'error');
      }
    } catch {
      toast('Connection error', 'error');
    }
  };

  // ─── Utilities ─────────────────────────────────────────────────────
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function toast(message, type) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
})();
