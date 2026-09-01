// 首页如意资源最新影视推荐
// 保留旧的 douban* DOM ID 和 localStorage 键，避免破坏已有用户设置。

const RUYI_SOURCE_ID = 'ruyi';
const RUYI_FEED_BATCH_SIZE = 16;
const RUYI_REQUEST_TIMEOUT = 10000;
const RUYI_MAX_REQUEST_ATTEMPTS = 2;
const RUYI_RETRY_BASE_DELAY = 1000;
const RUYI_CACHE_BUCKET_MS = 5 * 60 * 1000;
const RUYI_COVER_HOST_SUFFIX = 'ry-pic.com';

// 如意资源的父分类不会自动包含子分类，因此“全部”使用多个分类流合并排序。
// 伦理片（type_id 34）不会出现在首页推荐中。
const RUYI_CATEGORY_GROUPS = {
    movie: [
        { label: '全部', typeIds: [6, 7, 8, 9, 10, 11, 12, 20, 45, 47] },
        { label: '动作', typeIds: [6] },
        { label: '喜剧', typeIds: [7] },
        { label: '爱情', typeIds: [8] },
        { label: '科幻', typeIds: [9] },
        { label: '恐怖', typeIds: [10] },
        { label: '剧情', typeIds: [11] },
        { label: '战争', typeIds: [12] },
        { label: '纪录片', typeIds: [20] },
        { label: '动画电影', typeIds: [47] }
    ],
    tv: [
        { label: '全部', typeIds: [13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 46] },
        { label: '国产剧', typeIds: [13] },
        { label: '香港剧', typeIds: [14] },
        { label: '台湾剧', typeIds: [21] },
        { label: '韩国剧', typeIds: [15] },
        { label: '日本剧', typeIds: [22] },
        { label: '欧美剧', typeIds: [16] },
        { label: '海外剧', typeIds: [23, 24] },
        { label: '短剧', typeIds: [46] },
        { label: '综艺', typeIds: [25, 26, 27, 28] },
        { label: '动漫', typeIds: [29, 30, 31, 32, 33] }
    ]
};

let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentCategory = RUYI_CATEGORY_GROUPS.movie[0];
let doubanLoading = false;
let doubanNoMore = false;
let doubanObserver = null;
let doubanInitialized = false;
let ruyiFeedGeneration = 0;
let ruyiStreams = [];
let ruyiSeenVodIds = new Set();

function getCurrentRuyiCategories() {
    return RUYI_CATEGORY_GROUPS[doubanMovieTvCurrentSwitch];
}

function createRuyiStreams(category) {
    return category.typeIds.map(typeId => ({
        typeId,
        nextPage: 1,
        pageCount: Infinity,
        queue: [],
        noMore: false,
        pendingRequest: null,
        consecutiveFailures: 0,
        retryAfter: 0
    }));
}

function resetRuyiFeed(category = getCurrentRuyiCategories()[0]) {
    ruyiFeedGeneration += 1;
    doubanCurrentCategory = category;
    ruyiStreams = createRuyiStreams(category);
    ruyiSeenVodIds = new Set();
    doubanLoading = false;
    doubanNoMore = false;
    removeDoubanSentinel();

    const container = document.getElementById('douban-results');
    if (container) container.innerHTML = '';
}

function syncRecommendationToggle(toggle) {
    if (!toggle) return;

    const enabled = localStorage.getItem('doubanEnabled') === 'true';
    toggle.checked = enabled;

    const toggleBg = toggle.nextElementSibling;
    const toggleDot = toggleBg?.nextElementSibling;
    toggleBg?.classList.toggle('bg-indigo-600', enabled);
    toggleDot?.classList.toggle('translate-x-6', enabled);
}

