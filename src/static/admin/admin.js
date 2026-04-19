/**
 * Here-Me-Now Praxis Dashboard
 * Tile-based patient management with inline messaging
 */

// Configuration
const CONFIG = {
  API_URL: window.location.origin,
  REFRESH_INTERVAL: 10000, // 10 seconds
};

// State
const state = {
  locationId: null,
  adminKey: null,
  serverNsec: null,
  checkins: [],
  selectedCheckinId: null,
  filter: 'all', // all, waiting, called, new
  autoRefresh: null,
};

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  bindEvents();
});

// ============================================
// Login & Initialization
// ============================================

function initLogin() {
  const saved = localStorage.getItem('hemn_admin');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      state.locationId = data.locationId;
      state.adminKey = data.adminKey;
      state.serverNsec = data.serverNsec;
      showDashboard();
      return;
    } catch (e) {
      localStorage.removeItem('hemn_admin');
    }
  }
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('dashboard-screen').classList.remove('active');
}

function showDashboard() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('dashboard-screen').classList.add('active');
  document.getElementById('praxis-name').textContent = state.locationId;
  
  loadCheckins();
  startAutoRefresh();
}

function bindEvents() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const locationId = document.getElementById('praxis-id').value.trim();
    const adminKey = document.getElementById('admin-key').value.trim();
    const serverNsec = document.getElementById('server-nostr-key').value.trim();
    
    if (!locationId || !adminKey) return;
    
    state.locationId = locationId;
    state.adminKey = adminKey;
    state.serverNsec = serverNsec;
    
    localStorage.setItem('hemn_admin', JSON.stringify({
      locationId,
      adminKey,
      serverNsec,
    }));
    
    showDashboard();
  });
  
  // Header buttons
  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadCheckins();
  });
  
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('hemn_admin');
    stopAutoRefresh();
    location.reload();
  });
  
  // Filter tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      renderTiles();
    });
  });
  
  // Modal close buttons
  document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });
  
  // Link patient form
  document.getElementById('link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await linkPatient();
  });
  
  // Quick message buttons
  document.querySelectorAll('.quick-buttons .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('message-text').value = btn.dataset.msg;
    });
  });
  
  // Send message button
  document.getElementById('btn-send-message').addEventListener('click', sendMessage);
}

// ============================================
// Data Loading
// ============================================

