// Comic/Manga Reader Module — powered by MangaDex API
// https://api.mangadex.org/docs/

const MANGADEX_API = 'https://api.mangadex.org';
const MANGADEX_COVERS = 'https://uploads.mangadex.org/covers';

// On production (HTTPS), use our proxy to avoid CORS issues.
// On localhost (HTTP), MangaDex allows direct access.
function apiBase() {
    if (window.location.protocol === 'https:') return '/manga';
    return MANGADEX_API;
}

let currentManga = null;
let chapters = [];
let currentChapterIndex = -1;
let currentLang = 'en';

// ── Helpers ──

function getCoverUrl(manga) {
    const cover = (manga.relationships || []).find(r => r.type === 'cover_art');
    if (cover && cover.attributes && cover.attributes.fileName) {
        return `${MANGADEX_COVERS}/${manga.id}/${cover.attributes.fileName}.256.jpg`;
    }
    return 'image/nomedia.png';
}

function getMangaTitle(manga) {
    const t = manga.attributes.title;
    return t[currentLang] || t['ja-ro'] || t['ja'] || t['en'] || t['zh'] || t['ko'] || Object.values(t)[0] || 'Unknown';
}

function getMangaDesc(manga) {
    const d = manga.attributes.description || {};
    return d[currentLang] || d['en'] || d['zh'] || d['ja'] || Object.values(d)[0] || '';
}

async function mdFetch(path) {
    const res = await fetch(`${apiBase()}${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// ── Trending / Popular ──

async function loadTrending() {
    const container = document.getElementById('trendingList');
    try {
        const data = await mdFetch(
            `/manga?limit=20&includes[]=cover_art&order[followedCount]=desc` +
            `&contentRating[]=safe&contentRating[]=suggestive` +
            `&availableTranslatedLanguage[]=${currentLang}`
        );
        container.innerHTML = data.data.map(m => `
            <div class="trending-item" onclick="selectManga('${m.id}')">
                <img src="${getCoverUrl(m)}" alt="" loading="lazy" onerror="this.src='image/nomedia.png'">
                <div class="trending-name">${getMangaTitle(m)}</div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div style="color:#999;font-size:12px;padding:8px">加载失败</div>';
    }
}

// ── Search ──

async function searchManga() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    const list = document.getElementById('mangaList');
    list.innerHTML = '<div class="reader-loading"><div class="comic-spinner"></div>搜索中...</div>';

    try {
        const data = await mdFetch(
            `/manga?title=${encodeURIComponent(q)}&limit=20&includes[]=cover_art` +
            `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica` +
            `&order[relevance]=desc`
        );
        renderMangaList(data.data);
    } catch (e) {
        list.innerHTML = `<div class="reader-loading">搜索失败: ${e.message}</div>`;
    }
}