function initDouban() {
    const doubanToggle = document.getElementById('doubanToggle');

    if (!doubanInitialized) {
        doubanInitialized = true;
        resetRuyiFeed();
        renderDoubanMovieTvSwitch();

        doubanToggle?.addEventListener('change', event => {
            localStorage.setItem('doubanEnabled', String(event.target.checked));
            syncRecommendationToggle(event.target);
            updateDoubanVisibility();
        });
    }

    syncRecommendationToggle(doubanToggle);
    renderDoubanTags();
    updateDoubanVisibility();
}

function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    const container = document.getElementById('douban-results');
    if (!doubanArea || !container) return;

    const enabled = localStorage.getItem('doubanEnabled') === 'true';
    const resultsArea = document.getElementById('resultsArea');
    const isSearching = resultsArea && !resultsArea.classList.contains('hidden');

    if (enabled && !isSearching) {
        doubanArea.classList.remove('hidden');
        if (container.children.length === 0 && !doubanLoading) {
            renderRecommend();
        }
    } else {
        doubanArea.classList.add('hidden');
    }
}

async function fillAndSearchWithRuyi(title) {
    if (!title) return;

    if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes(RUYI_SOURCE_ID)) {
        const ruyiCheckbox = document.getElementById('api_ruyi');
        if (ruyiCheckbox) {
            ruyiCheckbox.checked = true;
            if (typeof updateSelectedAPIs === 'function') {
                updateSelectedAPIs();
            }
        } else {
            selectedAPIs.push(RUYI_SOURCE_ID);
            localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
            const countEl = document.getElementById('selectedApiCount');
            if (countEl) countEl.textContent = selectedAPIs.length;
        }
        if (typeof showToast === 'function') {
            showToast('已自动选择如意资源', 'info');
        }
    }

    const input = document.getElementById('searchInput');
    if (!input) return;

    input.value = title;
    await search();

    if (window.innerWidth <= 768) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function updateMovieTvToggleStyles() {
    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');
    if (!movieToggle || !tvToggle) return;

    const movieSelected = doubanMovieTvCurrentSwitch === 'movie';
    movieToggle.classList.toggle('bg-indigo-600', movieSelected);
    movieToggle.classList.toggle('text-white', movieSelected);
    movieToggle.classList.toggle('text-gray-600', !movieSelected);
    tvToggle.classList.toggle('bg-indigo-600', !movieSelected);
    tvToggle.classList.toggle('text-white', !movieSelected);
    tvToggle.classList.toggle('text-gray-600', movieSelected);
}

function renderDoubanMovieTvSwitch() {
    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');
    if (!movieToggle || !tvToggle) return;

    const switchFeed = type => {
        if (doubanMovieTvCurrentSwitch === type) return;

        doubanMovieTvCurrentSwitch = type;
        updateMovieTvToggleStyles();
        resetRuyiFeed(getCurrentRuyiCategories()[0]);
        renderDoubanTags();

        if (localStorage.getItem('doubanEnabled') === 'true') {
            renderRecommend();
        }
    };

    movieToggle.addEventListener('click', () => switchFeed('movie'));
    tvToggle.addEventListener('click', () => switchFeed('tv'));
    updateMovieTvToggleStyles();
}

function renderDoubanTags() {
    const tagContainer = document.getElementById('douban-tags');
    if (!tagContainer) return;

    tagContainer.innerHTML = '';
    getCurrentRuyiCategories().forEach(category => {
        const button = document.createElement('button');
        const selected = category === doubanCurrentCategory;
        button.type = 'button';
        button.className = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 border ' +
            (selected
                ? 'bg-indigo-600 text-white shadow-md border-indigo-600'
                : 'bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 border-[#e5e4de] hover:border-indigo-400');
        button.textContent = category.label;

        button.addEventListener('click', () => {
            if (category === doubanCurrentCategory) return;
            resetRuyiFeed(category);
            renderDoubanTags();
            if (localStorage.getItem('doubanEnabled') === 'true') {
                renderRecommend();
            }
        });

        tagContainer.appendChild(button);
    });
}