async function loadCheckins() {
  try {
    const response = await fetch(
      `${CONFIG.API_URL}/api/admin/checkins?locationId=${state.locationId}`,
      {
        headers: { 'Authorization': `Bearer ${state.adminKey}` }
      }
    );
    
    if (!response.ok) throw new Error('Failed to load');
    
    const data = await response.json();
    state.checkins = data.checkins || [];
    
    updateStats();
    renderTiles();
    
  } catch (error) {
    console.error('Failed to load checkins:', error);
    showNotification('Fehler beim Laden der Daten', 'error');
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.autoRefresh = setInterval(loadCheckins, CONFIG.REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (state.autoRefresh) {
    clearInterval(state.autoRefresh);
    state.autoRefresh = null;
  }
}

// ============================================
// Stats
// ============================================

function updateStats() {
  const waiting = state.checkins.filter(c => c.status === 'waiting').length;
  const called = state.checkins.filter(c => c.status === 'called').length;
  const newPatients = state.checkins.filter(c => !c.patient.linked_by).length;
  const total = state.checkins.length;
  
  document.getElementById('stat-waiting').textContent = waiting;
  document.getElementById('stat-called').textContent = called;
  document.getElementById('stat-new').textContent = newPatients;
  document.getElementById('stat-total').textContent = total;
}

// ============================================
// Tile Rendering
// ============================================

function renderTiles() {
  const container = document.getElementById('checkin-list');
  
  // Filter checkins
  let filtered = state.checkins;
  if (state.filter === 'waiting') {
    filtered = filtered.filter(c => c.status === 'waiting');
  } else if (state.filter === 'called') {
    filtered = filtered.filter(c => c.status === 'called');
  } else if (state.filter === 'new') {
    filtered = filtered.filter(c => !c.patient.linked_by);
  }
  
  // Sort: waiting first, then by checkin time
  filtered.sort((a, b) => {
    if (a.status === 'waiting' && b.status !== 'waiting') return -1;
    if (a.status !== 'waiting' && b.status === 'waiting') return 1;
    return new Date(a.checkin_at) - new Date(b.checkin_at);
  });
  
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Keine Patienten in der Warteliste</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(checkin => renderTile(checkin)).join('');
  
  // Bind tile events
  filtered.forEach(checkin => {
    bindTileEvents(checkin);
  });
}

function renderTile(checkin) {
  const patient = checkin.patient;
  const isLinked = !!patient.linked_by;
  const isNew = !isLinked;
  
  const displayName = isLinked 
    ? patient.last_name 
    : `Unbekannt (${patient.npub.slice(0, 12)}...)`;
  
  const statusClass = `status-${checkin.status}`;
  const statusText = {
    'waiting': 'Wartend',
    'called': 'Aufgerufen',
    'in_progress': 'In Behandlung',
    'completed': 'Abgeschlossen',
    'cancelled': 'Abgebrochen'
  }[checkin.status] || checkin.status;
  
  const timeAgo = getTimeAgo(new Date(checkin.checkin_at));
  
  return `
    <div class="patient-tile ${checkin.status}" data-id="${checkin.id}">
      <div class="tile-header">
        <div class="tile-title">
          <h3>${escapeHtml(displayName)}</h3>
          ${isNew ? '<span class="badge badge-new">NEU</span>' : ''}
          ${checkin.has_appointment ? '<span class="badge badge-appointment">Termin</span>' : ''}
          <span class="badge ${statusClass}">${statusText}</span>
        </div>
        <div class="tile-time">${timeAgo}</div>
      </div>
      
      <div class="tile-info">
        ${patient.birth_date ? `<span>📅 ${formatDate(patient.birth_date)}</span>` : ''}
        ${patient.insurance_number ? `<span>🏥 ${escapeHtml(patient.insurance_number)}</span>` : ''}
        ${patient.phone ? `<span>📞 ${escapeHtml(patient.phone)}</span>` : ''}
      </div>
      
      ${checkin.reason ? `
        <div class="tile-reason">
          <strong>Anliegen:</strong> ${escapeHtml(checkin.reason)}
        </div>
      ` : ''}
      
      ${checkin.notes ? `
        <div class="tile-notes">
          <strong>Notizen:</strong> ${escapeHtml(checkin.notes)}
        </div>
      ` : ''}
      
      <!-- Internal Notes Input -->
      <div class="tile-section">
        <label>📝 Interne Notizen (heute)</label>
        <div class="input-row">
          <input type="text" 
                 class="internal-note-input" 
                 data-checkin-id="${checkin.id}"
                 placeholder="Notiz hinzufügen..."
                 value="${escapeHtml(checkin.notes || '')}">
          <button class="btn btn-small btn-save-note" data-checkin-id="${checkin.id}">
            💾
          </button>
        </div>
      </div>
      
      <!-- Message Input -->
      <div class="tile-section">
        <label>💬 Nachricht an Patienten</label>
        <div class="input-row">
          <input type="text" 
                 class="message-input" 
                 data-checkin-id="${checkin.id}"
                 placeholder="Nachricht eingeben..."
                 ${!state.serverNsec ? 'disabled title="Bitte NOSTR nsec in Einstellungen eingeben"' : ''}>
          <button class="btn btn-small btn-send" data-checkin-id="${checkin.id}" ${!state.serverNsec ? 'disabled' : ''}>
            📤
          </button>
        </div>
        ${!state.serverNsec ? '<small class="hint">NOSTR-Key erforderlich für Nachrichten</small>' : ''}
      </div>
      
      <!-- Action Buttons -->
      <div class="tile-actions">
        ${isNew ? `
          <button class="btn btn-small btn-link" data-patient-id="${patient.id}">
            🔗 Verknüpfen
          </button>
        ` : ''}
        
        ${checkin.status === 'waiting' ? `
          <button class="btn btn-small btn-call" data-checkin-id="${checkin.id}">
            📢 Aufrufen
          </button>
        ` : ''}
        
        ${checkin.status === 'called' ? `
          <button class="btn btn-small btn-start" data-checkin-id="${checkin.id}">
            ▶️ Behandlung starten
          </button>
        ` : ''}
        
        ${checkin.status !== 'completed' && checkin.status !== 'cancelled' ? `
          <button class="btn btn-small btn-release" data-checkin-id="${checkin.id}">
            ✅ Entlassen
          </button>
          <button class="btn btn-small btn-cancel" data-checkin-id="${checkin.id}">
            ❌ Absagen
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function bindTileEvents(checkin) {
  const tile = document.querySelector(`.patient-tile[data-id="${checkin.id}"]`);
  if (!tile) return;
  
  // Link patient
  const linkBtn = tile.querySelector('.btn-link');
  if (linkBtn) {
    linkBtn.addEventListener('click', () => openLinkModal(checkin.patient));
  }
  
  // Status changes
  const callBtn = tile.querySelector('.btn-call');
  if (callBtn) {
    callBtn.addEventListener('click', () => updateStatus(checkin.id, 'called'));
  }
  
  const startBtn = tile.querySelector('.btn-start');
  if (startBtn) {
    startBtn.addEventListener('click', () => updateStatus(checkin.id, 'in_progress'));
  }
  
  const releaseBtn = tile.querySelector('.btn-release');
  if (releaseBtn) {
    releaseBtn.addEventListener('click', () => updateStatus(checkin.id, 'completed'));
  }
  
  const cancelBtn = tile.querySelector('.btn-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => updateStatus(checkin.id, 'cancelled'));
  }
  
  // Save note
  const saveNoteBtn = tile.querySelector('.btn-save-note');
  if (saveNoteBtn) {
    saveNoteBtn.addEventListener('click', () => {
      const input = tile.querySelector('.internal-note-input');
      saveNote(checkin.id, input.value);
    });
  }
  
  // Send message
  const sendBtn = tile.querySelector('.btn-send');
  const msgInput = tile.querySelector('.message-input');
  if (sendBtn && msgInput) {
    sendBtn.addEventListener('click', () => {
      if (msgInput.value.trim()) {
        sendDirectMessage(checkin.id, msgInput.value.trim());
        msgInput.value = '';
      }
    });
    
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && msgInput.value.trim()) {
        sendDirectMessage(checkin.id, msgInput.value.trim());
        msgInput.value = '';
      }
    });
  }
}

