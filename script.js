/**
 * 沉浸式媒体播放器 - 重构版
 * 修复了焦点管理、内存泄漏等问题
 */

(function() {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        preloadCount: 5,      // 预加载数量
        maxRetries: 3,        // 最大重试次数
        historyLimit: 50,     // 历史记录限制
        imageDisplayTime: 3000, // 图片显示时间(ms)
        wheelDebounce: 800,   // 滚轮防抖时间(ms)
        touchThreshold: 50,   // 触摸滑动阈值(px)
        seekTime: 5,          // 快进/快退秒数
        toastDuration: 2000,  // 提示显示时间(ms)
        fetchTimeout: 5000    // 请求超时时间(ms)
    };

    // ==================== DOM 元素 ====================
    const DOM = {
        apiSelect: null,
        nextBtn: null,
        muteBtn: null,
        downloadBtn: null,
        pipBtn: null,
        loadingSpinner: null,
        toast: null,
        bgBlur: null,
        progressBar: null,
        mainVideo: null,
        mainImage: null
    };

    // ==================== 状态管理 ====================
    const state = {
        queue: [],
        isFetching: false,
        currentMedia: null,
        isMuted: true,
        history: [],
        isLoading: false,
        lastWheelTime: 0,
        touchStartY: 0,
        isPiPActive: false,
        imageTimer: null,
        abortController: null  // 用于取消请求
    };

    // ==================== 初始化 ====================
    function init() {
        cacheDOM();
        bindEvents();
        updateMuteIcon();
        // 移除 select 的默认焦点，确保键盘事件正常工作
        DOM.apiSelect.blur();
        document.body.focus();
        autoStart();
    }

    function cacheDOM() {
        DOM.apiSelect = document.getElementById('api-select');
        DOM.nextBtn = document.getElementById('next-btn');
        DOM.muteBtn = document.getElementById('mute-btn');
        DOM.downloadBtn = document.getElementById('download-btn');
        DOM.pipBtn = document.getElementById('pip-btn');
        DOM.loadingSpinner = document.getElementById('loading-spinner');
        DOM.toast = document.getElementById('toast');
        DOM.bgBlur = document.getElementById('bg-blur');
        DOM.progressBar = document.getElementById('progress-bar');
        DOM.mainVideo = document.getElementById('main-video');
        DOM.mainImage = document.getElementById('main-image');
    }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        // 点击页面取消静音
        document.addEventListener('click', handleDocumentClick);

        // 控制按钮
        DOM.nextBtn.addEventListener('click', () => loadNextMedia(true));
        DOM.muteBtn.addEventListener('click', toggleMute);
        DOM.downloadBtn.addEventListener('click', downloadCurrent);

        if (DOM.pipBtn) {
            DOM.pipBtn.addEventListener('click', togglePiP);
        }

        // API 选择变更
        DOM.apiSelect.addEventListener('change', handleApiChange);

        // 键盘控制
        window.addEventListener('keydown', handleKeydown);

        // 滚轮控制
        window.addEventListener('wheel', handleWheel, { passive: false });

        // 触摸控制
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });

        // 视频事件
        DOM.mainVideo.addEventListener('ended', handleVideoEnded);
        DOM.mainVideo.addEventListener('error', handleVideoError);
        DOM.mainVideo.addEventListener('timeupdate', handleTimeUpdate);
        DOM.mainVideo.addEventListener('enterpictureinpicture', () => { state.isPiPActive = true; });
        DOM.mainVideo.addEventListener('leavepictureinpicture', () => { state.isPiPActive = false; });

        // 图片加载失败
        DOM.mainImage.addEventListener('error', handleImageError);

        // Media Session API
        setupMediaSession();
    }

    // ==================== 事件处理器 ====================
    function handleDocumentClick(e) {
        // 排除控制按钮和选择框的点击
        if (e.target.closest('.control-btn') ||
            e.target.closest('.top-bar') ||
            e.target.closest('select')) {
            return;
        }
        startPlayback();
    }

    function handleApiChange() {
        // 移除焦点，防止左右键切换类别
        DOM.apiSelect.blur();

        // 清除图片轮播定时器
        clearImageTimer();

        // 取消正在进行的请求
        cancelPendingRequests();

        // 重置状态
        state.queue = [];
        state.currentMedia = null;
        state.history = [];
        state.isLoading = false;
        state.isFetching = false;

        // 重置媒体元素
        DOM.mainVideo.style.display = 'none';
        DOM.mainVideo.pause();
        DOM.mainVideo.src = '';
        DOM.mainImage.style.display = 'none';
        DOM.mainImage.src = '';

        showToast(`已切换到: ${DOM.apiSelect.options[DOM.apiSelect.selectedIndex].text}`);
        loadNextMedia(true);
    }

    function handleKeydown(e) {
        // 如果焦点在 select 上，阻止默认行为
        const isSelectFocused = document.activeElement === DOM.apiSelect;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                loadNextMedia(true);
                break;
            case 'ArrowUp':
                e.preventDefault();
                loadPrevMedia();
                break;
            case 'ArrowRight':
                e.preventDefault();
                seekVideo(CONFIG.seekTime);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                seekVideo(-CONFIG.seekTime);
                break;
            case ' ':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'm':
            case 'M':
                toggleMute();
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
            case 'p':
            case 'P':
                togglePiP();
                break;
            case 'Escape':
                if (isSelectFocused) {
                    DOM.apiSelect.blur();
                }
                break;
        }
    }

    function handleWheel(e) {
        const now = Date.now();
        if (now - state.lastWheelTime > CONFIG.wheelDebounce) {
            if (e.deltaY > 0) {
                loadNextMedia(true);
            } else if (e.deltaY < 0) {
                loadPrevMedia();
            }
            state.lastWheelTime = now;
        }
    }

    function handleTouchStart(e) {
        state.touchStartY = e.touches[0].clientY;
    }

    function handleTouchEnd(e) {
        const touchEndY = e.changedTouches[0].clientY;
        const diffY = state.touchStartY - touchEndY;

        if (Math.abs(diffY) > CONFIG.touchThreshold) {
            if (diffY > 0) {
                loadNextMedia(true);
            } else {
                loadPrevMedia();
            }
        }
    }

    function handleVideoEnded() {
        console.log("Video ended, loading next...");
        loadNextMedia();
    }

    function handleVideoError(e) {
        if (DOM.mainVideo.style.display !== 'none' && state.currentMedia) {
            console.error("Video load error:", e);
            showToast("视频加载失败，自动切换");
            setTimeout(() => loadNextMedia(), 500);
        }
    }

    function handleImageError(e) {
        if (DOM.mainImage.style.display !== 'none' && state.currentMedia) {
            console.error("Image load error:", e);
            showToast("图片加载失败，自动切换");
            setTimeout(() => loadNextMedia(), 500);
        }
    }

    function handleTimeUpdate() {
        if (DOM.mainVideo.duration) {
            const percent = (DOM.mainVideo.currentTime / DOM.mainVideo.duration) * 100;
            DOM.progressBar.style.width = `${percent}%`;
        }
    }

    // ==================== 播放控制 ====================
    function autoStart() {
        state.isMuted = true;
        updateMuteIcon();
        loadNextMedia(true);
    }

    function startPlayback() {
        if (!state.isMuted) return;
        state.isMuted = false;
        DOM.mainVideo.muted = false;
        updateMuteIcon();
        showToast("已取消静音");
    }

    function togglePlayPause() {
        if (DOM.mainVideo.style.display === 'none') return;

        if (DOM.mainVideo.paused) {
            DOM.mainVideo.play();
            showToast("播放");
        } else {
            DOM.mainVideo.pause();
            showToast("暂停");
        }
    }

    function seekVideo(seconds) {
        if (DOM.mainVideo.style.display === 'none') return;

        const newTime = DOM.mainVideo.currentTime + seconds;
        DOM.mainVideo.currentTime = Math.max(0, Math.min(newTime, DOM.mainVideo.duration || 0));

        const direction = seconds > 0 ? '快进' : '快退';
        showToast(`${direction} ${Math.abs(seconds)} 秒`);
    }

    function toggleMute() {
        state.isMuted = !state.isMuted;
        DOM.mainVideo.muted = state.isMuted;
        updateMuteIcon();
        showToast(state.isMuted ? "已静音" : "已取消静音");
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                showToast("无法进入全屏");
            });
        } else {
            document.exitFullscreen();
        }
    }

    async function togglePiP() {
        if (DOM.mainVideo.style.display === 'none') {
            showToast("当前不是视频，无法画中画");
            return;
        }

        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                showToast("已退出画中画");
            } else {
                if (DOM.mainVideo.readyState < 1) {
                    showToast("请等待视频加载后再试");
                    return;
                }
                await DOM.mainVideo.requestPictureInPicture();
                showToast("已开启画中画");
            }
        } catch (error) {
            console.error("PiP failed:", error);
            showToast("无法启用画中画");
        }
    }

    // ==================== 媒体加载 ====================
    async function loadPrevMedia() {
        if (state.history.length === 0) {
            showToast("没有上一条了");
            return;
        }

        const prevMedia = state.history.pop();
        state.currentMedia = prevMedia;
        renderMedia(prevMedia);
        showToast("上一条");
    }

    async function loadNextMedia(force = false) {
        if (state.isLoading && !force) return;

        if (force) {
            state.isLoading = false;
            cancelPendingRequests();
        }

        showLoading(true);
        state.isLoading = true;

        try {
            // 保存当前媒体到历史
            if (state.currentMedia) {
                state.history.push(state.currentMedia);
                if (state.history.length > CONFIG.historyLimit) {
                    state.history.shift();
                }
            }

            // 确保队列有内容
            if (state.queue.length === 0) {
                await fillQueue(1);
            }

            if (state.queue.length > 0) {
                const mediaItem = state.queue.shift();
                state.currentMedia = mediaItem;
                renderMedia(mediaItem);
                state.isLoading = false;

                // 后台填充队列
                fillQueue();
            } else {
                showToast("获取资源失败，自动重试...");
                setTimeout(() => {
                    state.isLoading = false;
                    loadNextMedia();
                }, 1500);
            }
        } catch (error) {
            console.error("Load media error:", error);
            showToast("网络错误，请检查连接");
            state.isLoading = false;
        } finally {
            if (state.currentMedia) showLoading(false);
        }
    }

    async function fillQueue(targetCount = CONFIG.preloadCount) {
        if (state.isFetching) return;
        state.isFetching = true;

        const currentApi = DOM.apiSelect.value;
        const isVideoApi = DOM.apiSelect.options[DOM.apiSelect.selectedIndex].parentElement.label === '视频';
        let retryCount = 0;

        try {
            while (state.queue.length < targetCount && retryCount < CONFIG.maxRetries * targetCount) {
                const url = await fetchRealUrl(currentApi, !isVideoApi);

                if (url && !state.queue.some(item => item.url === url)) {
                    // 预加载图片
                    if (!isVideoApi) {
                        const img = new Image();
                        img.src = url;
                    }

                    state.queue.push({
                        url: url,
                        type: isVideoApi ? 'video' : 'image'
                    });
                    console.log(`Added to queue: ${url}`);
                    retryCount = 0;
                } else {
                    retryCount++;
                    await sleep(500);
                }
            }
        } catch (e) {
            console.error("Queue fill error:", e);
        } finally {
            state.isFetching = false;
        }
    }

    async function fetchRealUrl(api, isImage = false) {
        try {
            const target = `${api}?t=${Date.now()}&r=${Math.random()}`;

            // 图片 API 直接返回带时间戳的 URL
            if (isImage) {
                return target;
            }

            state.abortController = new AbortController();

            const response = await fetch(target, {
                method: 'GET',
                mode: 'cors',
                referrerPolicy: 'no-referrer',
                signal: state.abortController.signal
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            return response.url || target;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Request aborted");
            } else {
                console.warn("Fetch URL failed:", error);
            }
            return null;
        }
    }

    function renderMedia(mediaItem) {
        // 清除图片轮播定时器
        clearImageTimer();

        // 更新背景
        DOM.bgBlur.style.backgroundImage = `url('${mediaItem.url}')`;
        DOM.progressBar.style.width = '0%';

        if (mediaItem.type === 'video') {
            renderVideo(mediaItem);
        } else {
            renderImage(mediaItem);
        }
    }

    function renderVideo(mediaItem) {
        DOM.mainImage.style.display = 'none';
        DOM.mainImage.src = '';

        DOM.mainVideo.style.display = 'block';

        // 更新 Media Session Metadata
        updateMediaSessionMetadata('视频');

        // 切换视频源
        DOM.mainVideo.src = mediaItem.url;
        DOM.mainVideo.muted = state.isMuted;

        const playPromise = DOM.mainVideo.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Auto-play prevented:", error);
                DOM.mainVideo.muted = true;
                state.isMuted = true;
                updateMuteIcon();
                DOM.mainVideo.play();
                showToast("已自动静音播放");
            });
        }
    }

    function renderImage(mediaItem) {
        // 如果在画中画模式下切到图片，先退出画中画
        if (state.isPiPActive && document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(console.error);
        }

        DOM.mainVideo.style.display = 'none';
        DOM.mainVideo.pause();

        DOM.mainImage.style.display = 'block';
        DOM.mainImage.src = mediaItem.url;

        // 图片自动轮播
        state.imageTimer = setTimeout(() => {
            loadNextMedia();
        }, CONFIG.imageDisplayTime);

        // 图片进度条动画
        DOM.progressBar.style.transition = `width ${CONFIG.imageDisplayTime}ms linear`;
        DOM.progressBar.style.width = '100%';
        setTimeout(() => {
            DOM.progressBar.style.transition = 'none';
        }, 50);
    }

    // ==================== 工具函数 ====================
    function updateMuteIcon() {
        const icon = DOM.muteBtn.querySelector('i');
        if (state.isMuted) {
            icon.className = 'fas fa-volume-mute';
            DOM.muteBtn.style.background = 'rgba(255, 50, 50, 0.4)';
        } else {
            icon.className = 'fas fa-volume-up';
            DOM.muteBtn.style.background = 'rgba(255, 255, 255, 0.15)';
        }
    }

    function downloadCurrent() {
        if (!state.currentMedia) {
            showToast("没有可下载的内容");
            return;
        }

        const url = state.currentMedia.url;
        const ext = state.currentMedia.type === 'video' ? 'mp4' : 'jpg';
        const filename = `media_${Date.now()}.${ext}`;

        fetch(url)
            .then(resp => resp.blob())
            .then(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
                showToast("下载成功");
            })
            .catch(() => {
                // 降级方案：直接打开链接
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast("正在尝试下载...");
            });
    }

    function showLoading(show) {
        DOM.loadingSpinner.style.display = show ? 'block' : 'none';
    }

    function showToast(msg) {
        DOM.toast.textContent = msg;
        DOM.toast.classList.add('show');
        setTimeout(() => {
            DOM.toast.classList.remove('show');
        }, CONFIG.toastDuration);
    }

    function clearImageTimer() {
        if (state.imageTimer) {
            clearTimeout(state.imageTimer);
            state.imageTimer = null;
        }
    }

    function cancelPendingRequests() {
        if (state.abortController) {
            state.abortController.abort();
            state.abortController = null;
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function setupMediaSession() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.setActionHandler('previoustrack', () => loadPrevMedia());
        navigator.mediaSession.setActionHandler('nexttrack', () => loadNextMedia(true));
        navigator.mediaSession.setActionHandler('play', () => {
            if (DOM.mainVideo.paused) DOM.mainVideo.play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
            if (!DOM.mainVideo.paused) DOM.mainVideo.pause();
        });
    }

    function updateMediaSessionMetadata(type) {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: `随机${type}`,
            artist: DOM.apiSelect.options[DOM.apiSelect.selectedIndex].text,
            album: '沉浸式播放器'
        });
    }

    // ==================== 启动 ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
