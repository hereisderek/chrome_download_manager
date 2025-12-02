// Load saved options
let localDownloaders = [];
let remoteDownloaders = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadOptions();
  setupEventListeners();
  renderLocalDownloaders();
  renderRemoteDownloaders();
});

// Load options from storage
async function loadOptions() {
  const result = await chrome.storage.sync.get(['localDownloaders', 'remoteDownloaders']);
  localDownloaders = result.localDownloaders || [];
  remoteDownloaders = result.remoteDownloaders || [];
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
  // Local downloader buttons
  document.getElementById('addLocalBtn').addEventListener('click', () => {
    showLocalForm();
  });
  
  document.getElementById('cancelLocalBtn').addEventListener('click', () => {
    hideLocalForm();
  });
  
  document.getElementById('localForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveLocalDownloader();
  });
  
  // Remote downloader buttons
  document.getElementById('addRemoteBtn').addEventListener('click', () => {
    showRemoteForm();
  });
  
  document.getElementById('cancelRemoteBtn').addEventListener('click', () => {
    hideRemoteForm();
  });
  
  document.getElementById('remoteForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveRemoteDownloader();
  });
  
  // Remote type change
  document.getElementById('remoteType').addEventListener('change', (e) => {
    updateRemoteFields(e.target.value);
  });
}

