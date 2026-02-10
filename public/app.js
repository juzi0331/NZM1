const API_BASE = '/api'; // Relative path for Worker

const dom = {
    loginView: document.getElementById('login-view'),
    statsView: document.getElementById('stats-view'),
    qrImg: document.getElementById('qr-img'),
    qrStatus: document.getElementById('qr-status'),
    qrOverlay: document.getElementById('qr-overlay'),
    qrLoading: document.getElementById('qr-loading'),
    qrWrapper: document.getElementById('qr-wrapper'),

    userInfo: document.getElementById('user-info'),
    refreshBtn: document.getElementById('refresh-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    loading: document.getElementById('loading'),
    errorMsg: document.getElementById('error-msg'),

    // Tabs
    statsTab: document.getElementById('stats-tab'),
    collectionTab: document.getElementById('collection-tab'),

    // Stats content
    statsContent: document.getElementById('stats-content'),
    modeStats: document.getElementById('mode-stats'),
    mapStats: document.getElementById('map-stats'),
    matchHistory: document.getElementById('match-history'),
    pageInfo: document.getElementById('page-info'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),

    // Fragment sidebar
    fragmentList: document.getElementById('fragment-list'),

    // Collection grids
    weaponGrid: document.getElementById('weapon-grid'),
    trapGrid: document.getElementById('trap-grid'),
    pluginGrid: document.getElementById('plugin-grid'),
    weaponCount: document.getElementById('weapon-count'),
    trapCount: document.getElementById('trap-count'),
    pluginCount: document.getElementById('plugin-count'),

    // Overview
    gameCount: document.getElementById('off-total-games'),
    playTime: document.getElementById('off-total-time'),
    recentGames: document.getElementById('recent-games'),
    recentWin: document.getElementById('recent-win-rate'),
    recentDmg: document.getElementById('recent-avg-damage'),
};

const state = {
    cookie: localStorage.getItem('nzm_cookie'),
    data: null,
    collection: null,
    currentTab: 'stats'
};


// --- Init ---
async function init() {
    bindEvents();
    if (state.cookie) {
        await loadStats();
    } else {
        switchView('login');
        startQRLogin();
    }
}

function bindEvents() {
    dom.refreshBtn.addEventListener('click', loadStats);
    dom.logoutBtn.addEventListener('click', doLogout);

    dom.qrOverlay.addEventListener('click', startQRLogin);

    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

    // Collection Quality Filters
    document.querySelectorAll('.filter-btn[data-quality]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn[data-quality]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const quality = e.target.dataset.quality;
            filterWeapons(quality);
        });
    });

    // Plugin Slot Filters
    document.querySelectorAll('.filter-btn[data-slot]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn[data-slot]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const slot = e.target.dataset.slot;
            filterPlugins(slot);
        });
    });


    // Pagination
    dom.prevPage.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderMatchHistory(state.data.gameList); updatePagination(Math.ceil(filteredLength(state.data.gameList) / ITEMS_PER_PAGE)); } });
    dom.nextPage.addEventListener('click', () => {
        const total = Math.ceil(filteredLength(state.data.gameList) / ITEMS_PER_PAGE);
        if (currentPage < total) { currentPage++; renderMatchHistory(state.data.gameList); updatePagination(total); }
    });

    // Mode Tabs
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentModeFilter = e.target.dataset.mode;
            currentPage = 1;
            if (state.data) renderMatchHistory(state.data.gameList);
        });
    });
}

// --- QR Logic ---
let qrTimer = null;
let qrSig = '';
let isQRPollingActive = false; // Flag to track if we should be polling

// Page Visibility API: Pause polling when page is hidden to save requests
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, pause polling
        if (qrTimer) {
            clearInterval(qrTimer);
            qrTimer = null;
        }
    } else {
        // Page is visible again, resume polling only if we were actively polling
        if (isQRPollingActive && qrSig && !qrTimer) {
            qrTimer = setInterval(checkQR, 3000);
            // Immediately check once when coming back
            checkQR();
        }
    }
});

