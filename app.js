// ==========================================
// A1 TV - Application Controller Upgraded
// ==========================================

// Global state variables
let hlsInstance = null;
let currentChannelIndex = 0;
let favoritesList = [];
let selectedCategory = 'All';
let searchQuery = '';
let isAmbientGlowActive = true;
let isTheaterMode = false;
let ambientInterval = null;
let selectedQuality = 'auto';
let hasAttemptedNativeFallback = false;
let hasUnlockedAudio = false;
let controlsHideTimer = null;
let areMoreCategoriesVisible = false;
let isBackgroundPlayEnabled = false;

const FIFA_PLAYLIST_URL = './assets/world-cup.dat?v=1';
const fifaChannelIds = new Set([3, 74, 83, 91, 94, 253]);
const featuredChannelIds = [345, 364, 365, 582, 363, 367, 401, 402, 516, 524];
const featuredTopChannelIds = [345, 363, 364, 365, 367, 401, 402, 516, 524];

// Visible channels list (after applying filters and search)
let visibleChannels = [];

// DOM Elements cache
const videoPlayer = document.getElementById('videoPlayer');
const videoContainer = document.getElementById('videoContainer');
const playerOuterStage = document.getElementById('playerOuterStage');
const audioUnmuteOverlay = document.getElementById('audioUnmuteOverlay');
const videoBufferOverlay = document.getElementById('videoBufferOverlay');
const playFlashOverlay = document.getElementById('playFlashOverlay');
const flashIconPlay = document.getElementById('flashIconPlay');
const flashIconPause = document.getElementById('flashIconPause');

const selectedChannelName = document.getElementById('selectedChannelName');
const channelGrid = document.getElementById('channelGrid');
const channelSearch = document.getElementById('channelSearch');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const categoryNav = document.getElementById('categoryNav');
const channelCountDisplay = document.getElementById('channelCountDisplay');
const liveClock = document.getElementById('liveClock');

const metaChannelLogo = document.getElementById('metaChannelLogo');
const metaChannelTitle = document.getElementById('metaChannelTitle');
const metaChannelCategory = document.getElementById('metaChannelCategory');
const metaEpgShowTitle = document.getElementById('metaEpgShowTitle');
const epgProgressFill = document.getElementById('epgProgressFill');

const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const muteToggleBtn = document.getElementById('muteToggleBtn');
const volumeOnIcon = document.getElementById('volumeOnIcon');
const volumeMutedIcon = document.getElementById('volumeMutedIcon');
const volumeBar = document.getElementById('volumeBar');
const qualitySelect = document.getElementById('qualitySelect');
const ambientBackdrop = document.getElementById('ambientBackdrop');
const ambientCanvas = document.getElementById('ambientCanvas');
const helpModal = document.getElementById('helpModal');
const ambientGlowBtn = document.getElementById('ambientGlowBtn');
const pipModeBtn = document.getElementById('pipModeBtn');
const backgroundPlayBtn = document.getElementById('backgroundPlayBtn');
videoPlayer.playsInline = true;
videoPlayer.setAttribute('playsinline', '');
videoPlayer.setAttribute('webkit-playsinline', '');
videoPlayer.disablePictureInPicture = false;

function isAppleDevice() {
    return /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent);
}

function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent);
}

function disableLiveCaptions() {
    if (hlsInstance) {
        hlsInstance.subtitleTrack = -1;
        hlsInstance.subtitleDisplay = false;
    }

    Array.from(videoPlayer.textTracks || []).forEach(track => {
        track.mode = 'disabled';
    });
}

// Suppress any dynamically injected text tracks
videoPlayer.textTracks && videoPlayer.textTracks.addEventListener('addtrack', () => {
    disableLiveCaptions();
});

// Initialize app when window loads
window.addEventListener('DOMContentLoaded', async () => {
    loadFavorites();
    initClock();
    initAppControls();
    
    // Check if channels array from channels.js is loaded
    if (typeof channels !== 'undefined' && Array.isArray(channels)) {
        await loadFifaPlaylistChannels();
        syncAutoFavoriteChannels();
        updateSearchPlaceholder();
        applyFilters();
        
        // Parse startup channel index from URL params (e.g. ?ch=15)
        const urlParams = new URLSearchParams(window.location.search);
        const startChId = parseInt(urlParams.get('ch'));
        let startIndex = 0;
        if (startChId) {
            const foundIdx = channels.findIndex(item => item.id === startChId);
            if (foundIdx !== -1) {
                startIndex = foundIdx;
            }
        }
        playChannelByIndex(startIndex);
    } else {
        channelCountDisplay.innerText = "Error loading database";
        console.error("Channels database not found!");
    }
});