// Switch tab
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tab}Tab`);
  });
}

// Render local downloaders
function renderLocalDownloaders() {
  const container = document.getElementById('localDownloadersList');
  container.innerHTML = '';
  
  if (localDownloaders.length === 0) {
    container.innerHTML = '<p class="empty-message">No local downloaders configured yet.</p>';
    return;
  }
  
  localDownloaders.forEach((downloader, index) => {
    const card = createDownloaderCard(downloader, index, 'local');
    container.appendChild(card);
  });
}

// Render remote downloaders
function renderRemoteDownloaders() {
  const container = document.getElementById('remoteDownloadersList');
  container.innerHTML = '';
  
  if (remoteDownloaders.length === 0) {
    container.innerHTML = '<p class="empty-message">No remote downloaders configured yet.</p>';
    return;
  }
  
  remoteDownloaders.forEach((downloader, index) => {
    const card = createDownloaderCard(downloader, index, 'remote');
    container.appendChild(card);
  });
}

// Create downloader card
function createDownloaderCard(downloader, index, type) {
  const card = document.createElement('div');
  card.className = 'downloader-card';
  if (!downloader.enabled) {
    card.classList.add('disabled');
  }
  
  card.innerHTML = `
    <div class="card-header">
      <h3>${downloader.name}</h3>
      <span class="type-badge">${downloader.type}</span>
    </div>
    <div class="card-body">
      ${downloader.description ? `<p>${downloader.description}</p>` : ''}
      ${type === 'local' ? `<p class="path"><strong>Path:</strong> ${downloader.path}</p>` : ''}
      ${type === 'remote' && downloader.webUIUrl ? `<p class="path"><strong>URL:</strong> ${downloader.webUIUrl}</p>` : ''}
      ${type === 'remote' && downloader.rpcUrl ? `<p class="path"><strong>URL:</strong> ${downloader.rpcUrl}</p>` : ''}
      ${type === 'remote' && downloader.sshHost ? `<p class="path"><strong>Host:</strong> ${downloader.sshUser}@${downloader.sshHost}</p>` : ''}
    </div>
    <div class="card-actions">
      <button class="edit-btn" data-index="${index}" data-type="${type}">Edit</button>
      <button class="delete-btn" data-index="${index}" data-type="${type}">Delete</button>
      <label class="toggle-label">
        <input type="checkbox" class="toggle-enabled" data-index="${index}" data-type="${type}" ${downloader.enabled ? 'checked' : ''}>
        Enabled
      </label>
    </div>
  `;
  
  // Add event listeners
  card.querySelector('.edit-btn').addEventListener('click', () => {
    if (type === 'local') {
      editLocalDownloader(index);
    } else {
      editRemoteDownloader(index);
    }
  });
  
  card.querySelector('.delete-btn').addEventListener('click', () => {
    if (type === 'local') {
      deleteLocalDownloader(index);
    } else {
      deleteRemoteDownloader(index);
    }
  });
  
  card.querySelector('.toggle-enabled').addEventListener('change', (e) => {
    if (type === 'local') {
      localDownloaders[index].enabled = e.target.checked;
      saveToStorage('local');
    } else {
      remoteDownloaders[index].enabled = e.target.checked;
      saveToStorage('remote');
    }
  });
  
  return card;
}

// Show local form
function showLocalForm(data = null, index = -1) {
  const form = document.getElementById('localDownloaderForm');
  const indexInput = document.getElementById('localIndex');
  
  if (data) {
    document.getElementById('localName').value = data.name || '';
    document.getElementById('localType').value = data.type || 'fdm';
    document.getElementById('localPath').value = data.path || '';
    document.getElementById('localDescription').value = data.description || '';
    document.getElementById('localEnabled').checked = data.enabled !== false;
    indexInput.value = index;
  } else {
    document.getElementById('localForm').reset();
    indexInput.value = '-1';
  }
  
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

// Hide local form
function hideLocalForm() {
  document.getElementById('localDownloaderForm').classList.add('hidden');
  document.getElementById('localForm').reset();
}

// Save local downloader
async function saveLocalDownloader() {
  const index = parseInt(document.getElementById('localIndex').value);
  
  const downloader = {
    name: document.getElementById('localName').value,
    type: document.getElementById('localType').value,
    path: document.getElementById('localPath').value,
    description: document.getElementById('localDescription').value,
    enabled: document.getElementById('localEnabled').checked
  };
  
  if (index === -1) {
    localDownloaders.push(downloader);
  } else {
    localDownloaders[index] = downloader;
  }
  
  await saveToStorage('local');
  hideLocalForm();
  renderLocalDownloaders();
  showStatusMessage('Local downloader saved successfully', 'success');
}

// Edit local downloader
function editLocalDownloader(index) {
  showLocalForm(localDownloaders[index], index);
}

// Delete local downloader
async function deleteLocalDownloader(index) {
  if (confirm('Are you sure you want to delete this downloader?')) {
    localDownloaders.splice(index, 1);
    await saveToStorage('local');
    renderLocalDownloaders();
    showStatusMessage('Local downloader deleted', 'success');
  }
}

// Show remote form
function showRemoteForm(data = null, index = -1) {
  const form = document.getElementById('remoteDownloaderForm');
  const indexInput = document.getElementById('remoteIndex');
  
  if (data) {
    document.getElementById('remoteName').value = data.name || '';
    document.getElementById('remoteType').value = data.type || 'curl';
    document.getElementById('remoteDescription').value = data.description || '';
    document.getElementById('remoteEnabled').checked = data.enabled !== false;
    
    // Type-specific fields
    if (data.type === 'curl') {
      document.getElementById('sshHost').value = data.sshHost || '';
      document.getElementById('sshUser').value = data.sshUser || '';
    } else if (data.type === 'qbittorrent') {
      document.getElementById('qbWebUIUrl').value = data.webUIUrl || '';
      document.getElementById('qbUsername').value = data.username || '';
      document.getElementById('qbPassword').value = data.password || '';
    } else if (data.type === 'aria2') {
      document.getElementById('aria2RpcUrl').value = data.rpcUrl || '';
      document.getElementById('aria2Token').value = data.token || '';
    }
    
    indexInput.value = index;
    updateRemoteFields(data.type);
  } else {
    document.getElementById('remoteForm').reset();
    indexInput.value = '-1';
    updateRemoteFields('curl');
  }
  
  form.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

// Hide remote form
function hideRemoteForm() {
  document.getElementById('remoteDownloaderForm').classList.add('hidden');
  document.getElementById('remoteForm').reset();
}

// Update remote fields based on type
function updateRemoteFields(type) {
  const curlFields = document.getElementById('curlFields');
  const qbFields = document.getElementById('qbittorrentFields');
  const aria2Fields = document.getElementById('aria2Fields');
  
  curlFields.classList.add('hidden');
  qbFields.classList.add('hidden');
  aria2Fields.classList.add('hidden');
  
  if (type === 'curl') {
    curlFields.classList.remove('hidden');
  } else if (type === 'qbittorrent') {
    qbFields.classList.remove('hidden');
  } else if (type === 'aria2') {
    aria2Fields.classList.remove('hidden');
  }
}

// Save remote downloader
async function saveRemoteDownloader() {
  const index = parseInt(document.getElementById('remoteIndex').value);
  const type = document.getElementById('remoteType').value;
  
  const downloader = {
    name: document.getElementById('remoteName').value,
    type: type,
    description: document.getElementById('remoteDescription').value,
    enabled: document.getElementById('remoteEnabled').checked
  };
  
  // Add type-specific fields
  if (type === 'curl') {
    downloader.sshHost = document.getElementById('sshHost').value;
    downloader.sshUser = document.getElementById('sshUser').value;
  } else if (type === 'qbittorrent') {
    downloader.webUIUrl = document.getElementById('qbWebUIUrl').value;
    downloader.username = document.getElementById('qbUsername').value;
    downloader.password = document.getElementById('qbPassword').value;
  } else if (type === 'aria2') {
    downloader.rpcUrl = document.getElementById('aria2RpcUrl').value;
    downloader.token = document.getElementById('aria2Token').value;
  }
  
  if (index === -1) {
    remoteDownloaders.push(downloader);
  } else {
    remoteDownloaders[index] = downloader;
  }
  
  await saveToStorage('remote');
  hideRemoteForm();
  renderRemoteDownloaders();
  showStatusMessage('Remote downloader saved successfully', 'success');
}

// Edit remote downloader
function editRemoteDownloader(index) {
  showRemoteForm(remoteDownloaders[index], index);
}

// Delete remote downloader
async function deleteRemoteDownloader(index) {
  if (confirm('Are you sure you want to delete this downloader?')) {
    remoteDownloaders.splice(index, 1);
    await saveToStorage('remote');
    renderRemoteDownloaders();
    showStatusMessage('Remote downloader deleted', 'success');
  }
}

// Save to storage
async function saveToStorage(type) {
  if (type === 'local') {
    await chrome.storage.sync.set({ localDownloaders });
  } else {
    await chrome.storage.sync.set({ remoteDownloaders });
  }
}

// Show status message
function showStatusMessage(message, type = 'success') {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.classList.remove('hidden');
  
  setTimeout(() => {
    statusEl.classList.add('hidden');
  }, 3000);
}
