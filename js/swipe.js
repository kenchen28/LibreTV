// Swipe Video App — TikTok-style vertical video feed
// Uses existing 苹果CMS video APIs to fetch popular content with m3u8 streams

const SWIPE_APIS = [
    { api: 'https://bfzyapi.com/api.php/provide/vod', name: '暴风' },
    { api: 'https://json.heimuer.xyz/api.php/provide/vod', name: '黑木耳' },
    { api: 'https://tyyszy.com/api.php/provide/vod', name: '天涯' },
    { api: 'https://cj.rycjapi.com/api.php/provide/vod', name: '如意' },
];

let videos = [];          // loaded video items
let currentIndex = 0;     // currently visible slide
let loading = false;
let currentPage = 1;
let currentType = '';      // category type filter
let currentHours = 72;     // time window
let isMuted = true;        // start muted for autoplay
let touchStartY = 0;
let touchDeltaY = 0;
let isSwiping = false;
let hlsInstances = {};     // track HLS instances per slide
let hintShown = false;

const container = document.getElementById('swipeContainer');

// Use proxy on production (HTTPS) to avoid CORS
function proxyUrl(url) {
    if (window.location.protocol === 'https:') {
        return '/proxy/' + encodeURIComponent(url);
    }
    return url;
}

// ── Fetch videos from APIs ──

async function fetchVideos(page = 1) {
    if (loading) return;
    loading = true;

    try {
        // Try multiple APIs for more content
        const shuffled = [...SWIPE_APIS].sort(() => Math.random() - 0.5);
        let allValid = [];

        // Fetch from up to 2 APIs in parallel
        const fetches = shuffled.slice(0, 2).map(async (src) => {
            try {
                let url = `${src.api}?ac=videolist&pg=${page}`;
                if (currentType) url += `&t=${currentType}`;
                if (currentHours) url += `&h=${currentHours}`;

                const resp = await fetch(proxyUrl(url), { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) return [];
                const data = await resp.json();
                if (!data.list || !data.list.length) return [];

                return data.list.filter(v => {
                    const playUrl = v.vod_play_url || '';
                    return playUrl.includes('.m3u8');
                }).map(v => {
                    const parts = v.vod_play_url.split('$$$')[0];
                    const episodes = parts.split('#');
                    const firstEp = episodes[0] || '';
                    const urlPart = firstEp.split('$');
                    const m3u8 = urlPart.length > 1 ? urlPart[1] : urlPart[0];
                    return {
                        id: v.vod_id,
                        name: v.vod_name,
                        pic: v.vod_pic || '',
                        type: v.type_name || '',
                        year: v.vod_year || '',
                        remarks: v.vod_remarks || '',
                        area: v.vod_area || '',
                        m3u8: m3u8,
                        source: src.name,
                    };
                }).filter(v => v.m3u8 && v.m3u8.startsWith('http'));
            } catch { return []; }
        });

        const results = await Promise.all(fetches);
        results.forEach(r => allValid.push(...r));

        // Deduplicate by name
        const seen = new Set();
        allValid = allValid.filter(v => {
            if (seen.has(v.name)) return false;
            seen.add(v.name);
            return true;
        });

        // Shuffle for variety
        allValid.sort(() => Math.random() - 0.5);

        // If no results and we had a time filter, retry without it
        if (allValid.length === 0 && currentHours && page === 1) {
            currentHours = 0;
            loading = false;
            return fetchVideos(1);
        }

        videos = videos.concat(allValid);
        currentPage = page;

        // If this is the first load, render initial slides
        if (currentIndex === 0 && container.children.length === 0 && videos.length > 0) {
            renderSlide(0);
            if (videos.length > 1) renderSlide(1);
            playSlide(0);
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
    loading = false;
}

// ── Render a slide ──

function renderSlide(index) {
    if (index < 0 || index >= videos.length) return;
    const v = videos[index];

    const slide = document.createElement('div');
    slide.className = 'swipe-slide';
    slide.dataset.index = index;
    slide.style.transform = `translateY(${(index - currentIndex) * 100}%)`;

    slide.innerHTML = `
        <div class="slide-loading"><div class="slide-spinner"></div></div>
        <video playsinline preload="metadata" loop poster="${v.pic}" muted></video>
        <div class="slide-overlay">
            <div class="slide-title">${v.name}</div>
            <div class="slide-meta">
                ${v.type ? `<span>${v.type}</span>` : ''}
                ${v.year ? `<span>${v.year}</span>` : ''}
                ${v.area ? `<span>${v.area}</span>` : ''}
                ${v.remarks ? `<span>${v.remarks}</span>` : ''}
                <span>${v.source}</span>
            </div>
        </div>
        <div class="slide-actions">
            <div class="action-btn" onclick="toggleMute()">
                <svg id="muteIcon${index}" fill="currentColor" viewBox="0 0 24 24">
                    ${isMuted ? muteIconSVG : volumeIconSVG}
                </svg>
                <span>${isMuted ? '静音' : '有声'}</span>
            </div>
            <div class="action-btn" onclick="openInPlayer('${encodeURIComponent(v.m3u8)}', '${encodeURIComponent(v.name)}')">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                <span>播放器</span>
            </div>
            <div class="action-btn" onclick="skipVideo()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                <span>跳过</span>
            </div>
        </div>
        <div class="slide-progress"><div class="slide-progress-bar" id="progress${index}"></div></div>
        <div class="play-indicator" id="playInd${index}">
            <svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
    `;

    container.appendChild(slide);

    // Tap to pause/play
    const video = slide.querySelector('video');
    video.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlayPause(index);
    });

    // Progress update
    video.addEventListener('timeupdate', () => {
        const bar = document.getElementById(`progress${index}`);
        if (bar && video.duration) {
            bar.style.width = `${(video.currentTime / video.duration) * 100}%`;
        }
    });

    // Error handling
    video.addEventListener('error', () => {
        const loader = slide.querySelector('.slide-loading');
        if (loader) {
            loader.innerHTML = `<div class="slide-error">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p>视频加载失败</p>
            </div>`;
        }
    });

    return slide;
}

// ── Play a slide's video ──

function playSlide(index) {
    const slide = container.querySelector(`[data-index="${index}"]`);
    if (!slide) return;
    const video = slide.querySelector('video');
    if (!video) return;

    const v = videos[index];
    video.muted = isMuted;

    // Setup HLS if needed
    if (v.m3u8.includes('.m3u8')) {
        if (Hls.isSupported()) {
            // Destroy old instance if exists
            if (hlsInstances[index]) {
                hlsInstances[index].destroy();
            }
            const hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
            });
            hls.loadSource(v.m3u8);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
                hideLoading(slide);
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    hideLoading(slide);
                    showSlideError(slide);
                }
            });
            hlsInstances[index] = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari native HLS
            video.src = v.m3u8;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(() => {});
                hideLoading(slide);
            }, { once: true });
        }
    } else {
        video.src = v.m3u8;
        video.play().catch(() => {});
        hideLoading(slide);
    }
}

