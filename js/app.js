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
    if (ch.type === 'm3u8' || url.endsWith('.m3u8')) {
      await playM3U8(url, video);
    } else if (ch.type === 'iframe' || url.includes('tok.html')){
      await playTokStream(url, video);
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

async function playTokStream(tokUrl, video) {
  // Fetch tok.html which contains the MPD URL and DRM keys
  const resp = await fetch(tokUrl);
  const html = await resp.text();
  
  // Extract the 'get' parameter from URL
  const getParam = new URL(tokUrl).searchParams.get('get') || '';
  
  // Decode base64 name
  let nameB64 = '';
  try { nameB64 = atob(getParam); } catch(e) { nameB64 = getParam; }
  
  // Extract number from JS
  const numMatch = html.match(new RegExp('getURL.*' + getParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*number = (\\d+)'));
  let number = 3;
  if (numMatch) {
    number = parseInt(numMatch[1]);
  } else {
    // Fallback: find general number assignment
    const fallback = html.match(/else\s*\n?\s*number\s*=\s*(\d+)/);
    if (fallback) number = parseInt(fallback[1]);
  }
  
  // Extract CDN and token from mt array
  const mtMatch = html.match(/var mt = (\[[\s\S]*?\]);/);
  if (!mtMatch) throw new Error('No se encontró CDN en tok.html');
  
  let mt = [];
  try { mt = JSON.parse(mtMatch[1]); } catch(e) { throw new Error('Error parseando CDN'); }
  if (mt.length === 0) throw new Error('Lista CDN vacía');
  
  const selected = mt[Math.floor(Math.random() * mt.length)];
  
  // Build MPD URL
  const mpdUrl = `https://${selected.cdn}.cvattv.com.ar/${selected.token}/live/c${number}eds/${nameB64}/SA_Live_dash_enc/${nameB64}.mpd`;
  
  // Extract keyId and key for this channel
  let keyId = '', key = '';
  
  // Find the matching if block for this getParam
  const keyRegex = new RegExp('getURL\\s*==\\s*["\']' + getParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']' + 
    '[\\s\\S]*?keyId\\s*=\\s*["\']([^"\']+)["\'];\\s*key\\s*=\\s*["\']([^"\']+)["\']');
  const keyMatch = html.match(keyRegex);
  
  if (keyMatch) {
    keyId = keyMatch[1];
    key = keyMatch[2];
  } else {
    // No DRM keys found - try playing without DRM
    console.log('No DRM keys found, trying without');
  }
  
  console.log('MPD:', mpdUrl, 'KeyId:', keyId, 'Key:', key);
  
  // Play with Shaka Player
  await playMPD(mpdUrl, video, keyId, key);
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
      video.addEventListener('error', () => {
        reject(new Error('Error al cargar el video'));
      });
    } else {
      reject(new Error('HLS no soportado'));
    }
  });
}

async function playMPD(url, video, keyId, key) {
  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) {
    throw new Error('MPD no soportado en este navegador');
  }
  
  const player = new shaka.Player();
  currentPlayer = player;
  player.attach(video);
  
  const config = {
    manifest: { dash: { ignoreMinBufferTime: true } },
    streaming: { retryParameters: { maxAttempts: 1 } }
  };
  
  if (keyId && key) {
    config.drm = {
      clearKeys: {}
    };
    config.drm.clearKeys[keyId] = key;
  }
  
  player.configure(config);
  
  const timeout = setTimeout(() => {
    throw new Error('Timeout: el MPD no responde (20s)');
  }, 20000);
  
  try {
    await player.load(url);
    clearTimeout(timeout);
    video.play().catch(() => {});
    document.getElementById('loading-msg').classList.add('hidden');
  } catch(err) {
    clearTimeout(timeout);
    const code = err.code || err.detail?.code || 0;
    const msgs = {
      1001: 'HTTP Error: MPD no disponible (token expirado?)',
      6012: 'DRM: no se pueden obtener las claves de descifrado',
    };
    throw new Error(msgs[code] || `Error MPD (${code})`);
  }
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