async function startQRLogin() {
    if (qrTimer) {
        clearInterval(qrTimer);
        qrTimer = null;
    }
    isQRPollingActive = false;
    qrSig = '';

    dom.qrLoading.style.display = 'flex';
    dom.qrOverlay.style.display = 'none';
    dom.qrImg.style.display = 'none';
    dom.qrStatus.textContent = '姝ｅ湪鑾峰彇浜岀淮鐮?..';
    dom.qrStatus.style.color = '#aaa';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
        const res = await fetch(`${API_BASE}/auth/qr`, {
            signal: controller.signal,
            cache: 'no-store'
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();

        if (json?.success && json?.data?.qrcode && json?.data?.qrsig) {
            dom.qrImg.src = json.data.qrcode;
            qrSig = json.data.qrsig;

            dom.qrLoading.style.display = 'none';
            dom.qrImg.style.display = 'block';
            dom.qrStatus.textContent = '璇蜂娇鐢?鎵嬫満QQ 鎵爜鐧诲綍';

            // Start polling
            isQRPollingActive = true;
            qrTimer = setInterval(checkQR, 3000);
            checkQR();
        } else {
            throw new Error('Get QR Failed');
        }
    } catch (e) {
        dom.qrLoading.style.display = 'none';
        dom.qrImg.style.display = 'none';
        dom.qrStatus.textContent = 'Failed to load QR. Click to retry.';
        dom.qrOverlay.style.display = 'flex';
    } finally {
        clearTimeout(timeoutId);
    }
}

async function checkQR() {
    if (!qrSig) return;
    try {
        const res = await fetch(`${API_BASE}/auth/check?qrsig=${encodeURIComponent(qrSig)}`);
        const json = await res.json();

        // Correct Status Mapping
        if (json.status === 0) {
            // Success - stop polling permanently
            isQRPollingActive = false;
            clearInterval(qrTimer);
            qrTimer = null;
            dom.qrStatus.textContent = '鐧诲綍鎴愬姛锛佽烦杞腑...';
            dom.qrStatus.style.color = '#10b981';

            state.cookie = json.data.cookie;
            localStorage.setItem('nzm_cookie', state.cookie);

            loadStats();
        } else if (json.status === 66) {
            // Waiting for scan
            dom.qrStatus.textContent = '璇蜂娇鐢ㄦ墜鏈篞Q鎵爜';
            dom.qrStatus.style.color = '#aaa';
        } else if (json.status === 67) {
            // Scanned, waiting confirm
            dom.qrStatus.textContent = '鎵爜鎴愬姛锛岃鍦ㄦ墜鏈轰笂纭';
            dom.qrStatus.style.color = '#f59e0b';
        } else if (json.status === 65 || (json.message && json.message.includes('澶辨晥'))) {
            // QR expired - stop polling permanently
            isQRPollingActive = false;
            clearInterval(qrTimer);
            qrTimer = null;
            dom.qrStatus.textContent = '浜岀淮鐮佸凡澶辨晥';
            dom.qrOverlay.style.display = 'flex';
        }
    } catch (e) {
        // ignore poll errors
    }
}

function doLogout() {
    if (confirm('纭畾瑕侀€€鍑虹櫥褰曞苟娓呴櫎鏈湴缂撳瓨鍚楋紵')) {
        localStorage.removeItem('nzm_cookie');
        state.cookie = null;
        if (qrTimer) clearInterval(qrTimer);
        switchView('login');
        startQRLogin();
    }
}

// --- Data & Rendering ---
async function loadStats() {
    if (!state.cookie) return switchView('login');

    switchView('stats');
    dom.loading.classList.remove('hidden');
    dom.statsContent.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE}/stats`, {
            headers: { 'X-NZM-Cookie': state.cookie }
        });

        if (res.status === 401) {
            localStorage.removeItem('nzm_cookie');
            state.cookie = null;
            alert('鐧诲綍鐘舵€佸凡澶辨晥锛岃閲嶆柊鎵爜鐧诲綍');
            switchView('login');
            startQRLogin();
            return;
        }

        const json = await res.json();
        if (json.success) {
            state.data = json.data;
            renderStats(json.data);
            dom.statsContent.classList.remove('hidden');
            // Load fragment progress in sidebar
            loadFragments();
        } else {
            showError('鏁版嵁鑾峰彇澶辫触: ' + (json.message || '鏈煡閿欒'));
            if (json.message === 'Missing Cookie') doLogout();
        }
    } catch (e) {
        showError('璇锋眰澶辫触: ' + e.message);
    } finally {
        dom.loading.classList.add('hidden');
    }
}

async function loadMatchDetail(roomId, container, mode) {
    try {
        const res = await fetch(`${API_BASE}/detail?room_id=${roomId}`, {
            headers: { 'X-NZM-Cookie': state.cookie }
        });
        const json = await res.json();
        if (json.success && json.data) {
            renderMatchDetail(json.data, container, mode);
            container.dataset.loaded = 'true';
        } else {
            container.innerHTML = `<div style="text-align:center;color:#ff4444">鍔犺浇澶辫触</div>`;
        }
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;color:#ff4444">缃戠粶閿欒</div>`;
    }
}

// --- View Helpers ---
function switchView(viewName) {
    if (viewName === 'login') {
        dom.loginView.classList.remove('hidden');
        dom.statsView.classList.add('hidden');
    } else {
        dom.loginView.classList.add('hidden');
        dom.statsView.classList.remove('hidden');
    }
}