function renderMangaList(mangas) {
    const list = document.getElementById('mangaList');
    if (!mangas.length) {
        list.innerHTML = '<div class="reader-loading">没有找到漫画</div>';
        return;
    }
    list.innerHTML = mangas.map(m => {
        const title = getMangaTitle(m);
        const desc = getMangaDesc(m).substring(0, 80);
        const cover = getCoverUrl(m);
        const status = m.attributes.status || '';
        const year = m.attributes.year || '';
        return `
        <div class="manga-card ${currentManga && currentManga.id === m.id ? 'active' : ''}" onclick="selectManga('${m.id}')">
            <img class="manga-cover" src="${cover}" alt="" loading="lazy" onerror="this.src='image/nomedia.png'">
            <div class="manga-info">
                <div class="manga-title">${title}</div>
                <div class="manga-desc">${desc}</div>
                <div class="manga-tags">
                    ${year ? `<span class="manga-tag">${year}</span>` : ''}
                    ${status ? `<span class="manga-tag">${status}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

// ── Select manga → load chapters ──

async function selectManga(mangaId) {
    const chapterBar = document.getElementById('chapterBar');
    const reader = document.getElementById('readerArea');
    chapterBar.style.display = 'flex';
    reader.className = 'reader-area empty';
    reader.innerHTML = '<div class="reader-loading"><div class="comic-spinner"></div>加载章节列表...</div>';

    // Collapse sidebar on mobile
    if (window.innerWidth <= 768) {
        document.getElementById('comicSidebar').classList.add('collapsed');
        updateMobileToggle();
    }

    try {
        // Fetch manga details
        const mangaData = await mdFetch(`/manga/${mangaId}?includes[]=cover_art&includes[]=author`);
        currentManga = mangaData.data;

        // Fetch all chapters for selected language
        chapters = [];
        let offset = 0;
        const limit = 100;
        while (true) {
            const chData = await mdFetch(
                `/manga/${mangaId}/feed?translatedLanguage[]=${currentLang}` +
                `&limit=${limit}&offset=${offset}` +
                `&order[chapter]=asc&order[volume]=asc` +
                `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`
            );
            chapters = chapters.concat(chData.data);
            if (offset + limit >= chData.total) break;
            offset += limit;
        }

        // Deduplicate by chapter number (keep first)
        const seen = new Set();
        chapters = chapters.filter(ch => {
            const num = ch.attributes.chapter || ch.id;
            if (seen.has(num)) return false;
            seen.add(num);
            return true;
        });

        if (!chapters.length) {
            reader.innerHTML = `<div class="reader-loading">该语言暂无章节<br><small style="color:#999">尝试切换语言</small></div>`;
            return;
        }

        // Populate chapter select
        const sel = document.getElementById('chapterSelect');
        sel.innerHTML = chapters.map((ch, i) => {
            const num = ch.attributes.chapter || '?';
            const vol = ch.attributes.volume ? `Vol.${ch.attributes.volume} ` : '';
            const title = ch.attributes.title ? ` - ${ch.attributes.title}` : '';
            return `<option value="${i}">${vol}第${num}话${title}</option>`;
        }).join('');

        // Load first chapter
        loadChapter(0);

        // Update manga list highlight
        renderMangaListHighlight();
    } catch (e) {
        reader.innerHTML = `<div class="reader-loading">加载失败: ${e.message}</div>`;
    }
}

function renderMangaListHighlight() {
    document.querySelectorAll('.manga-card').forEach(card => {
        card.classList.remove('active');
    });
}

// ── Load chapter pages ──

async function loadChapter(index) {
    index = parseInt(index);
    currentChapterIndex = index;
    const ch = chapters[index];
    if (!ch) return;

    const reader = document.getElementById('readerArea');
    reader.className = 'reader-area empty';
    reader.innerHTML = '<div class="reader-loading"><div class="comic-spinner"></div>加载页面...</div>';

    // Update select
    document.getElementById('chapterSelect').value = index;

    // Update nav buttons
    document.getElementById('prevChBtn').disabled = index <= 0;
    document.getElementById('nextChBtn').disabled = index >= chapters.length - 1;

    try {
        const data = await fetch(`${apiBase()}/at-home/server/${ch.id}`).then(r => r.json());

        if (data.result === 'error') {
            reader.innerHTML = `<div class="reader-loading">章节不可用<br><small style="color:#999">${data.errors?.[0]?.detail || '未知错误'}</small></div>`;
            return;
        }

        const baseUrl = data.baseUrl;
        const hash = data.chapter.hash;
        // Prefer data-saver for faster loading, fall back to full quality
        const pages = data.chapter.dataSaver.length ? data.chapter.dataSaver : data.chapter.data;
        const quality = data.chapter.dataSaver.length ? 'data-saver' : 'data';

        if (!pages.length) {
            reader.innerHTML = '<div class="reader-loading">该章节暂无页面</div>';
            return;
        }

        reader.className = 'reader-area';
        reader.innerHTML = pages.map((p, i) =>
            `<img src="${baseUrl}/${quality}/${hash}/${p}" alt="Page ${i + 1}" loading="lazy" onerror="this.style.display='none'">`
        ).join('');

        reader.scrollTop = 0;
    } catch (e) {
        reader.innerHTML = `<div class="reader-loading">加载失败: ${e.message}</div>`;
    }
}

function prevChapter() {
    if (currentChapterIndex > 0) loadChapter(currentChapterIndex - 1);
}

function nextChapter() {
    if (currentChapterIndex < chapters.length - 1) loadChapter(currentChapterIndex + 1);
}

// ── Language change ──

function onLangChange() {
    currentLang = document.getElementById('langSelect').value;
    loadTrending();
    if (currentManga) selectManga(currentManga.id);
}

// ── Sidebar toggle ──

function toggleSidebar() {
    const sidebar = document.getElementById('comicSidebar');
    sidebar.classList.toggle('collapsed');
    updateMobileToggle();
}

function updateMobileToggle() {
    const sidebar = document.getElementById('comicSidebar');
    const toggle = document.getElementById('mobileToggle');
    toggle.textContent = sidebar.classList.contains('collapsed') ? '▼ 展开漫画列表' : '▲ 收起漫画列表';
}

// ── Keyboard navigation ──

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') prevChapter();
    if (e.key === 'ArrowRight') nextChapter();
});

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
    loadTrending();
    // Focus search on desktop
    if (window.innerWidth > 768) {
        document.getElementById('searchInput').focus();
    }
});