// 1. Clock and EPG updater
function initClock() {
    const update = () => {
        const now = new Date();
        liveClock.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    update();
    setInterval(update, 1000);

    // EPG time tracker dummy update
    const epgTimeRange = document.getElementById('epgTimeRange');
    const updateEPG = () => {
        const start = new Date();
        start.setMinutes(0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const formatTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        epgTimeRange.innerText = `${formatTime(start)} - ${formatTime(end)}`;
    };
    updateEPG();
    setInterval(updateEPG, 60 * 1000);
}

// Mock EPG Show Generator
function generateMockEPG(channelName, category) {
    const showDatabase = {
        Sports: [
            "Live Football: World Cup Qualifiers",
            "Super Sunday: Premier League Match Day",
            "Cricket live: T20 Internationals",
            "Sports Center: Highlights & Analysis",
            "Action replay: Classic Games",
            "Extreme sports: Red Bull Diaries",
            "Golf highlights: PGA Championship"
        ],
        News: [
            "Prime Time News bulletin",
            "World Report: International News Desk",
            "Business Hour: Market Updates",
            "Midnight Headlines: Global Focus",
            "Face the Nation: Politics Interview",
            "Special Report: Documentary Feature"
        ],
        Kids: [
            "Morning Fun: Animated Classics",
            "Doraemon Marathon Hour",
            "Disney Adventure Land Specials",
            "Cartoon Fiesta: Fun & Games",
            "Lego Block Building Adventures",
            "Gopal Bhar: Funny Stories",
            "Teen Nick Club: Afternoon Shows"
        ],
        Islamic: [
            "Peace in Islam: Quranic recitation",
            "Madani Live Prayer Broadcast",
            "Understanding Sunnah: Daily Lectures",
            "Hajj Pilgrimage Live Coverage",
            "Azan & Islamic Teachings Guide",
            "Islamic Q&A Live Call Session"
        ],
        Entertainment: [
            "Mega Drama: Evening Serial Series",
            "Movie Time: Top Hollywood Hits",
            "Travel Chronicles: Global Journey",
            "Golden Classic Cinema specials",
            "Music Express: Top 40 Hits Video",
            "Classic Talk Show: Celeb Interviews",
            "Global Culinary: Gourmet Chefs Cooking"
        ]
    };

    const shows = showDatabase[category] || showDatabase.Entertainment;
    // Pick show deterministically based on channel ID and current hour
    const hour = new Date().getHours();
    const index = (channelName.length + hour) % shows.length;
    
    // Set text EPG title
    metaEpgShowTitle.innerHTML = `CURRENT SHOW: <b>${shows[index]}</b>`;
    
    // Set random-like progress bar width matching the hour minutes
    const minutes = new Date().getMinutes();
    const percent = Math.max(15, Math.min(95, ((minutes + channelName.length) % 60) / 60 * 1000 / 10));
    epgProgressFill.style.width = `${percent}%`;
}

// 2. Favorites LocalStorage persistence
function loadFavorites() {
    try {
        const stored = localStorage.getItem('a1_tv_favorites');
        if (stored) {
            favoritesList = JSON.parse(stored);
        }
    } catch (e) {
        console.error("Failed to load favorites", e);
        favoritesList = [];
    }
}

function saveFavorites() {
    try {
        localStorage.setItem('a1_tv_favorites', JSON.stringify(favoritesList));
    } catch (e) {
        console.error("Failed to save favorites", e);
    }
}

function syncAutoFavoriteChannels() {
    const autoFavoriteIds = channels
        .filter(channel => featuredChannelIds.includes(channel.id))
        .map(channel => channel.id);

    if (autoFavoriteIds.length === 0) return;

    favoritesList = Array.from(new Set([...autoFavoriteIds, ...favoritesList]));
    saveFavorites();
}

function toggleFavorite(channelId, event) {
    if (event) event.stopPropagation(); // Avoid triggering channel click

    const index = favoritesList.indexOf(channelId);
    if (index === -1) {
        favoritesList.push(channelId);
    } else {
        favoritesList.splice(index, 1);
    }
    
    saveFavorites();
    
    // Update target star visual
    const starIcons = document.querySelectorAll(`.star-btn[data-id="${channelId}"]`);
    starIcons.forEach(btn => {
        if (favoritesList.includes(channelId)) {
            btn.classList.add('active');
            btn.innerText = '★';
        } else {
            btn.classList.remove('active');
            btn.innerText = '☆';
        }
    });

    // If active category is Favorites, re-render list
    if (selectedCategory === 'Favorites') {
        applyFilters();
    }
}

// 3. Filtering and Searching Channels
function switchCategory(categoryName) {
    selectedCategory = categoryName;
    
    // Update active state in nav layout
    const buttons = categoryNav.querySelectorAll('.tab-item');
    buttons.forEach(btn => {
        const isTarget = btn.innerText.includes(categoryName) || 
                         (categoryName === 'Favorites' && btn.innerText.includes('Favorites'));
        if (isTarget) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    applyFilters();
}

function toggleMoreCategories() {
    areMoreCategoriesVisible = !areMoreCategoriesVisible;
    categoryNav.classList.toggle('show-more-categories', areMoreCategoriesVisible);

    const toggleButton = document.getElementById('categoryToggleBtn');
    const toggleLabel = toggleButton.querySelector('.category-toggle-label');
    toggleButton.setAttribute('aria-expanded', String(areMoreCategoriesVisible));
    toggleLabel.innerText = areMoreCategoriesVisible ? 'Less' : 'More';
}

function handleSearchFilter() {
    searchQuery = channelSearch.value.toLowerCase().trim();
    
    // Toggle clear search button visibility
    if (searchQuery.length > 0) {
        clearSearchBtn.style.display = 'block';
    } else {
        clearSearchBtn.style.display = 'none';
    }

    applyFilters();
}

function clearSearchField() {
    channelSearch.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    applyFilters();
}

function updateSearchPlaceholder() {
    if (!channelSearch || typeof channels === 'undefined') return;
    channelSearch.placeholder = `Search ${channels.length} channels... (Press /)`;
}

function getFallbackChannelLogo(channelName) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(channelName)}&background=0D1117&color=00B4D8&bold=true`;
}

async function loadFifaPlaylistChannels() {
    try {
        const response = await fetch(FIFA_PLAYLIST_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load FIFA playlist (${response.status})`);
        }

        const encodedPlaylist = await response.text();
        const playlistText = decodeProtectedPlaylist(encodedPlaylist);
        const playlistChannels = parseM3uPlaylist(playlistText, channels);
        if (playlistChannels.length > 0) {
            channels.push(...playlistChannels);
        }
    } catch (error) {
        console.error('Failed to configure FIFA playlist', error);
    }
}