function setupDoubanSentinel() {
    if (doubanNoMore) return;

    const container = document.getElementById('douban-results');
    if (!container) return;

    removeDoubanSentinel();
    const sentinel = document.createElement('div');
    sentinel.id = 'douban-scroll-sentinel';
    sentinel.className = 'col-span-full h-4';
    container.appendChild(sentinel);

    doubanObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !doubanLoading && !doubanNoMore) {
            renderRecommend(true);
        }
    }, { rootMargin: '200px' });
    doubanObserver.observe(sentinel);
}

function removeDoubanSentinel() {
    if (doubanObserver) {
        doubanObserver.disconnect();
        doubanObserver = null;
    }
    document.getElementById('douban-scroll-sentinel')?.remove();
}

function getRuyiTimestamp(item) {
    const rawTime = String(item?.vod_time || '').trim();
    if (!rawTime) return 0;
    const timestamp = Date.parse(rawTime.replace(' ', 'T'));
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compareRuyiItemsNewestFirst(left, right) {
    const timeDifference = getRuyiTimestamp(right) - getRuyiTimestamp(left);
    if (timeDifference !== 0) return timeDifference;
    return Number(right?.vod_id || 0) - Number(left?.vod_id || 0);
}

function waitForRuyiRetry(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function fetchRuyiStreamPage(stream, generation) {
    if (stream.noMore || generation !== ruyiFeedGeneration) return;
    if (stream.pendingRequest) return stream.pendingRequest;

    const request = (async () => {
        let lastError = null;

        for (let attempt = 1; attempt <= RUYI_MAX_REQUEST_ATTEMPTS; attempt += 1) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), RUYI_REQUEST_TIMEOUT);

            try {
                const target = new URL(API_SITES[RUYI_SOURCE_ID].api);
                target.searchParams.set('ac', 'videolist');
                target.searchParams.set('t', String(stream.typeId));
                target.searchParams.set('pg', String(stream.nextPage));
                // Cloudflare 的代理缓存默认较长；时间桶让“最新”列表最多延迟约五分钟。
                target.searchParams.set('_latest', String(Math.floor(Date.now() / RUYI_CACHE_BUCKET_MS)));

                const proxyPath = PROXY_URL + encodeURIComponent(target.toString());
                const requestUrl = window.ProxyAuth?.addAuthToProxyUrl
                    ? await window.ProxyAuth.addAuthToProxyUrl(proxyPath)
                    : proxyPath;
                const response = await fetch(requestUrl, {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });

                if (!response.ok) {
                    throw new Error(`如意资源请求失败 (${response.status})`);
                }

                const data = await response.json();
                if (generation !== ruyiFeedGeneration) return;

                const items = Array.isArray(data?.list) ? data.list.slice() : [];
                items.sort(compareRuyiItemsNewestFirst);
                stream.queue.push(...items);

                const returnedPage = Number(data?.page || stream.nextPage);
                stream.pageCount = Number(data?.pagecount || returnedPage || 1);
                stream.nextPage = returnedPage + 1;
                stream.consecutiveFailures = 0;
                stream.retryAfter = 0;
                if (items.length === 0 || returnedPage >= stream.pageCount) {
                    stream.noMore = true;
                }
                return;
            } catch (error) {
                lastError = error;
                if (generation !== ruyiFeedGeneration) return;
                if (attempt < RUYI_MAX_REQUEST_ATTEMPTS) {
                    await waitForRuyiRetry(RUYI_RETRY_BASE_DELAY * attempt);
                }
            } finally {
                clearTimeout(timeoutId);
            }
        }

        stream.consecutiveFailures += 1;
        stream.retryAfter = Date.now() + Math.min(
            30000,
            RUYI_RETRY_BASE_DELAY * (2 ** (stream.consecutiveFailures - 1))
        );
        throw lastError || new Error('如意资源请求失败');
    })();

    stream.pendingRequest = request;
    try {
        return await request;
    } finally {
        if (stream.pendingRequest === request) {
            stream.pendingRequest = null;
        }
    }
}

