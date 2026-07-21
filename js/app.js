const channels = [];
let currentPlayer = null;
let currentChannel = null;

async function loadChannels() {
  try {
    const resp = await fetch('channels/channels.json');
    const data = await resp.json();
    channels.push(...data);
    renderChannels();
    document.getElementById('channel-count').textContent = `${channels.length} canales`;
  } catch(e) {
    console.error('Error loading channels:', e);
  }
}

function renderChannels(filter = '') {
  const list = document.getElementById('channel-list');
  const q = filter.toLowerCase();
  const filtered = q ? channels.filter(c => c.name.toLowerCase().includes(q)) : channels;
  
  list.innerHTML = filtered.map(ch => `
    <div class="ch-item ${currentChannel === ch.url ? 'active' : ''}" onclick="playChannel('${encodeURIComponent(ch.url)}')">
      <div class="ch-name">${ch.name}</div>
      <span class="ch-type ${ch.type}">${ch.type}</span>
    </div>
  `).join('');
}

document.getElementById('search').addEventListener('input', (e) => {
  renderChannels(e.target.value);
});

async function playChannel(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  const ch = channels.find(c => c.url === url);
  if (!ch) return;
  
  currentChannel = ch.url;
  renderChannels(document.getElementById('search').value);
  
  document.getElementById('current-channel').textContent = ch.name;
  document.getElementById('current-type').textContent = ch.type;
  document.getElementById('video-player').classList.remove('hidden');
  document.getElementById('loading-msg').textContent = 'Cargando...';
  document.getElementById('loading-msg').classList.remove('hidden');
  document.getElementById('error-msg').classList.add('hidden');
  
  destroyPlayer();
  const video = document.getElementById('video-player');
  
  try {
    if (ch.type === 'm3u8') {
      await playM3U8(url, video);
    } else if (ch.type === 'mpd') {
      await playMPD(ch, video);
    } else {
      video.src = url;
      await video.play();
      document.getElementById('loading-msg').classList.add('hidden');
    }
  } catch(e) {
    showError(e.message || 'No se puede reproducir');
  }
}

function playM3U8(url, video) {
  return new Promise((resolve, reject) => {
    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
        enableWorker: false
      });
      currentPlayer = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: el stream no responde (15s)'));
      }, 15000);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        clearTimeout(timeout);
        video.play().catch(() => {});
        document.getElementById('loading-msg').classList.add('hidden');
        resolve();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          clearTimeout(timeout);
          const msg = data.response ? `HTTP ${data.response.code}` : 'Error de conexión';
          reject(new Error(`HLS: ${msg}`));
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
        document.getElementById('loading-msg').classList.add('hidden');
        resolve();
      });
    } else {
      reject(new Error('HLS no soportado'));
    }
  });
}

function playMPD(ch, video) {
  return new Promise(async (resolve, reject) => {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      reject(new Error('DASH no soportado en este navegador'));
      return;
    }
    
    const player = new shaka.Player();
    currentPlayer = player;
    player.attach(video);
    
    const config = {
      manifest: { dash: { ignoreMinBufferTime: true } },
      streaming: { retryParameters: { maxAttempts: 1 } }
    };
    
    if (ch.keyId && ch.key) {
      config.drm = { clearKeys: {} };
      config.drm.clearKeys[ch.keyId] = ch.key;
    }
    
    player.configure(config);
    
    const timeout = setTimeout(() => {
      reject(new Error('Timeout: el stream no responde'));
    }, 20000);
    
    try {
      await player.load(ch.url);
      clearTimeout(timeout);
      video.play().catch(() => {});
      document.getElementById('loading-msg').classList.add('hidden');
      resolve();
    } catch(err) {
      clearTimeout(timeout);
      const code = err.code || err.detail?.code || 0;
      const msgs = {
        1001: 'HTTP Error: stream no disponible',
        6012: 'Error de licencia DRM. Probá con la extension Chrome.',
      };
      reject(new Error(msgs[code] || `Error (${code})`));
    }
  });
}

function showError(msg) {
  document.getElementById('loading-msg').classList.add('hidden');
  const el = document.getElementById('error-msg');
  el.innerHTML = msg.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:#00e676">$1</a>');
  el.classList.remove('hidden');
}

function destroyPlayer() {
  if (currentPlayer) {
    try {
      if (currentPlayer.destroy) currentPlayer.destroy();
      else if (currentPlayer.stop) currentPlayer.stop();
    } catch(e) {}
    currentPlayer = null;
  }
  const video = document.getElementById('video-player');
  video.src = '';
  video.load();
}

async function refreshPlaylist() {
  document.getElementById('refresh-btn').textContent = '⟳';
  await loadChannels();
  setTimeout(() => { document.getElementById('refresh-btn').textContent = '↻'; }, 1000);
}

loadChannels();
