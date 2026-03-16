// Live TV Module
const LIVE_TV_SOURCES = [
    {
        name: '央视+卫视+地方台',
        url: 'https://m3u.ibert.me/cn.m3u',
        region: 'cn'
    },
    {
        name: '央视+卫视 (IPV6)',
        url: 'https://m3u.ibert.me/fmml_ipv6.m3u',
        region: 'cn'
    },
    {
        name: '央视+卫视 (多线路)',
        url: 'https://m3u.ibert.me/fmml_itv.m3u',
        region: 'cn'
    },
    {
        name: '国际频道',
        url: 'https://iptv-org.github.io/iptv/index.m3u',
        region: 'intl'
    },
    {
        name: '中国频道 (iptv-org)',
        url: 'https://iptv-org.github.io/iptv/countries/cn.m3u',
        region: 'cn'
    },
    {
        name: '香港频道',
        url: 'https://iptv-org.github.io/iptv/countries/hk.m3u',
        region: 'hk'
    },
    {
        name: '台湾频道',
        url: 'https://iptv-org.github.io/iptv/countries/tw.m3u',
        region: 'tw'
    },
    {
        name: '日本频道',
        url: 'https://iptv-org.github.io/iptv/countries/jp.m3u',
        region: 'jp'
    },
    {
        name: '韩国频道',
        url: 'https://iptv-org.github.io/iptv/countries/kr.m3u',
        region: 'kr'
    },
    {
        name: '美国频道',
        url: 'https://iptv-org.github.io/iptv/countries/us.m3u',
        region: 'us'
    },
    {
        name: '英国频道',
        url: 'https://iptv-org.github.io/iptv/countries/uk.m3u',
        region: 'uk'
    }
];

let allChannels = [];
let filteredChannels = [];
let currentChannel = null;
let hlsInstance = null;
let currentSourceIndex = 0;

// Fetch with timeout (compatible with older browsers)
function fetchWithTimeout(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Request timeout'));
        }, timeoutMs);

        fetch(url, { signal: controller.signal })
            .then(res => { clearTimeout(timer); resolve(res); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
}

// Fetch M3U content — try direct first, fall back to proxy
async function fetchM3U(url) {
    // Try direct fetch first (GitHub/iptv-org have CORS headers)
    try {
        const res = await fetchWithTimeout(url, 10000);
        if (res.ok) return await res.text();
    } catch (e) {
        console.warn('Direct fetch failed, trying proxy:', e.message);
    }

    // Fall back to proxy
    const proxyUrl = '/proxy/' + encodeURIComponent(url);
    // Add auth if available
    const finalUrl = window.ProxyAuth?.addAuthToProxyUrl
        ? await window.ProxyAuth.addAuthToProxyUrl(proxyUrl)
        : proxyUrl;
    const res = await fetchWithTimeout(finalUrl, 15000);
    if (!res.ok) throw new Error('Proxy fetch failed: ' + res.status);
    return await res.text();
}

// Parse M3U content into channel objects
function parseM3U(content) {
    const lines = content.split('\n');
    const channels = [];
    let current = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            const nameMatch = line.match(/,(.+)$/);
            const groupMatch = line.match(/group-title="([^"]*)"/);
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            current = {
                name: nameMatch ? nameMatch[1].trim() : 'Unknown',
                group: groupMatch ? groupMatch[1].trim() : '其他',
                logo: logoMatch ? logoMatch[1] : '',
                url: ''
            };
        } else if (current && line && !line.startsWith('#')) {
            current.url = line;
            channels.push(current);
            current = null;
        }
    }
    return channels;
}

// Load channels from a source
async function loadSource(sourceIndex) {
    const source = LIVE_TV_SOURCES[sourceIndex];
    if (!source) return;

    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '<div class="channel-loading"><div class="spinner"></div>加载中...</div>';

    try {
        const text = await fetchM3U(source.url);
        allChannels = parseM3U(text);

        if (allChannels.length === 0) {
            channelList.innerHTML = '<div class="channel-loading">未找到频道</div>';
            return;
        }

        renderCategories();
        filterChannels('全部');
    } catch (err) {
        console.error('Load source error:', err);
        channelList.innerHTML = '<div class="channel-loading">加载失败，请尝试其他源<br><small style="color:#999">' + err.message + '</small></div>';
    }
}