async function refillEmptyRuyiStreams(generation, attemptedStreams) {
    const now = Date.now();
    const streamsToRefill = ruyiStreams.filter(stream =>
        stream.queue.length === 0 &&
        !stream.noMore &&
        stream.retryAfter <= now &&
        !attemptedStreams.has(stream)
    );
    streamsToRefill.forEach(stream => attemptedStreams.add(stream));

    await Promise.all(streamsToRefill.map(async stream => {
        try {
            await fetchRuyiStreamPage(stream, generation);
        } catch (error) {
            console.warn(`如意资源分类 ${stream.typeId} 暂时加载失败:`, error);
        }
    }));
}

async function takeLatestRuyiItems(limit, generation) {
    const items = [];
    const attemptedStreams = new Set();

    while (items.length < limit && generation === ruyiFeedGeneration) {
        await refillEmptyRuyiStreams(generation, attemptedStreams);
        if (generation !== ruyiFeedGeneration) return [];

        const availableStreams = ruyiStreams.filter(stream => stream.queue.length > 0);
        if (availableStreams.length === 0) break;

        let newestStream = availableStreams[0];
        for (let index = 1; index < availableStreams.length; index += 1) {
            if (compareRuyiItemsNewestFirst(availableStreams[index].queue[0], newestStream.queue[0]) < 0) {
                newestStream = availableStreams[index];
            }
        }

        const item = newestStream.queue.shift();
        const itemKey = String(item?.vod_id || `${item?.vod_name || ''}:${item?.vod_time || ''}`);
        if (ruyiSeenVodIds.has(itemKey)) continue;

        ruyiSeenVodIds.add(itemKey);
        items.push(item);
    }

    return items;
}

function hasMoreRuyiItems() {
    return ruyiStreams.some(stream => stream.queue.length > 0 || !stream.noMore);
}

function formatRuyiDate(rawTime) {
    const match = String(rawTime || '').match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '最近更新';
}

function normalizeCoverUrl(rawUrl) {
    if (!rawUrl) return null;
    const normalized = String(rawUrl).trim().replace(/^\/\//, 'https://');

    try {
        const parsed = new URL(normalized);
        const hostname = parsed.hostname.toLowerCase();
        const trustedHost = hostname === RUYI_COVER_HOST_SUFFIX ||
            hostname.endsWith(`.${RUYI_COVER_HOST_SUFFIX}`);
        if (!trustedHost || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
            return null;
        }

        parsed.protocol = 'https:';
        return parsed.toString();
    } catch {
        return null;
    }
}

function getRuyiCoverUrl(rawUrl) {
    // 图片直接从如意的受信 CDN 加载，不把供应商控制的 URL 交给服务端代理。
    return normalizeCoverUrl(rawUrl) || 'image/nomedia.png';
}

async function renderRuyiCards(items, container, append, generation) {
    const fragment = document.createDocumentFragment();
    const coverUrls = items.map(item => getRuyiCoverUrl(item.vod_pic));

    if (generation !== ruyiFeedGeneration) return;

    items.forEach((item, index) => {
        const title = String(item.vod_name || '未命名影片');
        const card = document.createElement('article');
        card.className = 'bg-[#f5f4ee] hover:bg-[#eae9e3] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg';

        const posterButton = document.createElement('button');
        posterButton.type = 'button';
        posterButton.className = 'relative w-full aspect-[2/3] overflow-hidden cursor-pointer text-left';
        posterButton.setAttribute('aria-label', `搜索 ${title}`);
        posterButton.addEventListener('click', () => fillAndSearchWithRuyi(title));

        const image = document.createElement('img');
        image.src = coverUrls[index];
        image.alt = title;
        image.className = 'w-full h-full object-cover transition-transform duration-500 hover:scale-110';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => {
            image.src = 'image/nomedia.png';
            image.classList.add('object-contain');
        }, { once: true });

        const gradient = document.createElement('span');
        gradient.className = 'absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60 pointer-events-none';

        const dateBadge = document.createElement('span');
        dateBadge.className = 'absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm';
        dateBadge.textContent = formatRuyiDate(item.vod_time);

        const sourceBadge = document.createElement('span');
        sourceBadge.className = 'absolute top-2 right-2 bg-indigo-600/90 text-white text-xs px-2 py-1 rounded-sm';
        sourceBadge.textContent = item.type_name || '如意资源';

        posterButton.append(image, gradient, dateBadge, sourceBadge);

        const cardBody = document.createElement('div');
        cardBody.className = 'p-2 text-center bg-[#f5f4ee]';

        const titleButton = document.createElement('button');
        titleButton.type = 'button';
        titleButton.className = 'text-sm font-medium text-gray-800 truncate w-full hover:text-indigo-400 transition';
        titleButton.textContent = title;
        titleButton.title = item.vod_remarks ? `${title} · ${item.vod_remarks}` : title;
        titleButton.addEventListener('click', () => fillAndSearchWithRuyi(title));

        cardBody.appendChild(titleButton);
        card.append(posterButton, cardBody);
        fragment.appendChild(card);
    });

    if (!append) container.innerHTML = '';
    container.appendChild(fragment);
}