function showError(msg) {
    dom.errorMsg.textContent = msg;
    dom.errorMsg.classList.remove('hidden');
    setTimeout(() => dom.errorMsg.classList.add('hidden'), 3000);
}

// --- Reused Render Logic ---
const MAP_NAME = {};
const DIFF_NAME = { '0': '榛樿', '1': '寮曞', '2': '鏅€?, '3': '鍥伴毦', '4': '鑻遍泟', '5': '鐐肩嫳', '6': '鎶樼（I', '7': '鎶樼（II', '8': '鎶樼（III', '9': '鎶樼（IV', '10': '鎶樼（V', '11': '鎶樼（VI' };

function getModeByMapId(mapId) {
    const id = parseInt(mapId);
    if ([12, 14, 16, 17, 21, 30, 112, 114, 115].includes(id)) return '鍍靛案鐚庡満';
    if ([300, 304, 306, 308].includes(id)) return '濉旈槻鎴?;
    if ([321, 322, 323, 324].includes(id)) return '鏃剁┖杩界寧';
    if (id >= 1000) return '鏈虹敳鎴?;
    return '鏈煡';
}

function renderStats(data) {
    // Fill Summary
    dom.gameCount.textContent = data.officialSummary?.huntGameCount || '-';
    dom.playTime.textContent = data.officialSummary?.playtime ? `${Math.floor(data.officialSummary.playtime / 60)}鏃禶 : '-';

    dom.recentGames.textContent = data.totalGames;
    dom.recentWin.textContent = data.winRate + '%';
    dom.recentDmg.textContent = formatNumber(data.avgDamage);

    // Modes
    let modeHtml = '';
    for (const [m, info] of Object.entries(data.modeStats)) {
        const rate = info.total > 0 ? ((info.win / info.total) * 100).toFixed(1) : 0;
        modeHtml += `
            <div class="stat-card mode-card">
                <h3>${m}</h3>
                <div class="value">${info.total} <small>鍦?/small></div>
                <div class="details">
                    <span class="win">鑳?${info.win}</span>
                    <span class="loss">璐?${info.loss}</span>
                    <span style="opacity:0.7">${rate}%</span>
                </div>
            </div>`;
    }
    dom.modeStats.innerHTML = modeHtml;

    // Maps
    let mapHtml = '';
    for (const [m, diffs] of Object.entries(data.mapStats)) {
        let total = 0, win = 0;
        let diffStr = '';
        for (const [d, v] of Object.entries(diffs)) {
            total += v.total; win += v.win;
            diffStr += `<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-top:2px;"><span>${d}</span><span>${v.total}鍦?(${v.win > 0 ? Math.floor(v.win / v.total * 100) : 0}%)</span></div>`;
        }
        // Find correct image from game list if possible
        const found = data.gameList.find(g => g.mapName === m);
        let img = 'images/maps-304.png';
        if (found && found.icon) img = found.icon;

        // Manual fallbacks only if backend is empty
        if (!found?.icon) {
            if (m.includes('澶ч兘浼?)) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-14.png';
            if (m.includes('澶嶆椿鑺?)) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-12.png';
            if (m.includes('椋庢毚')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-1000.png';
            if (m.includes('鏍归櫎')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-321.png';
            if (m.includes('鏄嗕粦绁炲')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-16.png';
            if (m.includes('绮剧粷鍙ゅ煄')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-17.png';
            if (m.includes('鑱旂洘澶у帵')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-306.png';
            if (m.includes('鐚庢潃鍗楀崄瀛?)) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-323.png';
        }

        const rate = total > 0 ? ((win / total) * 100).toFixed(0) : 0;

        mapHtml += `
            <div class="stat-card map-card" style="background-image: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.8) 100%), url('${img}'); background-size: cover; background-position: center;">
                <div style="position:relative; z-index:2; height:100%; display:flex; flex-direction:column; justify-content:flex-end;">
                    <h3 style="margin:0 0 0.5rem 0; font-size:1.1rem; text-shadow:0 2px 4px rgba(0,0,0,0.8);">${m}</h3>
                    <div style="font-size:0.8rem; margin-bottom:0.5rem; opacity:0.9;">${total}鍦?- ${rate}% 鑳滅巼</div>
                    <div class="map-diffs" style="margin-top:0.25rem;">${diffStr}</div>
                </div>
            </div>`;
    }
    dom.mapStats.innerHTML = mapHtml;

    renderMatchHistory(data.gameList);
}

let currentModeFilter = 'all';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

function filteredLength(list) {
    return list.filter(g => {
        const mode = getModeByMapId(g.iMapId);
        if (mode === '鏈虹敳') return false;
        if (currentModeFilter === 'all') return true;
        return mode === currentModeFilter;
    }).length;
}

function renderMatchHistory(gameList) {
    if (!dom.matchHistory) return;
    dom.matchHistory.innerHTML = '';

    const filteredList = gameList.filter(g => {
        const mode = getModeByMapId(g.iMapId);
        if (mode === '鏈虹敳鎴?) return false;
        if (currentModeFilter === 'all') return true;
        return mode === currentModeFilter;
    });

    if (filteredList.length === 0) {
        dom.matchHistory.innerHTML = '<div class="match-item">鏆傛棤绗﹀悎鏉′欢鐨勫灞€璁板綍</div>';
        updatePagination(0);
        return;
    }

    const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageData = filteredList.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    const htmlList = pageData.map((game, idx) => {
        const mode = getModeByMapId(game.iMapId);
        const mapName = game.mapName || MAP_NAME[game.iMapId] || `鏈煡(${game.iMapId})`;
        const diffName = game.diffName || DIFF_NAME[game.iSubModeType] || game.iSubModeType;
        const isWin = game.iIsWin === '1' || game.iIsWin === 1;
        const duration = parseInt(game.iDuration) || 0;
        const durationStr = `${Math.floor(duration / 60)}鍒?{duration % 60}绉抈;
        const startTime = game.dtGameStartTime || '';
        const score = parseInt(game.iScore) || 0;

        // Find match image
        const found = gameList.find(g => g.iMapId === game.iMapId); // Or just search in global mapInfo if available, but here we can look up in data.gameList or reuse logic. 
        // Actually the game object itself has iMapId. We can try to find icon from data.gameList if available in scope? 
        // renderMatchHistory payload is just a list. Let's start with default image or try to pass mapIcons map.
        // For simplicity, reuse the same fallback logic or if the object already has it.
        // The 'game' object here comes from filteredList which comes from data.gameList.

        let img = 'images/maps-304.png';
        if (game.icon) img = game.icon;
        if (!game.icon) {
            // Simple fallback based on name or ID if needed, similar to map stats
            if (mapName.includes('澶ч兘浼?)) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-14.png';
            else if (mapName.includes('澶嶆椿鑺?)) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-12.png';
            else if (mapName.includes('椋庢毚')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-1000.png';
            else if (mapName.includes('鏍归櫎')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-321.png';
            else if (mapName.includes('鏄嗕粦绁炲')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-16.png';
            else if (mapName.includes('绮剧粷鍙ゅ煄')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-17.png';
            else if (mapName.includes('鑱旂洘澶у帵')) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-306.png';
            else if (mapName.includes('鐚庢潃鍗楀崄瀛?)) img = 'https://nzm.playerhub.qq.com/playerhub/60106/maps/maps-323.png';
        }

        // Format Date: "01-25 15:13"
        let dateStr = startTime;
        try {
            const d = new Date(startTime);
            const m = (d.getMonth() + 1).toString().padStart(2, '0');
            const dd = d.getDate().toString().padStart(2, '0');
            const hh = d.getHours().toString().padStart(2, '0');
            const mm = d.getMinutes().toString().padStart(2, '0');
            dateStr = `${m}-${dd} ${hh}:${mm}`;
        } catch (e) { }

        return `
            <div class="match-item ${isWin ? 'win' : 'loss'}" data-idx="${startIdx + idx}" data-roomid="${game.DsRoomId}" data-mode="${mode}">
                <div class="match-content-row">
                    <img src="${img}" class="match-thumb" loading="lazy">
                    
                    <div class="match-info-center">
                        <div class="match-info-top">
                            <span class="match-result-text ${isWin ? 'text-red' : ''}">${isWin ? '鑳滃埄' : '澶辫触'}</span>
                            <span class="match-mode-text">${mode}</span>
                        </div>
                        <div class="match-info-bottom">
                            <span class="match-map-name">${mapName}-${diffName}</span>
                            <span class="match-date">${dateStr}</span>
                        </div>
                    </div>

                    <div class="match-toggle-btn">
                        <span class="toggle-text"></span>
                        <span class="toggle-icon"></span>
                    </div>

                    <div class="match-info-right">
                        <div class="match-score-text">${formatNumber(score)}</div>
                        <div class="match-duration-text">${Math.floor(duration / 60)}鍒?{duration % 60}绉?/div>
                    </div>
                </div>
                
                <div class="match-details" id="detail-${game.DsRoomId}"></div>
            </div>
        `;
    });

    dom.matchHistory.innerHTML = htmlList.join('');

    dom.matchHistory.querySelectorAll('.match-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.match-details')) return;
            item.classList.toggle('expanded');
            if (item.classList.contains('expanded')) {
                const roomId = item.dataset.roomid;
                const mode = item.dataset.mode;
                const detailContainer = document.getElementById(`detail-${roomId}`);
                if (detailContainer && !detailContainer.dataset.loaded) {
                    detailContainer.innerHTML = '<div style="text-align:center;padding:1rem;">姝ｅ湪鍔犺浇...</div>';
                    await loadMatchDetail(roomId, detailContainer, mode);
                }
            }
        });
    });

    updatePagination(totalPages);
}

function updatePagination(totalPages) {
    if (!dom.pageInfo) return;
    dom.pageInfo.textContent = `绗?${currentPage} 椤?/ 鍏?${totalPages} 椤礰;
    dom.prevPage.disabled = currentPage <= 1;
    dom.nextPage.disabled = currentPage >= totalPages;
}

function formatNumber(num) {
    return (num || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getQualityLabel(quality) {
    switch (quality) {
        case 4: return '浼犺';
        case 3: return '鍙茶瘲';
        case 2: return '绋€鏈?;
        default: return '鏅€?;
    }
}

function renderEquipmentScheme(equipmentScheme, playerId) {
    if (!equipmentScheme || equipmentScheme.length === 0) return '';

    const weaponsHtml = equipmentScheme.map(weapon => {
        const weaponName = decodeURIComponent(weapon.weaponName || '');
        const quality = weapon.quality || 1;
        const qualityClass = `weapon-quality-${quality}`;
        const qualityLabel = getQualityLabel(quality);
        const qualityBadgeClass = quality === 4 ? 'badge-legendary' : quality === 3 ? 'badge-epic' : quality === 2 ? 'badge-rare' : 'badge-common';

        // Render plugins
        const pluginsHtml = (weapon.commonItems || []).map(plugin => {
            const pluginName = decodeURIComponent(plugin.itemName || '');
            return `
                <div class="plugin-icon" title="${pluginName}">
                    <img src="${plugin.pic}" alt="${pluginName}" loading="lazy" onerror="this.style.opacity='0.3'">
                </div>
            `;
        }).join('');

        return `
            <div class="weapon-card ${qualityClass}">
                <div class="weapon-image-container">
                    <img src="${weapon.pic}" alt="${weaponName}" class="weapon-image" loading="lazy" onerror="this.style.opacity='0.3'">
                    <span class="weapon-quality-badge ${qualityBadgeClass}">${qualityLabel}</span>
                </div>
                <div class="weapon-name" title="${weaponName}">${weaponName}</div>
                <div class="plugin-grid">
                    ${pluginsHtml}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="equipment-section" id="equipment-${playerId}">
            <div class="equipment-header" onclick="toggleEquipment('${playerId}')">
                <span class="equipment-header-title">鏈眬閰嶈</span>
                <span class="equipment-toggle-icon">鈻?/span>
            </div>
            <div class="equipment-content">
                <div class="equipment-grid">
                    ${weaponsHtml}
                </div>
            </div>
        </div>
    `;
}

function toggleEquipment(playerId) {
    const section = document.getElementById(`equipment-${playerId}`);
    if (section) {
        section.classList.toggle('expanded');
    }
}

function renderMatchDetail(data, container, mode) {
    const self = data.loginUserDetail;
    const teammates = (data.list || []).filter(p => p.nickname !== self.nickname);
    teammates.sort((a, b) => (parseInt(b.baseDetail.iScore) || 0) - (parseInt(a.baseDetail.iScore) || 0));

    // Hide extra stats for Tower Defense (濉旈槻鎴? and Time Hunting (鏃剁┖杩界寧)
    const showExtra = mode !== '濉旈槻鎴? && mode !== '鏃剁┖杩界寧';

    let html = '<div class="player-list">';
    teammates.forEach((p, idx) => {
        const info = p.baseDetail;
        const hunt = p.huntingDetails || {};
        const hasExtra = showExtra && ((hunt.damageTotalOnBoss || hunt.DamageTotalOnBoss) > 0 || (hunt.damageTotalOnMobs || hunt.DamageTotalOnMobs) > 0 || hunt.totalCoin > 0);
        const equipmentHtml = renderEquipmentScheme(p.equipmentScheme, `teammate-${idx}`);
        html += `
            <div class="player-item" style="display:block;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <img src="${decodeURIComponent(p.avatar)}" class="player-avatar" onerror="this.src='images/maps-304.png'">
                    <div class="player-info">
                        <div class="player-name">${decodeURIComponent(p.nickname)}</div>
                        <div class="player-stats-grid">
                            <div class="stat-group">
                                <span>绉垎: ${formatNumber(info.iScore)}</span>
                                <span>鍑绘潃: ${info.iKills}</span>
                                <span>姝讳骸: ${info.iDeaths}</span>
                            </div>
                            ${hasExtra ? `
                            <div class="stat-group extra">
                                <span>Boss: ${formatNumber(hunt.damageTotalOnBoss || hunt.DamageTotalOnBoss || 0)}</span>
                                <span>灏忔€? ${formatNumber(hunt.damageTotalOnMobs || hunt.DamageTotalOnMobs || 0)}</span>
                                <span>閲戝竵: ${formatNumber(hunt.totalCoin || 0)}</span>
                            </div>` : ''}
                        </div>
                    </div>
                </div>
                ${equipmentHtml}
            </div>`;
    });
    html += '</div>';

    const selfInfo = self.baseDetail;
    const selfHunt = self.huntingDetails || {};
    const selfEquipmentHtml = renderEquipmentScheme(self.equipmentScheme, 'self');
    html += `
        <div class="user-detail-row" style="margin-top:1rem; background:rgba(255,255,255,0.05); padding:1rem; border-radius:0.5rem;">
            <div style="display:flex; gap:1rem; align-items:center; margin-bottom:${selfEquipmentHtml ? '1rem' : '0'};">
                <div style="flex-shrink:0; text-align:center;">
                    <img src="${decodeURIComponent(self.avatar)}" style="width:50px; height:50px; border-radius:50%; border:2px solid var(--accent);">
                    <div style="font-weight:bold; margin-top:0.25rem;">${decodeURIComponent(self.nickname)}</div>
                </div>
                <div class="detail-grid" style="flex-grow:1; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));">
                    <div class="detail-item"><div class="label">绉垎</div><div class="value">${formatNumber(selfInfo.iScore)}</div></div>
                    <div class="detail-item"><div class="label">鍑绘潃</div><div class="value">${selfInfo.iKills}</div></div>
                    <div class="detail-item"><div class="label">姝讳骸</div><div class="value">${selfInfo.iDeaths}</div></div>
                    ${showExtra ? `
                    <div class="detail-item"><div class="label">Boss浼ゅ</div><div class="value">${formatNumber(selfHunt.damageTotalOnBoss || selfHunt.DamageTotalOnBoss || 0)}</div></div>
                    <div class="detail-item"><div class="label">灏忔€激瀹?/div><div class="value">${formatNumber(selfHunt.damageTotalOnMobs || selfHunt.DamageTotalOnMobs || 0)}</div></div>
                    <div class="detail-item"><div class="label">閲戝竵</div><div class="value">${formatNumber(selfHunt.totalCoin || 0)}</div></div>
                    ` : ''}
                </div>
            </div>
            ${selfEquipmentHtml}
        </div>`;

    container.innerHTML = html;
}

// --- Tab Switching ---
function switchTab(tab) {
    state.currentTab = tab;

    // Update nav tab styles
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Toggle content visibility
    if (tab === 'stats') {
        dom.statsTab.classList.remove('hidden');
        dom.collectionTab.classList.add('hidden');
    } else if (tab === 'collection') {
        dom.statsTab.classList.add('hidden');
        dom.collectionTab.classList.remove('hidden');
        if (!state.collection) {
            loadCollection();
        }
    }
}

// --- Collection Data ---
async function loadCollection() {
    dom.weaponGrid.innerHTML = '<p style="color:#888;">鍔犺浇涓?..</p>';
    dom.trapGrid.innerHTML = '<p style="color:#888;">鍔犺浇涓?..</p>';
    dom.pluginGrid.innerHTML = '<p style="color:#888;">鍔犺浇涓?..</p>';

    try {
        const res = await fetch(`${API_BASE}/collection?type=all`, {
            headers: { 'X-NZM-Cookie': state.cookie }
        });
        const json = await res.json();

        if (json.success) {
            state.collection = json.data;
            renderWeapons(json.data.weapons);
            renderTraps(json.data.traps);
            renderPlugins(json.data.plugins);

            // Update counts
            if (json.data.weaponSummary) {
                dom.weaponCount.textContent = `(${json.data.weaponSummary.owned}/${json.data.weaponSummary.total})`;
            }
            if (json.data.trapSummary) {
                dom.trapCount.textContent = `(${json.data.trapSummary.owned}/${json.data.trapSummary.total})`;
            }
            if (json.data.pluginSummary) {
                dom.pluginCount.textContent = `(${json.data.pluginSummary.owned}/${json.data.pluginSummary.total})`;
            }

            // Render fragment progress
            if (json.data.home && json.data.home.show) {
                renderFragments(json.data.home.show);
            }
        }
    } catch (e) {
        console.error('Failed to load collection:', e);
    }
}

function getQualityBadge(quality) {
    switch (quality) {
        case 4: return '<span class="collection-item-badge badge-legendary">浼犺</span>';
        case 3: return '<span class="collection-item-badge badge-epic">鍙茶瘲</span>';
        case 2: return '<span class="collection-item-badge badge-rare">绋€鏈?/span>';
        default: return '<span class="collection-item-badge badge-common">鏅€?/span>';
    }
}

function renderWeapons(weapons, filterQuality = 'all') {
    if (!weapons) return;

    let filtered = filterQuality === 'all'
        ? [...weapons]
        : weapons.filter(w => w.quality == filterQuality);

    // 鎺掑簭锛氬凡瑙ｉ攣浼樺厛锛岀劧鍚庢寜鍝佽川浠庨珮鍒颁綆 (4=浼犺 > 3=鍙茶瘲 > 2=绋€鏈?> 1=鏅€?
    filtered.sort((a, b) => {
        // 鍏堟寜鏄惁鎷ユ湁鎺掑簭锛堟嫢鏈夌殑鍦ㄥ墠锛?        if (a.owned !== b.owned) return a.owned ? -1 : 1;
        // 鍐嶆寜鍝佽川鎺掑簭锛堥珮鍝佽川鍦ㄥ墠锛?        return (b.quality || 0) - (a.quality || 0);
    });

    dom.weaponGrid.innerHTML = filtered.map(w => `
        <div class="collection-item ${w.owned ? '' : 'not-owned'}" data-quality="${w.quality}">
            ${getQualityBadge(w.quality)}
            <img class="collection-item-img" src="${w.pic}" alt="${w.weaponName}" loading="lazy">
            <div class="collection-item-info">
                <div class="collection-item-name" title="${w.weaponName}">${w.weaponName}</div>
            </div>
        </div>
    `).join('');
}

function filterWeapons(quality) {
    if (state.collection && state.collection.weapons) {
        renderWeapons(state.collection.weapons, quality);
    }
}

function renderTraps(traps) {
    if (!traps) return;

    dom.trapGrid.innerHTML = traps.map(t => `
        <div class="collection-item ${t.owned ? '' : 'not-owned'}">
            <img class="collection-item-img" src="${t.icon}" alt="${t.trapName}" loading="lazy">
            <div class="collection-item-info">
                <div class="collection-item-name" title="${t.trapName}">${t.trapName}</div>
            </div>
        </div>
    `).join('');
}

function renderPlugins(plugins, filterSlot = 'all') {
    if (!plugins) return;

    const filtered = filterSlot === 'all'
        ? plugins
        : plugins.filter(p => p.slotIndex == filterSlot);

    dom.pluginGrid.innerHTML = filtered.map(p => `
        <div class="collection-item ${p.owned ? '' : 'not-owned'}" data-slot="${p.slotIndex}">
            ${getQualityBadge(p.quality)}
            <img class="collection-item-img" src="${p.pic}" alt="${p.itemName}" loading="lazy">
            <div class="collection-item-info">
                <div class="collection-item-name" title="${p.itemName}">${p.itemName}</div>
            </div>
        </div>
    `).join('');
}

function filterPlugins(slot) {
    if (state.collection && state.collection.plugins) {
        renderPlugins(state.collection.plugins, slot);
    }
}

// --- Fragment Progress ---
function renderFragments(fragments) {
    if (!fragments || fragments.length === 0) {
        dom.fragmentList.innerHTML = '<p style="color:#888;font-size:0.9rem;">鏆傛棤纰庣墖杩涘害</p>';
        return;
    }

    // 鍙樉绀烘湁纰庣墖杩涘害鐨勬鍣?    const withProgress = fragments.filter(f => f.itemProgress && f.itemProgress.current > 0);

    if (withProgress.length === 0) {
        dom.fragmentList.innerHTML = '<p style="color:#888;font-size:0.9rem;">鏆傛棤纰庣墖杩涘害</p>';
        return;
    }

    dom.fragmentList.innerHTML = withProgress.map(f => {
        const progress = f.itemProgress;
        const percent = Math.min(100, (progress.current / progress.required) * 100);
        const isComplete = progress.current >= progress.required;

        return `
            <div class="progress-item">
                <img class="progress-icon" src="${f.pic || ''}" alt="${f.weaponName}">
                <div class="progress-info">
                    <div class="progress-name">${f.weaponName}</div>
                    <div class="progress-bar-track">
                        <div class="progress-bar-fill ${isComplete ? 'complete' : ''}" style="width:${percent}%"></div>
                    </div>
                    <div class="progress-text">${progress.current}/${progress.required}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Load fragments on stats load
async function loadFragments() {
    try {
        const res = await fetch(`${API_BASE}/collection?type=home`, {
            headers: { 'X-NZM-Cookie': state.cookie }
        });
        const json = await res.json();

        if (json.success && json.data.home) {
            renderFragments(json.data.home);
        }
    } catch (e) {
        console.error('Failed to load fragments:', e);
    }
}

// --- Sidebar Toggle & Drag ---
function initSidebar() {
    const sidebar = document.getElementById('progress-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const dragHandle = document.getElementById('sidebar-drag-handle');

    if (!sidebar || !toggleBtn) return;

    // Restore collapsed state from localStorage
    const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
    }

    // Restore position from localStorage
    const savedPos = localStorage.getItem('sidebar_position');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            sidebar.style.right = 'auto';
            sidebar.style.top = 'auto';
            sidebar.style.left = pos.left + 'px';
            sidebar.style.top = pos.top + 'px';
        } catch (e) { }
    }

    // Toggle functionality
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebar_collapsed', 'true');
    });

    // Track if we just finished dragging to prevent click-to-expand
    let justDragged = false;

    // Click collapsed ball to expand (only if not dragging)
    sidebar.addEventListener('click', (e) => {
        if (justDragged) {
            justDragged = false;
            return;
        }
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            localStorage.setItem('sidebar_collapsed', 'false');
        }
    });

    // Drag functionality
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, offsetX, offsetY;

    const startDrag = (e) => {
        // Only drag from header when expanded, or anywhere when collapsed
        if (!sidebar.classList.contains('collapsed') && !e.target.closest('#sidebar-drag-handle')) {
            return;
        }
        if (e.target.closest('#sidebar-toggle')) return;

        isDragging = true;
        hasMoved = false;
        sidebar.classList.add('dragging');

        const rect = sidebar.getBoundingClientRect();

        if (e.type === 'touchstart') {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }

        // Calculate offset from mouse position to element top-left corner
        offsetX = startX - rect.left;
        offsetY = startY - rect.top;

        e.preventDefault();
    };

    const doDrag = (e) => {
        if (!isDragging) return;

        let clientX, clientY;
        if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Check if moved enough to count as drag
        if (Math.abs(clientX - startX) > 3 || Math.abs(clientY - startY) > 3) {
            hasMoved = true;
        }

        // Calculate new position based on mouse position minus initial offset
        let newLeft = clientX - offsetX;
        let newTop = clientY - offsetY;

        // Boundary constraints
        const maxLeft = window.innerWidth - sidebar.offsetWidth;
        const maxTop = window.innerHeight - sidebar.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        sidebar.style.right = 'auto';
        sidebar.style.left = newLeft + 'px';
        sidebar.style.top = newTop + 'px';

        e.preventDefault();
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        sidebar.classList.remove('dragging');

        // If we actually moved, set flag to prevent click expansion
        if (hasMoved) {
            justDragged = true;
            // Reset after a short delay to allow future clicks
            setTimeout(() => { justDragged = false; }, 100);
        }

        // Save position
        const rect = sidebar.getBoundingClientRect();
        localStorage.setItem('sidebar_position', JSON.stringify({
            left: rect.left,
            top: rect.top
        }));
    };

    // Mouse events
    dragHandle.addEventListener('mousedown', startDrag);
    sidebar.addEventListener('mousedown', (e) => {
        if (sidebar.classList.contains('collapsed')) startDrag(e);
    });
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    // Touch events
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    sidebar.addEventListener('touchstart', (e) => {
        if (sidebar.classList.contains('collapsed')) startDrag(e);
    }, { passive: false });
    document.addEventListener('touchmove', doDrag, { passive: false });
    document.addEventListener('touchend', endDrag);

    // Handle window resize - keep sidebar within bounds
    const keepInBounds = () => {
        // Skip if sidebar is not visible (e.g., on login page)
        if (sidebar.offsetWidth === 0 || sidebar.offsetHeight === 0) {
            return;
        }

        // Get the original saved position
        const savedPos = localStorage.getItem('sidebar_position');
        let targetLeft, targetTop;

        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                targetLeft = pos.left;
                targetTop = pos.top;
            } catch (e) {
                // No valid saved position, use CSS default (right: 20px)
                return;
            }
        } else {
            // No saved position, let CSS handle default positioning
            return;
        }

        const maxLeft = window.innerWidth - sidebar.offsetWidth;
        const maxTop = window.innerHeight - sidebar.offsetHeight;

        // Clamp position to current window bounds
        const newLeft = Math.max(0, Math.min(targetLeft, maxLeft));
        const newTop = Math.max(0, Math.min(targetTop, maxTop));

        sidebar.style.right = 'auto';
        sidebar.style.left = newLeft + 'px';
        sidebar.style.top = newTop + 'px';

        // DO NOT save - keep original position in localStorage
    };

    window.addEventListener('resize', keepInBounds);

    // Check bounds on initial load only if there's a saved position
    if (localStorage.getItem('sidebar_position')) {
        setTimeout(keepInBounds, 100);
    }
}

// Initialize sidebars after DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
});

init();