// Load custom M3U URL
async function loadCustomM3U() {
    const input = document.getElementById('customM3uUrl');
    const url = input.value.trim();
    if (!url) return;

    localStorage.setItem('customM3uUrl', url);

    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '<div class="channel-loading"><div class="spinner"></div>加载中...</div>';

    try {
        const text = await fetchM3U(url);
        allChannels = parseM3U(text);

        if (allChannels.length === 0) {
            channelList.innerHTML = '<div class="channel-loading">未找到频道</div>';
            return;
        }

        document.getElementById('sourceSelect').value = 'custom';
        renderCategories();
        filterChannels('全部');
    } catch (err) {
        console.error('Custom M3U error:', err);
        channelList.innerHTML = '<div class="channel-loading">加载失败，请检查URL<br><small style="color:#999">' + err.message + '</small></div>';
    }
}

// Get unique categories
function getCategories() {
    const cats = new Set();
    allChannels.forEach(ch => cats.add(ch.group));
    return ['全部', ...Array.from(cats).sort()];
}

// Render category tabs
function renderCategories() {
    const container = document.getElementById('categoryTabs');
    const categories = getCategories();
    container.innerHTML = categories.map(cat =>
        `<button class="category-tab ${cat === '全部' ? 'active' : ''}" onclick="filterChannels('${cat.replace(/'/g, "\\'")}')">${cat}</button>`
    ).join('');
}

// Filter channels by category and search
function filterChannels(category) {
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent === category);
    });

    const searchQuery = (document.getElementById('channelSearch')?.value || '').toLowerCase();

    filteredChannels = allChannels.filter(ch => {
        const matchCategory = category === '全部' || ch.group === category;
        const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery);
        return matchCategory && matchSearch;
    });

    renderChannelList();
}

// Render channel list
function renderChannelList() {
    const container = document.getElementById('channelList');
    if (filteredChannels.length === 0) {
        container.innerHTML = '<div class="channel-loading">没有匹配的频道</div>';
        return;
    }

    container.innerHTML = filteredChannels.map((ch, idx) =>
        `<div class="channel-item ${currentChannel && currentChannel.url === ch.url ? 'active' : ''}" onclick="playChannel(${idx})">
            <span class="channel-name">${ch.name}</span>
            <span class="channel-badge">${ch.group}</span>
        </div>`
    ).join('');
}

// Play a channel
function playChannel(index) {
    const channel = filteredChannels[index];
    if (!channel) return;
    currentChannel = channel;

    renderChannelList();
    document.getElementById('nowPlaying').textContent = channel.name;
    document.getElementById('channelGroup').textContent = channel.group;

    // On mobile, collapse sidebar
    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector('.channel-sidebar');
        sidebar.classList.add('collapsed');
        updateMobileToggle();
    }

    playStream(channel.url);
}

// Play HLS or direct stream
function playStream(url) {
    const video = document.getElementById('liveVideo');
    const emptyState = document.getElementById('emptyState');

    emptyState.style.display = 'none';
    video.style.display = 'block';

    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    if (url.includes('.m3u8') || url.includes('m3u8')) {
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
            });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
            });
            hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('HLS fatal error:', data);
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hlsInstance.startLoad();
                    } else {
                        showPlayerError();
                    }
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.play().catch(() => {});
        } else {
            showPlayerError();
        }
    } else {
        video.src = url;
        video.play().catch(() => {});
    }
}

function showPlayerError() {
    const video = document.getElementById('liveVideo');
    video.style.display = 'none';
    const emptyState = document.getElementById('emptyState');
    emptyState.style.display = 'flex';
    emptyState.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <p>频道加载失败，请尝试其他频道</p>
    `;
}

function onChannelSearch() {
    const activeTab = document.querySelector('.category-tab.active');
    const category = activeTab ? activeTab.textContent : '全部';
    filterChannels(category);
}

function toggleSidebar() {
    const sidebar = document.querySelector('.channel-sidebar');
    sidebar.classList.toggle('collapsed');
    updateMobileToggle();
}

function updateMobileToggle() {
    const sidebar = document.querySelector('.channel-sidebar');
    const toggle = document.getElementById('mobileToggle');
    if (toggle) {
        toggle.textContent = sidebar.classList.contains('collapsed') ? '▼ 展开频道列表' : '▲ 收起频道列表';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('sourceSelect');
    LIVE_TV_SOURCES.forEach((src, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = src.name;
        select.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '自定义M3U';
    select.appendChild(customOpt);

    select.addEventListener('change', () => {
        if (select.value === 'custom') {
            document.getElementById('customM3uSection').classList.remove('hidden');
        } else {
            document.getElementById('customM3uSection').classList.add('hidden');
            currentSourceIndex = parseInt(select.value);
            loadSource(currentSourceIndex);
        }
    });

    const savedUrl = localStorage.getItem('customM3uUrl');
    if (savedUrl) {
        document.getElementById('customM3uUrl').value = savedUrl;
    }

    document.getElementById('channelSearch').addEventListener('input', onChannelSearch);

    // Load default source
    loadSource(0);
});