function decodeProtectedPlaylist(encodedPlaylist) {
    const normalized = encodedPlaylist.replace(/\s+/g, '');
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function parseM3uPlaylist(playlistText, existingChannels) {
    const lines = playlistText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const existingUrls = new Set(existingChannels.map(channel => channel.url));
    const playlistChannels = [];
    let nextId = existingChannels.reduce((maxId, channel) => Math.max(maxId, channel.id), 0) + 1;
    let pendingName = '';
    let playlistOrder = 0;

    for (const line of lines) {
        if (line.startsWith('#EXTINF')) {
            const extinfParts = line.split(',');
            pendingName = (extinfParts[extinfParts.length - 1] || '').trim();
            continue;
        }

        if (!/^https?:\/\//i.test(line)) {
            continue;
        }

        if (!line.includes('.m3u8')) {
            pendingName = '';
            continue;
        }

        const channelName = pendingName || `FIFA Channel ${playlistOrder + 1}`;
        pendingName = '';

        if (existingUrls.has(line)) {
            continue;
        }

        const cleanedName = channelName.replace(/\s+/g, ' ').trim();

        if (cleanedName === 'FIFA World Cup 2026') {
            continue;
        }

        playlistChannels.push({
            id: nextId++,
            name: cleanedName,
            logo: getFallbackChannelLogo(cleanedName),
            url: line,
            category: 'Sports',
            isFifaPlaylist: true,
            fifaPlaylistOrder: playlistOrder
        });

        existingUrls.add(line);
        playlistOrder += 1;
    }

    return playlistChannels;
}

function applyFilters() {
    if (typeof channels === 'undefined') return;

    visibleChannels = channels.filter(ch => {
        // Category constraint
        if (selectedCategory === 'Favorites') {
            if (!favoritesList.includes(ch.id)) return false;
        } else if (selectedCategory === 'FIFA') {
            if (!fifaChannelIds.has(ch.id) && !ch.isFifaPlaylist) return false;
        } else if (selectedCategory !== 'All') {
            if (ch.category !== selectedCategory) return false;
        }

        // Search text constraints
        if (searchQuery) {
            const matchesName = ch.name.toLowerCase().includes(searchQuery);
            const matchesCategory = ch.category.toLowerCase().includes(searchQuery);
            return matchesName || matchesCategory;
        }

        return true;
    });

    if (visibleChannels.length > 0) {
        visibleChannels.sort((a, b) => {
            const aIsFavorite = favoritesList.includes(a.id);
            const bIsFavorite = favoritesList.includes(b.id);
            const topPinnedIds = selectedCategory === 'All' ? featuredChannelIds : featuredTopChannelIds;
            const aIsFeatured = topPinnedIds.includes(a.id);
            const bIsFeatured = topPinnedIds.includes(b.id);
            const aIsPlaylist = Boolean(a.isFifaPlaylist);
            const bIsPlaylist = Boolean(b.isFifaPlaylist);

            if (aIsFavorite && !bIsFavorite) return -1;
            if (!aIsFavorite && bIsFavorite) return 1;

            if (aIsFeatured && bIsFeatured) {
                return topPinnedIds.indexOf(a.id) - topPinnedIds.indexOf(b.id);
            }

            if (aIsFeatured) return -1;
            if (bIsFeatured) return 1;

            if (selectedCategory !== 'All' && aIsPlaylist && bIsPlaylist) {
                return (a.fifaPlaylistOrder ?? Number.MAX_SAFE_INTEGER) - (b.fifaPlaylistOrder ?? Number.MAX_SAFE_INTEGER);
            }

            if (selectedCategory !== 'All') {
                if (aIsPlaylist) return -1;
                if (bIsPlaylist) return 1;
            }

            return 0;
        });
    }

    renderChannelsList();
}

function formatQualityLabel(level, index) {
    if (level.height) return `${level.height}p`;
    if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
    return `Level ${index + 1}`;
}

function resetQualityOptions() {
    if (!qualitySelect) return;
    qualitySelect.innerHTML = '<option value="auto">Auto</option>';
    qualitySelect.value = 'auto';
    qualitySelect.disabled = true;
}

function canUseNativeHlsPlayback() {
    return typeof videoPlayer.canPlayType === 'function' &&
        videoPlayer.canPlayType('application/vnd.apple.mpegurl') !== '';
}

function populateQualityOptions(levels = []) {
    if (!qualitySelect) return;

    qualitySelect.innerHTML = '<option value="auto">Auto</option>';

    if (!Array.isArray(levels) || levels.length === 0) {
        qualitySelect.disabled = true;
        qualitySelect.value = 'auto';
        return;
    }

    const seen = new Set();
    levels.forEach((level, index) => {
        const label = formatQualityLabel(level, index);
        if (seen.has(label)) return;
        seen.add(label);

        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = label;
        qualitySelect.appendChild(option);
    });

    qualitySelect.disabled = false;
    qualitySelect.value = selectedQuality === 'auto' ? 'auto' : String(selectedQuality);
    if (!qualitySelect.querySelector(`option[value="${qualitySelect.value}"]`)) {
        selectedQuality = 'auto';
        qualitySelect.value = 'auto';
    }
}

function changeStreamQuality(value) {
    selectedQuality = value;
    if (!hlsInstance) return;

    if (value === 'auto') {
        hlsInstance.currentLevel = -1;
        hlsInstance.nextLevel = -1;
        return;
    }

    const levelIndex = Number.parseInt(value, 10);
    if (Number.isNaN(levelIndex)) return;
    hlsInstance.currentLevel = levelIndex;
    hlsInstance.nextLevel = levelIndex;
}

// 4. Rendering visible channels
function renderChannelsList() {
    channelGrid.innerHTML = '';
    
    channelCountDisplay.innerText = `${selectedCategory} channels (${visibleChannels.length})`;

    if (visibleChannels.length === 0) {
        const fallback = document.createElement('div');
        fallback.className = 'channel-empty-state';
        fallback.innerText = searchQuery ? 'No matching channels found.' : 'No channels in this category yet.';
        channelGrid.appendChild(fallback);
        return;
    }

    visibleChannels.forEach((ch, visibleIdx) => {
        const isActive = ch.id === channels[currentChannelIndex].id;
        
        const card = document.createElement('div');
        card.className = `channel-card ${isActive ? 'active' : ''}`;
        card.setAttribute('data-id', ch.id);
        card.setAttribute('tabindex', '0');
        const isFavorite = favoritesList.includes(ch.id);
        
        card.innerHTML = `
            <div class="card-meta">
                <img class="card-logo" src="${ch.logo}" alt="${ch.name}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(ch.name)}&background=0D1117&color=00B4D8&bold=true'">
                <div class="card-name">${ch.name}</div>
                <span class="card-num">CH ${ch.id}</span>
            </div>
            <button class="star-btn ${isFavorite ? 'active' : ''}" data-id="${ch.id}" type="button" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">${isFavorite ? '★' : '+'}</button>
        `;

        const favoriteButton = card.querySelector('.star-btn');
        if (favoriteButton) {
            favoriteButton.addEventListener('click', (event) => {
                toggleFavorite(ch.id, event);
            });
        }

        card.addEventListener('click', () => {
            // Find global index of this channel in original data array
            const globalIdx = channels.findIndex(item => item.id === ch.id);
            if (globalIdx !== -1) {
                playChannelByIndex(globalIdx);
            }
        });

        // Add Enter click support for keyboard user cards
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                card.click();
            }
        });

        channelGrid.appendChild(card);
    });

    // Auto scroll selection list to ensure active card stays centered/visible
    const activeCard = channelGrid.querySelector('.channel-card.active');
    if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// 5. Video Playback & Hls Engine
