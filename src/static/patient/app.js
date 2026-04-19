/**
 * Here Me Now - Patient Check-in App
 * Local-first, NOSTR-based
 */

// Configuration
const CONFIG = {
  API_URL: window.location.origin,
  STORAGE_KEY: 'hemn_keys',
  RELAYS: [
    'wss://relay.getalby.com',
    'wss://relay2.getalby.com',
  ],
};

// State
const state = {
  keys: null,
  locationId: null,
  hasAppointment: false,
  isNewPatient: false,
  pool: null,
};

// DOM Elements
const screens = {
  loading: document.getElementById('loading'),
  welcome: document.getElementById('welcome'),
  checkin: document.getElementById('checkin'),
  success: document.getElementById('success'),
  message: document.getElementById('message'),
  error: document.getElementById('error'),
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initKeys();
  parseLocationFromQR();
  bindEvents();
  showScreen('welcome');
});

// ============================================
// Key Management (CashU.me-Style)
// ============================================

function initKeys() {
  const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
  
  if (stored) {
    try {
      state.keys = JSON.parse(stored);
      console.log('Loaded existing keys:', state.keys.npub.slice(0, 20) + '...');
    } catch (e) {
      console.error('Failed to parse stored keys, generating new');
      generateKeys();
    }
  } else {
    generateKeys();
  }
}

function generateKeys() {
  const sk = window.NostrTools.generateSecretKey();
  const nsec = window.NostrTools.nip19_nsecEncode(sk);
  const npub = window.NostrTools.nip19_npubEncode(window.NostrTools.getPublicKey(sk));
  
  state.keys = {
    sk: Array.from(sk),
    nsec,
    npub,
    createdAt: Date.now(),
  };
  
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.keys));
  console.log('Generated new keys:', npub.slice(0, 20) + '...');
}

function getSkBytes() {
  return new Uint8Array(state.keys.sk);
}

// ============================================
// Screen Navigation
// ============================================

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showScreen('error');
}

// ============================================
// Event Binding
// ============================================

function bindEvents() {
  // Welcome
  document.getElementById('btn-start').addEventListener('click', () => {
    showScreen('checkin');
    initNostrSubscription();
  });
  
  // Appointment toggle
  document.getElementById('btn-appointment-yes').addEventListener('click', () => {
    setAppointment(true);
  });
  document.getElementById('btn-appointment-no').addEventListener('click', () => {
    setAppointment(false);
  });
  
  // Character counters
  document.getElementById('input-reason').addEventListener('input', (e) => {
    document.getElementById('reason-count').textContent = e.target.value.length;
  });
  document.getElementById('input-notes').addEventListener('input', (e) => {
    document.getElementById('notes-count').textContent = e.target.value.length;
  });
  
  // Checkin button
  document.getElementById('btn-checkin').addEventListener('click', doCheckin);
  
  // Success screen
  document.getElementById('btn-done').addEventListener('click', () => {
    window.close();
    showScreen('welcome');
  });
  
  // Message screen
  document.getElementById('btn-message-ok').addEventListener('click', () => {
    showScreen('success');
  });
  
  // Error retry
  document.getElementById('btn-retry').addEventListener('click', () => {
    showScreen('welcome');
  });
}

function setAppointment(has) {
  state.hasAppointment = has;
  document.getElementById('btn-appointment-yes').classList.toggle('active', has);
  document.getElementById('btn-appointment-no').classList.toggle('active', !has);
}

// ============================================
// Checkin Logic
// ============================================