function renderRuyiRetry(container, append) {
    document.getElementById('ruyi-retry-indicator')?.remove();
    if (!append) container.innerHTML = '';

    const status = document.createElement('div');
    status.id = 'ruyi-retry-indicator';
    status.className = 'col-span-full flex flex-col items-center justify-center gap-3 py-6 text-sm text-gray-500';

    const message = document.createElement('span');
    message.textContent = '部分如意资源暂时加载失败';

    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors';
    retryButton.textContent = '重试';
    retryButton.addEventListener('click', () => {
        status.remove();
        ruyiStreams.forEach(stream => {
            stream.retryAfter = 0;
        });
        renderRecommend(append);
    });

    status.append(message, retryButton);
    container.appendChild(status);
}

async function renderRecommend(append = false) {
    const container = document.getElementById('douban-results');
    if (!container || doubanLoading || doubanNoMore) return;

    const generation = ruyiFeedGeneration;
    doubanLoading = true;
    removeDoubanSentinel();
    document.getElementById('ruyi-retry-indicator')?.remove();

    const loadingEl = document.createElement('div');
    loadingEl.id = 'douban-loading-indicator';
    loadingEl.className = 'col-span-full flex items-center justify-center py-6';
    loadingEl.innerHTML = `
        <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block"></div>
        <span class="text-indigo-500 ml-4">正在加载如意资源最新内容...</span>
    `;

    if (!append) container.innerHTML = '';
    container.appendChild(loadingEl);

    try {
        const items = await takeLatestRuyiItems(RUYI_FEED_BATCH_SIZE, generation);
        if (generation !== ruyiFeedGeneration) return;

        loadingEl.remove();
        if (items.length === 0) {
            const canRetry = hasMoreRuyiItems();
            doubanNoMore = !canRetry;

            if (canRetry) {
                renderRuyiRetry(container, append);
            } else if (!append) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <div class="text-indigo-500">暂无如意资源内容</div>
                    </div>
                `;
            }
            return;
        }

        await renderRuyiCards(items, container, append, generation);
        if (generation !== ruyiFeedGeneration) return;

        doubanNoMore = !hasMoreRuyiItems();
        doubanLoading = false;
        if (!doubanNoMore) setupDoubanSentinel();
    } catch (error) {
        if (generation !== ruyiFeedGeneration) return;

        console.error('获取如意资源最新内容失败:', error);
        loadingEl.remove();
        renderRuyiRetry(container, append);
    } finally {
        if (generation === ruyiFeedGeneration) {
            doubanLoading = false;
        }
    }
}

function resetToHome() {
    resetSearchArea();
    updateDoubanVisibility();
}

document.addEventListener('DOMContentLoaded', initDouban);
