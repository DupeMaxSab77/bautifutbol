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
      <div class="ch-info">
        <div class="ch-name">${ch.name}</div>
      </div>
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
  document.getElementById('loading-msg').textContent = 'Cargando...';
  document.getElementById('loading-msg').classList.remove('hidden');
  document.getElementById('error-msg').classList.add('hidden');
  
  destroyPlayer();
  
  const video = document.getElementById('video-player');
  
  try {
    if (ch.type === 'm3u8' || url.endsWith('.m3u8')) {
      await playM3U8(url, video);
    } else if (ch.type === 'mpd' || url.endsWith('.mpd')) {
      await playMPD(url, video);
    } else if (url.endsWith('.ts')) {
      video.src = url;
      await video.play();
      document.getElementById('loading-msg').classList.add('hidden');
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
        reject(new Error('Timeout: el stream no responde'));
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
      video.addEventListener('error', () => {
        reject(new Error('Error al cargar el video'));
      });
    } else {
      reject(new Error('HLS no soportado en este navegador'));
    }
  });
}

function playMPD(url, video) {
  return new Promise((resolve, reject) => {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      reject(new Error('MPD no soportado en este navegador. Usá Chrome.'));
      return;
    }
    
    const player = new shaka.Player();
    currentPlayer = player;
    player.attach(video);
    
    player.configure({
      drm: { servers: {}, clearKeys: {} },
      manifest: { dash: { ignoreMinBufferTime: true } },
      streaming: { retryParameters: { maxAttempts: 1 } }
    });
    
    const timeout = setTimeout(() => {
      reject(new Error('Timeout: el MPD no responde'));
    }, 15000);
    
    player.addEventListener('error', () => {
      clearTimeout(timeout);
    });
    
    player.load(url).then(() => {
      clearTimeout(timeout);
      video.play().catch(() => {});
      document.getElementById('loading-msg').classList.add('hidden');
      resolve();
    }).catch((err) => {
      clearTimeout(timeout);
      const code = err.code || err.detail?.code || 0;
      const msg = err.message || '';
      
      const msgs = {
        1001: 'HTTP Error: el stream MPD no está disponible (403/404). Probablemente expiró el token.',
        6012: 'DRM: este MPD requiere la extensión Chrome. Instalala: https://chromewebstore.google.com/detail/opmeopcambhfimffbomjgemehjkbbmji',
        1002: 'Error de red: verificá tu conexión.',
        1003: 'El stream MPD no es accesible desde esta ubicación.'
      };
      
      reject(new Error(msgs[code] || `Error MPD (${code}): ${msg.slice(0,100)}`));
    });
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