async function doCheckin() {
  if (!state.locationId) {
    showError('Keine Praxis ausgewählt. Bitte scannen Sie den QR-Code erneut.');
    return;
  }
  
  const btn = document.getElementById('btn-checkin');
  const btnText = btn.querySelector('.btn-text');
  const btnSpinner = btn.querySelector('.spinner-small');
  
  btn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';
  
  try {
    const data = {
      npub: state.keys.npub,
      locationId: state.locationId,
      hasAppointment: state.hasAppointment,
      reason: document.getElementById('input-reason').value || undefined,
      notes: document.getElementById('input-notes').value || undefined,
    };
    
    // If new patient, include identification
    if (state.isNewPatient) {
      data.lastName = document.getElementById('input-lastname').value || undefined;
      data.birthDate = document.getElementById('input-birthdate').value || undefined;
    }
    
    const response = await fetch(`${CONFIG.API_URL}/api/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.needsIdentification) {
      state.isNewPatient = true;
      document.getElementById('name-group').style.display = 'block';
      document.getElementById('birthdate-group').style.display = 'block';
      document.getElementById('input-lastname').focus();
      
      // Re-enable button for retry with data
      btn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
      btnText.textContent = 'Mit Daten einchecken';
      
      alert('Bitte geben Sie zur Identifikation Ihren Nachnamen und Geburtsdatum ein.');
      return;
    }
    
    // Success!
    showSuccess(result);
    
  } catch (error) {
    console.error('Checkin failed:', error);
    showError('Check-in fehlgeschlagen. Bitte versuchen Sie es erneut.');
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}

function showSuccess(result) {
  showScreen('success');
  
  document.getElementById('success-message').textContent = 
    result.isNewPatient ? 'Sie sind erfolgreich eingecheckt!' : 'Willkommen zurück!';
  
  // Generate QR code for this checkin
  if (result.checkinId) {
    try {
      new QRious({
        element: document.getElementById('qr-canvas'),
        value: result.checkinId,
        size: 200,
        level: 'M',
      });
    } catch (e) {
      document.getElementById('qr-section').style.display = 'none';
    }
  }
  
  // Reset form for next time
  document.getElementById('input-reason').value = '';
  document.getElementById('input-notes').value = '';
  document.getElementById('input-lastname').value = '';
  document.getElementById('input-birthdate').value = '';
  document.getElementById('reason-count').textContent = '0';
  document.getElementById('notes-count').textContent = '0';
}

// ============================================
// URL Parsing (QR Code Data)
// ============================================

function parseLocationFromQR() {
  const params = new URLSearchParams(window.location.search);
  const locationId = params.get('l') || params.get('location');
  
  if (locationId) {
    state.locationId = locationId;
    document.getElementById('location-name').textContent = 
      params.get('name') || 'Praxis';
    document.getElementById('user-id').textContent = 
      'ID: ' + state.keys.npub.slice(0, 16) + '...';
    return true;
  }
  
  // For testing - default location
  state.locationId = 'demo-praxis-001';
  document.getElementById('location-name').textContent = 'Demo-Praxis';
  document.getElementById('user-id').textContent = 
    'ID: ' + state.keys.npub.slice(0, 16) + '...';
  
  return false;
}

// ============================================
// NOSTR Integration (DM Reception)
// ============================================

function initNostrSubscription() {
  if (!window.NostrTools) {
    console.warn('NostrTools not loaded');
    return;
  }
  
  try {
    state.pool = new window.NostrTools.SimplePool();
    const pk = window.NostrTools.getPublicKey(getSkBytes());
    
    // Subscribe to DMs sent to us
    const sub = state.pool.subscribeMany(CONFIG.RELAYS, [
      {
        kinds: [4], // Encrypted DM
        '#p': [pk],
      },
    ], {
      onevent: handleIncomingDM,
      oneose: () => console.log('Initial DM sync complete'),
    });
    
    console.log('Subscribed to DMs for:', pk.slice(0, 20) + '...');
    
  } catch (error) {
    console.error('NOSTR subscription failed:', error);
  }
}

async function handleIncomingDM(event) {
  try {
    const sk = getSkBytes();
    const pk = window.NostrTools.getPublicKey(sk);
    
    // Decrypt
    const plaintext = await window.NostrTools.nip04.decrypt(sk, event.pubkey, event.content);
    
    console.log('Received DM:', plaintext);
    
    // Show message screen
    document.getElementById('message-content').textContent = plaintext;
    showScreen('message');
    
  } catch (error) {
    console.error('Failed to decrypt DM:', error);
  }
}

// ============================================
// Utility
// ============================================

// Export for debugging
window.HEMN = {
  state,
  generateNewKeys: () => {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    location.reload();
  },
  showScreen,
};
