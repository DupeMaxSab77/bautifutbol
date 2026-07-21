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
    showError(`Error: ${e.message || 'No se puede reproducir'}`);
  }
}

function playM3U8(url, video) {
  return new Promise((resolve, reject) => {
    if (Hls.isSupported()) {
      const hls = new Hls({ xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      }});
      currentPlayer = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        document.getElementById('loading-msg').classList.add('hidden');
        resolve();
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) reject(new Error('Error fatal HLS'));
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

function playMPD(url, video) {
  return new Promise((resolve, reject) => {
    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) {
      reject(new Error('MPD no soportado en este navegador'));
      return;
    }
    
    const player = new shaka.Player();
    currentPlayer = player;
    player.attach(video);
    
    player.configure({
      drm: {
        servers: {},
        clearKeys: {}
      },
      manifest: {
        dash: {
          ignoreMinBufferTime: true
        }
      }
    });
    
    player.addEventListener('error', (e) => {
      reject(new Error('Error MPD'));
    });
    
    player.load(url).then(() => {
      video.play().catch(() => {});
      document.getElementById('loading-msg').classList.add('hidden');
      resolve();
    }).catch(reject);
  });
}

function showError(msg) {
  document.getElementById('loading-msg').classList.add('hidden');
  const el = document.getElementById('error-msg');
  el.textContent = msg;
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