function stopSlide(index) {
    const slide = container.querySelector(`[data-index="${index}"]`);
    if (!slide) return;
    const video = slide.querySelector('video');
    if (video) {
        video.pause();
        video.currentTime = 0;
    }
    if (hlsInstances[index]) {
        hlsInstances[index].destroy();
        delete hlsInstances[index];
    }
}

function hideLoading(slide) {
    const loader = slide.querySelector('.slide-loading');
    if (loader) loader.style.display = 'none';
}

function showSlideError(slide) {
    const loader = slide.querySelector('.slide-loading');
    if (loader) {
        loader.style.display = '';
        loader.innerHTML = `<div class="slide-error">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p>视频加载失败，上滑跳过</p>
        </div>`;
    }
}

// ── Swipe navigation ──

function goToSlide(newIndex) {
    if (newIndex < 0 || newIndex >= videos.length || newIndex === currentIndex) return;

    const oldIndex = currentIndex;
    currentIndex = newIndex;

    // Stop old video
    stopSlide(oldIndex);

    // Ensure current and adjacent slides exist
    if (!container.querySelector(`[data-index="${currentIndex}"]`)) {
        renderSlide(currentIndex);
    }
    if (currentIndex + 1 < videos.length && !container.querySelector(`[data-index="${currentIndex + 1}"]`)) {
        renderSlide(currentIndex + 1);
    }

    // Update transforms
    container.querySelectorAll('.swipe-slide').forEach(s => {
        const idx = parseInt(s.dataset.index);
        s.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        s.style.transform = `translateY(${(idx - currentIndex) * 100}%)`;
    });

    // Play new slide
    playSlide(currentIndex);

    // Clean up far-away slides (keep ±2)
    container.querySelectorAll('.swipe-slide').forEach(s => {
        const idx = parseInt(s.dataset.index);
        if (Math.abs(idx - currentIndex) > 2) {
            if (hlsInstances[idx]) {
                hlsInstances[idx].destroy();
                delete hlsInstances[idx];
            }
            s.remove();
        }
    });

    // Prefetch more when near the end
    if (currentIndex >= videos.length - 3) {
        fetchVideos(currentPage + 1);
    }

    // Hide hint after first swipe
    if (!hintShown) {
        hintShown = true;
        const hint = document.getElementById('swipeHint');
        if (hint) hint.style.display = 'none';
    }
}