function playChannelByIndex(index) {
    if (index < 0 || index >= channels.length) return;
    currentChannelIndex = index;
    const ch = channels[index];

    console.log(`[A1 TV] Playing Channel ${ch.id}: ${ch.name}`);

    // Update player active state overlays
    document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
    const currentCard = channelGrid.querySelector(`.channel-card[data-id="${ch.id}"]`);
    if (currentCard) {
        currentCard.classList.add('active');
    }

    // Dynamic titles and icons updating
    selectedChannelName.innerText = ch.name;
    metaChannelTitle.innerText = ch.name;
    metaChannelLogo.src = ch.logo;
    metaChannelLogo.onerror = () => {
        metaChannelLogo.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(ch.name)}&background=0D1117&color=00B4D8&bold=true`;
    };
    metaChannelCategory.innerText = ch.category.toUpperCase();
    updateMediaSessionMetadata(ch);

    // Trigger mock EPG detail loader
    generateMockEPG(ch.name, ch.category);

    // Destroy existing HLS wrapper
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }
    resetQualityOptions();
    hasAttemptedNativeFallback = false;
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    videoPlayer.onloadedmetadata = null;
    videoPlayer.oncanplay = null;

    // Display buffering spinner state
    videoBufferOverlay.style.display = 'flex';

    // Load stream source
    if (Hls.isSupported() && ch.url.includes('.m3u8')) {
        hlsInstance = new Hls({
            maxBufferLength: 10,
            maxMaxBufferLength: 20,
            enableWorker: true,
            renderTextTracksNatively: false,
            lowLatencyMode: !isAndroidDevice(),
            backBufferLength: 8
        });
        hlsInstance.loadSource(ch.url);
        hlsInstance.attachMedia(videoPlayer);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            disableLiveCaptions();
            populateQualityOptions(hlsInstance.levels);
            changeStreamQuality(selectedQuality);
            autoplayStream();
        });
        hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, disableLiveCaptions);

        // Error handling retry logic
        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch(data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.warn("[HLS Error] Network failure, trying to recover...");
                        hlsInstance.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.warn("[HLS Error] Media processing error, attempting recovery...");
                        hlsInstance.recoverMediaError();
                        break;
                    default:
                        console.error("[HLS Error] Fatal parsing issue, attempting fallback");
                        if (!hasAttemptedNativeFallback && canUseNativeHlsPlayback()) {
                            hasAttemptedNativeFallback = true;
                            if (hlsInstance) {
                                hlsInstance.destroy();
                                hlsInstance = null;
                            }
                            videoPlayer.src = ch.url;
                            videoPlayer.load();
                            videoPlayer.onloadedmetadata = () => autoplayStream();
                            videoPlayer.oncanplay = () => autoplayStream();
                        } else if (!hasAttemptedNativeFallback) {
                            hasAttemptedNativeFallback = true;
                            videoPlayer.src = ch.url;
                            videoPlayer.load();
                            videoPlayer.onloadedmetadata = () => autoplayStream();
                            videoPlayer.oncanplay = () => autoplayStream();
                        }
                        break;
                }
            }
        });
    } else if (canUseNativeHlsPlayback() && ch.url.includes('.m3u8')) {
        // Native HLS support for Safari on iPhone, iPad, and macOS
        resetQualityOptions();
        videoPlayer.src = ch.url;
        videoPlayer.load();

        // Safari can fire canplay more reliably than metadata for HLS streams
        videoPlayer.onloadedmetadata = () => {
            disableLiveCaptions();
            autoplayStream();
        };
        videoPlayer.oncanplay = () => {
            disableLiveCaptions();
            autoplayStream();
        };
    } else {
        // Regular MP4 or other browser-native format fallback
        resetQualityOptions();
        videoPlayer.src = ch.url;
        videoPlayer.load();
        videoPlayer.onloadedmetadata = () => {
            disableLiveCaptions();
            autoplayStream();
        };
        videoPlayer.oncanplay = () => {
            disableLiveCaptions();
            autoplayStream();
        };
    }
}

function autoplayStream() {
    audioUnmuteOverlay.style.display = 'none';

    // Try direct playback with sound first, then silently fall back to muted autoplay.
    videoPlayer.muted = false;
    let playPromise = videoPlayer.play();

    if (playPromise !== undefined) {
        playPromise.then(() => {
            hasUnlockedAudio = true;
            updatePlayIcon(true);
            videoBufferOverlay.style.display = 'none';
            volumeBar.value = videoPlayer.volume || 1;
            updateVolumeIcon(false);
        }).catch(playErr => {
            console.warn("[A1 TV] Autoplay with sound was blocked, retrying muted.", playErr);
            videoPlayer.muted = true;
            updateVolumeIcon(true);
            playPromise = videoPlayer.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    updatePlayIcon(true);
                    videoBufferOverlay.style.display = 'none';
                    volumeBar.value = 0;
                }).catch(mutedErr => {
                    console.error("[A1 TV] Failed to start playback", mutedErr);
                    updatePlayIcon(false);
                    videoBufferOverlay.style.display = 'none';
                });
            }
        });
    }
}

function unlockAudioStream() {
    hasUnlockedAudio = true;
    videoPlayer.muted = false;

    const resumePromise = videoPlayer.play();
    if (resumePromise !== undefined) {
        resumePromise.catch(() => {});
    }

    audioUnmuteOverlay.style.display = 'none';

    // Update volume bar value matching state
    volumeBar.value = videoPlayer.volume || 1;
    updateVolumeIcon(false);
    
    // Refocus active card
    const currentCard = channelGrid.querySelector(`.channel-card[data-id="${channels[currentChannelIndex].id}"]`);
    if (currentCard) currentCard.focus();
}

// 6. Controller triggers (Playback, Volume, Fullscreen)
function togglePlaybackState() {
    let playState = false;
    if (videoPlayer.paused) {
        videoPlayer.play();
        updatePlayIcon(true);
        playState = true;
    } else {
        videoPlayer.pause();
        updatePlayIcon(false);
        playState = false;
    }
    triggerPlayFlashAnimation(playState);
}

function updateMediaSessionMetadata(channel) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    navigator.mediaSession.metadata = new MediaMetadata({
        title: channel.name,
        artist: 'A1 TV Live',
        album: channel.category,
        artwork: channel.logo ? [{ src: channel.logo }] : []
    });
}

async function resumeBackgroundPlayback() {
    if (!isBackgroundPlayEnabled || (!videoPlayer.currentSrc && !videoPlayer.src && !hlsInstance)) return;

    try {
        if (videoPlayer.paused) {
            await videoPlayer.play();
        }
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    } catch (error) {
        console.warn('[Player] Mobile browser blocked background playback:', error);
    }
}

async function toggleBackgroundPlay() {
    isBackgroundPlayEnabled = !isBackgroundPlayEnabled;
    backgroundPlayBtn?.classList.toggle('active', isBackgroundPlayEnabled);
    backgroundPlayBtn?.setAttribute('aria-pressed', String(isBackgroundPlayEnabled));

    try {
        localStorage.setItem('a1_tv_background_play', String(isBackgroundPlayEnabled));
    } catch (error) {
        console.debug('[Player] Unable to save background play preference:', error);
    }

    if (isBackgroundPlayEnabled) {
        hasUnlockedAudio = true;
        videoPlayer.muted = false;
        volumeBar.value = videoPlayer.volume || 1;
        updateVolumeIcon(false);
        await resumeBackgroundPlayback();
    }
}

function initBackgroundPlayback() {
    try {
        isBackgroundPlayEnabled = localStorage.getItem('a1_tv_background_play') === 'true';
    } catch (error) {
        isBackgroundPlayEnabled = false;
    }

    backgroundPlayBtn?.classList.toggle('active', isBackgroundPlayEnabled);
    backgroundPlayBtn?.setAttribute('aria-pressed', String(isBackgroundPlayEnabled));

    if ('mediaSession' in navigator) {
        const setMediaAction = (action, handler) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (error) {
                console.debug(`[Player] Media Session action unavailable: ${action}`, error);
            }
        };

        setMediaAction('play', () => videoPlayer.play());
        setMediaAction('pause', () => videoPlayer.pause());
        setMediaAction('nexttrack', () => navigateChannelList(1));
        setMediaAction('previoustrack', () => navigateChannelList(-1));
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resumeBackgroundPlayback();
        }
    });
}

function updatePlayIcon(isPlaying) {
    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    }
}

function triggerPlayFlashAnimation(isPlaying) {
    // Hide icons matching states
    if (isPlaying) {
        flashIconPlay.style.display = 'block';
        flashIconPause.style.display = 'none';
    } else {
        flashIconPlay.style.display = 'none';
        flashIconPause.style.display = 'block';
    }
    
    // Reset classes trigger animation restarts
    playFlashOverlay.classList.remove('animate');
    void playFlashOverlay.offsetWidth; // Force reflow
    playFlashOverlay.classList.add('animate');
}

function adjustVolume(val) {
    videoPlayer.volume = val;
    if (val == 0) {
        videoPlayer.muted = true;
        updateVolumeIcon(true);
    } else {
        hasUnlockedAudio = true;
        videoPlayer.muted = false;
        updateVolumeIcon(false);
    }
}

function toggleVolumeMute() {
    if (videoPlayer.muted) {
        hasUnlockedAudio = true;
        videoPlayer.muted = false;
        volumeBar.value = videoPlayer.volume || 1;
        updateVolumeIcon(false);
    } else {
        videoPlayer.muted = true;
        volumeBar.value = 0;
        updateVolumeIcon(true);
    }
}

function updateVolumeIcon(isMuted) {
    if (isMuted) {
        volumeOnIcon.style.display = 'none';
        volumeMutedIcon.style.display = 'block';
    } else {
        volumeOnIcon.style.display = 'block';
        volumeMutedIcon.style.display = 'none';
    }
}

async function lockMobileLandscape() {
    if (!window.matchMedia('(max-width: 1024px)').matches) return;
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') return;

    try {
        await screen.orientation.lock('landscape');
    } catch (error) {
        console.debug('[Player] Landscape orientation lock unavailable:', error);
    }
}

function unlockMobileOrientation() {
    if (!screen.orientation || typeof screen.orientation.unlock !== 'function') return;

    try {
        screen.orientation.unlock();
    } catch (error) {
        console.debug('[Player] Orientation unlock unavailable:', error);
    }
}

function supportsPictureInPicture() {
    const canUseStandardPip =
        typeof document.pictureInPictureEnabled !== 'undefined' &&
        document.pictureInPictureEnabled &&
        typeof videoPlayer.requestPictureInPicture === 'function';

    const canUseWebkitPip =
        typeof videoPlayer.webkitSupportsPresentationMode === 'function' &&
        videoPlayer.webkitSupportsPresentationMode('picture-in-picture') &&
        typeof videoPlayer.webkitSetPresentationMode === 'function';

    return canUseStandardPip || canUseWebkitPip;
}

function syncPipButtonState() {
    if (!pipModeBtn) return;

    const isSupported = supportsPictureInPicture();
    pipModeBtn.disabled = !isSupported;
    pipModeBtn.classList.toggle('disabled', !isSupported);
    pipModeBtn.setAttribute('aria-disabled', String(!isSupported));
    pipModeBtn.title = isSupported
        ? 'Picture-in-Picture'
        : 'Picture-in-Picture is not supported in this browser';
}

async function requestStageFullscreen() {
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (videoContainer.requestFullscreen) {
                await videoContainer.requestFullscreen();
                await lockMobileLandscape();
            } else if (videoContainer.webkitRequestFullscreen) {
                videoContainer.webkitRequestFullscreen();
                await lockMobileLandscape();
            } else if (videoPlayer.webkitEnterFullscreen) {
                videoPlayer.webkitEnterFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
            unlockMobileOrientation();
        }
    } catch (error) {
        console.warn('[Player] Fullscreen or landscape mode unavailable:', error);
    }
}

async function togglePipMode() {
    try {
        if (!supportsPictureInPicture()) {
            throw new Error('Picture-in-Picture is not supported by this browser.');
        }

        if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
        } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }

        if (document.pictureInPictureElement && document.exitPictureInPicture) {
            await document.exitPictureInPicture();
            return;
        }

        if (videoPlayer.readyState === 0 || (!videoPlayer.currentSrc && !videoPlayer.src)) {
            throw new Error('Select a channel before opening Picture-in-Picture.');
        }

        if (videoPlayer.paused) {
            await videoPlayer.play();
        }

        if (document.pictureInPictureEnabled && videoPlayer.requestPictureInPicture) {
            await videoPlayer.requestPictureInPicture();
            return;
        }

        if (typeof videoPlayer.webkitSupportsPresentationMode === 'function' &&
            videoPlayer.webkitSupportsPresentationMode('picture-in-picture') &&
            typeof videoPlayer.webkitSetPresentationMode === 'function') {
            const nextMode = videoPlayer.webkitPresentationMode === 'picture-in-picture'
                ? 'inline'
                : 'picture-in-picture';
            videoPlayer.webkitSetPresentationMode(nextMode);
            return;
        }

        throw new Error('Picture-in-Picture is unavailable for the current stream.');
    } catch (error) {
        console.warn('[Player] Picture-in-Picture unavailable:', error);
        pipModeBtn?.classList.remove('active');
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) unlockMobileOrientation();
});

document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) unlockMobileOrientation();
});

videoPlayer.addEventListener('enterpictureinpicture', () => pipModeBtn?.classList.add('active'));
videoPlayer.addEventListener('leavepictureinpicture', () => pipModeBtn?.classList.remove('active'));
videoPlayer.addEventListener('webkitpresentationmodechanged', () => {
    pipModeBtn?.classList.toggle('active', videoPlayer.webkitPresentationMode === 'picture-in-picture');
});
syncPipButtonState();

// 7. Aesthetics: Ambient Canvas Backlight & Theater Dimming
function toggleTheaterMode() {
    isTheaterMode = !isTheaterMode;
    const btn = document.getElementById('dimLightsBtn');
    if (isTheaterMode) {
        document.body.classList.add('theater-mode');
        btn.classList.add('active');
    } else {
        document.body.classList.remove('theater-mode');
        btn.classList.remove('active');
    }
}

function toggleAmbientLighting() {
    isAmbientGlowActive = !isAmbientGlowActive;
    
    if (isAmbientGlowActive) {
        ambientGlowBtn.classList.remove('active');
        playerOuterStage.classList.add('glowing');
        startAmbientExtractor();
    } else {
        ambientGlowBtn.classList.add('active');
        playerOuterStage.classList.remove('glowing');
        stopAmbientExtractor();
    }
}

function startAmbientExtractor() {
    stopAmbientExtractor();
    
    const context = ambientCanvas.getContext('2d');
    
    ambientInterval = setInterval(() => {
        if (videoPlayer.paused || videoPlayer.ended || !isAmbientGlowActive) return;
        
        // Low resolution sample sizes (handles blurring efficiently via CSS filters)
        const w = 24;
        const h = 14;
        ambientCanvas.width = w;
        ambientCanvas.height = h;
        
        try {
            // Draw video frame to ambient canvas background
            context.drawImage(videoPlayer, 0, 0, w, h);
            
            // Periodically extract the canvas frame and generate secondary backdrop gradients
            const data = context.getImageData(0, 0, 5, 5).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 8 || data[i+1] > 8 || data[i+2] > 8) {
                    r += data[i];
                    g += data[i+1];
                    b += data[i+2];
                    count++;
                }
            }
            if (count > 0) {
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
                ambientBackdrop.style.background = `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.16) 0%, rgba(${r}, ${g}, ${b}, 0.05) 50%, transparent 100%)`;
            }
        } catch (e) {
            // CORS blocks canvas read triggers on cross-domain feeds.
            // Fallback: drawImage works on some platforms, otherwise canvas remains empty
        }
    }, 200);
}

function stopAmbientExtractor() {
    if (ambientInterval) {
        clearInterval(ambientInterval);
        ambientInterval = null;
    }
}

function showPlayerControls(autoHide = true) {
    if (!videoContainer) return;
    videoContainer.classList.add('show-controls');

    if (controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
    }

    if (autoHide) {
        controlsHideTimer = setTimeout(() => {
            if (!videoContainer.matches(':focus-within')) {
                videoContainer.classList.remove('show-controls');
            }
        }, 2000);
    }
}

function hidePlayerControls() {
    if (!videoContainer) return;
    if (controlsHideTimer) {
        clearTimeout(controlsHideTimer);
        controlsHideTimer = null;
    }
    videoContainer.classList.remove('show-controls');
}

// 8. Video Player buffer loading states listeners
videoPlayer.addEventListener('waiting', () => {
    videoBufferOverlay.style.display = 'flex';
});

videoPlayer.addEventListener('playing', () => {
    videoBufferOverlay.style.display = 'none';
    if (isAmbientGlowActive) startAmbientExtractor();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

videoPlayer.addEventListener('seeking', () => {
    videoBufferOverlay.style.display = 'flex';
});

videoPlayer.addEventListener('seeked', () => {
    videoBufferOverlay.style.display = 'none';
});

videoPlayer.addEventListener('stalled', () => {
    videoBufferOverlay.style.display = 'flex';
    if (hlsInstance) {
        try {
            hlsInstance.startLoad();
        } catch (error) {
            console.warn('[A1 TV] Unable to restart HLS load after stall', error);
        }
    } else {
        videoPlayer.load();
    }
});

videoPlayer.addEventListener('error', () => {
    videoBufferOverlay.style.display = 'none';
    updatePlayIcon(false);
});

videoPlayer.addEventListener('pause', () => {
    stopAmbientExtractor();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    if (document.hidden && isBackgroundPlayEnabled) {
        window.setTimeout(resumeBackgroundPlayback, 250);
    }
});
videoPlayer.addEventListener('ended', stopAmbientExtractor);

// 9. Keyboard navigation inputs
function initAppControls() {
    // Enable custom settings defaults
    playerOuterStage.classList.add('glowing');
    startAmbientExtractor();
    initBackgroundPlayback();

    videoContainer.addEventListener('mouseenter', () => showPlayerControls(true));
    videoContainer.addEventListener('mousemove', () => showPlayerControls(true));
    videoContainer.addEventListener('mouseleave', hidePlayerControls);
    videoContainer.addEventListener('focusin', () => showPlayerControls(false));
    videoContainer.addEventListener('focusout', () => {
        window.setTimeout(() => {
            if (!videoContainer.matches(':focus-within')) {
                hidePlayerControls();
            }
        }, 0);
    });
    videoContainer.addEventListener('touchstart', () => showPlayerControls(true), { passive: true });

    window.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        // Bypass keyboard navigation when search box is focused
        if (document.activeElement === channelSearch) {
            if (key === 'escape') {
                channelSearch.blur();
                e.preventDefault();
            }
            return;
        }

        // Spacebar: Play/Pause state toggle
        if (e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32) {
            e.preventDefault();
            togglePlaybackState();
        }

        // Arrow Up: Previous Channel
        if (e.key === 'ArrowUp' || e.keyCode === 38) {
            e.preventDefault();
            navigateChannelList(-1);
        }

        // Arrow Down: Next Channel
        if (e.key === 'ArrowDown' || e.keyCode === 40) {
            e.preventDefault();
            navigateChannelList(1);
        }

        // Key F: Fullscreen
        if (key === 'f') {
            e.preventDefault();
            requestStageFullscreen();
        }

        // Key M: Mute volume
        if (key === 'm') {
            e.preventDefault();
            toggleVolumeMute();
        }

        // Key T: Theater dim lights mode
        if (key === 't') {
            e.preventDefault();
            toggleTheaterMode();
        }

        // Key S or /: Focus Search fields
        if (key === 's' || e.key === '/') {
            e.preventDefault();
            channelSearch.focus();
        }

        // Numbers 1-9: Channel switching shortcut triggers
        if (e.key >= '1' && e.key <= '9') {
            const index = parseInt(e.key) - 1;
            if (index < visibleChannels.length) {
                const globalIdx = channels.findIndex(item => item.id === visibleChannels[index].id);
                if (globalIdx !== -1) {
                    playChannelByIndex(globalIdx);
                }
            }
        }
    });
}

function navigateChannelList(direction) {
    if (visibleChannels.length === 0) return;

    // Find active channel inside filtered visible lists
    const activeId = channels[currentChannelIndex].id;
    const visibleIdx = visibleChannels.findIndex(item => item.id === activeId);

    let nextIdx = 0;
    if (visibleIdx !== -1) {
        nextIdx = visibleIdx + direction;
        
        // Constraints boundaries
        if (nextIdx < 0) nextIdx = 0;
        if (nextIdx >= visibleChannels.length) nextIdx = visibleChannels.length - 1;
    }

    const targetChannel = visibleChannels[nextIdx];
    const globalIdx = channels.findIndex(item => item.id === targetChannel.id);
    if (globalIdx !== -1) {
        playChannelByIndex(globalIdx);
    }
}

// Help shortcuts toggling overlays
function toggleHelpModal() {
    if (helpModal.style.display === 'none') {
        helpModal.style.display = 'flex';
    } else {
        helpModal.style.display = 'none';
    }
}

function closeHelpModalOutside(event) {
    if (event.target === helpModal) {
        helpModal.style.display = 'none';
    }
}

// Sharing stream functionality URL copy helper
function shareStream() {
    const activeCh = channels[currentChannelIndex];
    const shareText = `Streaming live: ${activeCh.name} on A1 TV!`;
    const shareUrl = `${window.location.origin}${window.location.pathname}?ch=${activeCh.id}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'A1 TV Live',
            text: shareText,
            url: shareUrl
        }).catch(err => console.log('Error sharing', err));
    } else {
        // Fallback copying to Clipboard
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert(`Stream link copied to clipboard:\n${shareUrl}`);
        }).catch(err => console.log('Error clipboard copy', err));
    }
}