// ============================================
// Actions
// ============================================

async function updateStatus(checkinId, status) {
  try {
    const response = await fetch(
      `${CONFIG.API_URL}/api/admin/checkins/${checkinId}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.adminKey}`
        },
        body: JSON.stringify({ status })
      }
    );
    
    if (!response.ok) throw new Error('Failed');
    
    showNotification(
      status === 'completed' ? 'Patient entlassen' : 
      status === 'called' ? 'Patient aufgerufen' :
      status === 'cancelled' ? 'Termin abgesagt' :
      'Status aktualisiert', 
      'success'
    );
    
    loadCheckins();
    
  } catch (error) {
    console.error('Failed to update status:', error);
    showNotification('Fehler beim Aktualisieren', 'error');
  }
}

async function saveNote(checkinId, note) {
  try {
    const response = await fetch(
      `${CONFIG.API_URL}/api/admin/checkins/${checkinId}/notes`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.adminKey}`
        },
        body: JSON.stringify({ notes: note })
      }
    );
    
    if (!response.ok) throw new Error('Failed');
    
    showNotification('Notiz gespeichert', 'success');
    
    // Update local state
    const checkin = state.checkins.find(c => c.id === checkinId);
    if (checkin) {
      checkin.notes = note;
    }
    
  } catch (error) {
    console.error('Failed to save note:', error);
    showNotification('Fehler beim Speichern', 'error');
  }
}

async function sendDirectMessage(checkinId, content) {
  if (!state.serverNsec) {
    showNotification('NOSTR-Key erforderlich', 'error');
    return;
  }
  
  try {
    const response = await fetch(
      `${CONFIG.API_URL}/api/admin/checkins/${checkinId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.adminKey}`
        },
        body: JSON.stringify({ 
          content,
          serverNsec: state.serverNsec 
        })
      }
    );
    
    if (!response.ok) throw new Error('Failed');
    
    showNotification('Nachricht gesendet', 'success');
    
  } catch (error) {
    console.error('Failed to send message:', error);
    showNotification('Fehler beim Senden', 'error');
  }
}

// ============================================
// Link Patient Modal
// ============================================

function openLinkModal(patient) {
  document.getElementById('link-patient-id').value = patient.id;
  document.getElementById('link-lastname').value = patient.last_name || '';
  document.getElementById('link-birthdate').value = patient.birth_date || '';
  document.getElementById('link-insurance').value = patient.insurance_number || '';
  document.getElementById('link-phone').value = patient.phone || '';
  document.getElementById('link-notes').value = patient.notes || '';
  
  document.getElementById('link-modal').classList.add('active');
}

async function linkPatient() {
  const patientId = document.getElementById('link-patient-id').value;
  const data = {
    lastName: document.getElementById('link-lastname').value,
    birthDate: document.getElementById('link-birthdate').value || undefined,
    insuranceNumber: document.getElementById('link-insurance').value || undefined,
    phone: document.getElementById('link-phone').value || undefined,
    notes: document.getElementById('link-notes').value || undefined,
    linkedBy: state.adminKey,
  };
  
  try {
    const response = await fetch(
      `${CONFIG.API_URL}/api/admin/patients/${patientId}/link`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.adminKey}`
        },
        body: JSON.stringify(data)
      }
    );
    
    if (!response.ok) throw new Error('Failed');
    
    closeModals();
    showNotification('Patient verknüpft', 'success');
    loadCheckins();
    
  } catch (error) {
    console.error('Failed to link patient:', error);
    showNotification('Fehler beim Verknüpfen', 'error');
  }
}

// ============================================
// Message Modal (for detailed messages)
// ============================================

function openMessageModal(checkinId) {
  document.getElementById('message-checkin-id').value = checkinId;
  document.getElementById('message-modal').classList.add('active');
}

async function sendMessage() {
  const checkinId = document.getElementById('message-checkin-id').value;
  const content = document.getElementById('message-text').value;
  
  if (!content.trim()) return;
  
  await sendDirectMessage(checkinId, content);
  closeModals();
  document.getElementById('message-text').value = '';
}

function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// ============================================
// Utilities
// ============================================

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'gerade eben';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Std.`;
  return `${Math.floor(hours / 24)} Tg.`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  // Simple notification - could be enhanced
  const colors = {
    success: '#22c55e',
    error: '#ef4444',
    info: '#3b82f6'
  };
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${colors[type] || colors.info};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
`;
document.head.appendChild(style);