// ── Touch handling ──

container.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchDeltaY = 0;
    isSwiping = true;

    // Remove transition during drag
    container.querySelectorAll('.swipe-slide').forEach(s => {
        s.style.transition = 'none';
    });
}, { passive: true });

container.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    touchDeltaY = e.touches[0].clientY - touchStartY;

    // Move slides with finger
    container.querySelectorAll('.swipe-slide').forEach(s => {
        const idx = parseInt(s.dataset.index);
        const baseY = (idx - currentIndex) * window.innerHeight;
        s.style.transform = `translateY(${baseY + touchDeltaY}px)`;
    });
}, { passive: true });

container.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;

    const threshold = window.innerHeight * 0.15;

    if (touchDeltaY < -threshold && currentIndex < videos.length - 1) {
        goToSlide(currentIndex + 1);
    } else if (touchDeltaY > threshold && currentIndex > 0) {
        goToSlide(currentIndex - 1);
    } else {
        // Snap back
        container.querySelectorAll('.swipe-slide').forEach(s => {
            const idx = parseInt(s.dataset.index);
            s.style.transition = 'transform 0.3s ease';
            s.style.transform = `translateY(${(idx - currentIndex) * 100}%)`;
        });
    }
}, { passive: true });

// ── Mouse wheel (desktop) ──

let wheelTimeout = null;
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelTimeout) return;
    wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 600);

    if (e.deltaY > 30) {
        goToSlide(currentIndex + 1);
    } else if (e.deltaY < -30) {
        goToSlide(currentIndex - 1);
    }
}, { passive: false });

// ── Keyboard ──

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        goToSlide(currentIndex + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToSlide(currentIndex - 1);
    } else if (e.key === 'm') {
        toggleMute();
    }
});

// ── Actions ──

function togglePlayPause(index) {
    const slide = container.querySelector(`[data-index="${index}"]`);
    if (!slide) return;
    const video = slide.querySelector('video');
    if (!video) return;

    const ind = document.getElementById(`playInd${index}`);

    if (video.paused) {
        video.play().catch(() => {});
        if (ind) {
            ind.innerHTML = '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            ind.classList.add('show');
            setTimeout(() => ind.classList.remove('show'), 500);
        }
    } else {
        video.pause();
        if (ind) {
            ind.innerHTML = '<svg fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            ind.classList.add('show');
            setTimeout(() => ind.classList.remove('show'), 500);
        }
    }
}

const muteIconSVG = '<path d="M5.889 16H2a1 1 0 01-1-1V9a1 1 0 011-1h3.889l5.294-4.332a.5.5 0 01.817.387v15.89a.5.5 0 01-.817.387L5.89 16z"/><path d="M16 9l6 6m0-6l-6 6" stroke="currentColor" stroke-width="2" fill="none"/>';
const volumeIconSVG = '<path d="M5.889 16H2a1 1 0 01-1-1V9a1 1 0 011-1h3.889l5.294-4.332a.5.5 0 01.817.387v15.89a.5.5 0 01-.817.387L5.89 16z"/><path d="M17 8c1.5 1.5 1.5 6.5 0 8M20 5c3 3 3 11 0 14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>';

function toggleMute() {
    isMuted = !isMuted;

    // Update all videos
    container.querySelectorAll('video').forEach(v => {
        v.muted = isMuted;
    });

    // Update icons
    container.querySelectorAll('[id^="muteIcon"]').forEach(icon => {
        icon.innerHTML = isMuted ? muteIconSVG : volumeIconSVG;
    });

    // Update labels
    container.querySelectorAll('.action-btn:first-child span').forEach(s => {
        s.textContent = isMuted ? '静音' : '有声';
    });
}

function openInPlayer(encodedUrl, encodedName) {
    const url = decodeURIComponent(encodedUrl);
    const name = decodeURIComponent(encodedName);
    window.open(`/player.html?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`, '_blank');
}

function skipVideo() {
    goToSlide(currentIndex + 1);
}

// ── Category tabs ──

document.getElementById('categoryTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.swipe-tab');
    if (!tab) return;

    // Update active state
    document.querySelectorAll('.swipe-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Reset and reload
    currentType = tab.dataset.type;
    currentHours = parseInt(tab.dataset.h) || 72;
    currentPage = 1;
    videos = [];
    currentIndex = 0;

    // Cleanup
    Object.values(hlsInstances).forEach(h => h.destroy());
    hlsInstances = {};
    container.innerHTML = '';

    fetchVideos(1);
});

// ── Init ──

fetchVideos(1);
