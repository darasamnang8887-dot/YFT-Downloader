document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const urlInput = document.getElementById('video-url');
    const pasteBtn = document.getElementById('btn-paste');
    const analyzeBtn = document.getElementById('btn-analyze');
    
    // Badges
    const badgeYoutube = document.getElementById('badge-youtube');
    const badgeFacebook = document.getElementById('badge-facebook');
    const badgeTiktok = document.getElementById('badge-tiktok');
    const badges = [badgeYoutube, badgeFacebook, badgeTiktok];
    
    // Areas
    const loadingArea = document.getElementById('loading-area');
    const previewArea = document.getElementById('preview-area');
    const progressArea = document.getElementById('progress-area');
    
    // Preview Card Elements
    const videoThumb = document.getElementById('video-thumb');
    const videoDuration = document.getElementById('video-duration');
    const platformBadge = document.getElementById('platform-badge');
    const videoTitle = document.getElementById('video-title');
    const videoUploader = document.getElementById('video-uploader');
    const formatSelect = document.getElementById('format-select');
    const downloadBtn = document.getElementById('btn-download');
    
    // Progress Card Elements
    const stepExtract = document.getElementById('step-extract');
    const stepDownload = document.getElementById('step-download');
    const stepStream = document.getElementById('step-stream');
    const progressBarFill = document.querySelector('.progress-bar-fill');
    const progressStatusText = document.getElementById('progress-status-text');
    
    // History & Install
    const historyList = document.getElementById('history-list');
    const installBtn = document.getElementById('install-btn');
    
    let deferredPrompt;
    let currentVideoData = null;

    // Load History on start
    renderHistory();

    // Register Service Worker for PWA compliance
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registered successfully.', reg.scope))
                .catch(err => console.log('Service Worker registration failed:', err));
        });
    }

    // PWA Install prompt interceptor
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to show the install button
        installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Show the prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, discard it
        deferredPrompt = null;
        // Hide the install button
        installBtn.classList.add('hidden');
    });

    // Auto detect platform based on URL
    urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        detectPlatform(url);
    });

    // Helper: Show custom premium toast notification
    function showToast(message) {
        const oldToast = document.querySelector('.yft-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.className = 'yft-toast';
        toast.innerText = message;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 50);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // Paste from clipboard button
    pasteBtn.addEventListener('click', async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                urlInput.value = text;
                detectPlatform(text);
                showToast("បិទភ្ជាប់បានជោគជ័យ! (Pasted successfully!)");
            } else {
                throw new Error("Clipboard API blocked by browser over HTTP");
            }
        } catch (err) {
            // Fallback: focus input and prompt user to paste natively
            urlInput.focus();
            showToast("សូមចុចឱ្យជាប់លើប្រអប់បញ្ចូល រួចជ្រើសរើសពាក្យ 'Paste'\n(Please long-press the input box and select Paste)");
        }
    });

    // Analyze Video URL
    analyzeBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert("សូមបញ្ចូលអាសយដ្ឋាន URL វីដេអូ! (Please enter a video URL)");
            return;
        }

        // Hide previews and show loading
        previewArea.classList.add('hidden');
        progressArea.classList.add('hidden');
        loadingArea.classList.remove('hidden');

        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Failed to analyze URL");
            }

            currentVideoData = result;
            currentVideoData.originalUrl = url; // save original url

            // Populate Preview UI
            videoThumb.src = result.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500';
            videoDuration.textContent = result.duration;
            videoTitle.textContent = result.title;
            videoUploader.textContent = result.uploader;
            
            // Platform styling
            platformBadge.textContent = result.platform;
            platformBadge.className = `platform-badge ${result.platform}`;

            // Populate Formats Dropdown
            formatSelect.innerHTML = '';
            result.formats.forEach(fmt => {
                const option = document.createElement('option');
                option.value = fmt.id;
                option.textContent = `${fmt.label} (${fmt.ext.toUpperCase()})`;
                formatSelect.appendChild(option);
            });

            // Show Preview
            loadingArea.classList.add('hidden');
            previewArea.classList.remove('hidden');

        } catch (error) {
            loadingArea.classList.add('hidden');
            alert(error.message);
        }
    });

    // Trigger Video Download
    downloadBtn.addEventListener('click', async () => {
        if (!currentVideoData) return;

        const formatId = formatSelect.value;
        const formatLabel = formatSelect.options[formatSelect.selectedIndex].text;

        // Reset and show progress tracker
        previewArea.classList.add('hidden');
        progressArea.classList.remove('hidden');
        
        updateProgress(1, 20, "កំពុងវិភាគវីដេអូនៅលើម៉ាស៊ីនបម្រើ (Analyzing video...)");

        try {
            // Fake animation progress while server downloads
            // Step 1: Analysing (20%) -> Step 2: Downloading on Server (50% to 80%)
            setTimeout(() => {
                updateProgress(2, 45, "កំពុងទាញយកវីដេអូចូលម៉ាស៊ីនបម្រើ... (Downloading on Server...)");
            }, 1200);

            setTimeout(() => {
                updateProgress(2, 70, "កំពុងដំណើរការបញ្ចូលគ្នា និងបម្លែងទម្រង់ឯកសារ... (Merging streams...)");
            }, 3500);

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: currentVideoData.originalUrl,
                    format_id: formatId
                })
            });

            if (!response.ok) {
                const errResult = await response.json().catch(() => ({}));
                throw new Error(errResult.error || "ការទាញយកបានបរាជ័យ (Download failed)");
            }

            // Step 3: Server Streaming to Phone (85% -> 100%)
            updateProgress(3, 90, "កំពុងផ្ទេរឯកសារចូលទូរសព្ទបង... (Streaming file to mobile...)");

            // Convert response body to blob and download it
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            
            // Get content-disposition header if available to extract clean filename
            const contentDisp = response.headers.get('Content-Disposition');
            let filename = `${currentVideoData.title.substring(0, 30)}.${formatId === 'bestaudio' ? 'mp3' : 'mp4'}`;
            if (contentDisp && contentDisp.includes('filename=')) {
                filename = contentDisp.split('filename=')[1].replace(/["']/g, '');
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            
            // Finish
            updateProgress(3, 100, "🎉 បានទាញយកជោគជ័យ ១០០%! (Download successful!)");
            
            // Add to Local Storage History
            saveToHistory({
                title: currentVideoData.title,
                platform: currentVideoData.platform,
                format: formatLabel,
                url: currentVideoData.originalUrl,
                timestamp: new Date().toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' })
            });

            // Show success alert and return to normal input after a short delay
            setTimeout(() => {
                progressArea.classList.add('hidden');
                urlInput.value = '';
                detectPlatform('');
                currentVideoData = null;
            }, 3000);

        } catch (error) {
            progressArea.classList.add('hidden');
            previewArea.classList.remove('hidden');
            alert(error.message);
        }
    });

    // Helper: Detect URL pattern
    function detectPlatform(url) {
        // Reset badges
        badges.forEach(b => b.classList.remove('active'));

        if (!url) return;

        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            badgeYoutube.classList.add('active');
        } else if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.gg')) {
            badgeFacebook.classList.add('active');
        } else if (url.includes('tiktok.com')) {
            badgeTiktok.classList.add('active');
        }
    }

    // Helper: Update download progress bar and step indicators
    function updateProgress(step, percent, text) {
        progressBarFill.style.width = `${percent}%`;
        progressStatusText.textContent = text;

        // Reset steps active/completed
        stepExtract.className = 'step';
        stepDownload.className = 'step';
        stepStream.className = 'step';

        if (step === 1) {
            stepExtract.classList.add('active');
        } else if (step === 2) {
            stepExtract.classList.add('completed');
            stepDownload.classList.add('active');
        } else if (step === 3) {
            stepExtract.classList.add('completed');
            stepDownload.classList.add('completed');
            stepStream.classList.add('active');
            if (percent === 100) {
                stepStream.className = 'step completed';
            }
        }
    }

    // Helper: Save item to local history
    function saveToHistory(item) {
        let history = JSON.parse(localStorage.getItem('yft_history')) || [];
        // Insert at beginning, limit to 8 items
        history.unshift(item);
        history = history.slice(0, 8);
        localStorage.setItem('yft_history', JSON.stringify(history));
        renderHistory();
    }

    // Helper: Render history items from Local Storage
    function renderHistory() {
        const history = JSON.parse(localStorage.getItem('yft_history')) || [];
        if (history.length === 0) {
            historyList.innerHTML = '<p class="empty-history">មិនទាន់មានប្រវត្តិទាញយកនៅឡើយទេ។</p>';
            return;
        }

        historyList.innerHTML = '';
        history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-item-details">
                    <div class="history-item-title">${item.title}</div>
                    <div class="history-item-meta">
                        <span class="history-platform ${item.platform}">${item.platform}</span>
                        <span>•</span>
                        <span>${item.timestamp}</span>
                    </div>
                </div>
                <button class="btn-re-download" title="ទាញយកឡើងវិញ">
                    <i class="fa-solid fa-redo"></i>
                </button>
            `;
            
            // Re-download button trigger
            div.querySelector('.btn-re-download').addEventListener('click', () => {
                urlInput.value = item.url;
                detectPlatform(item.url);
                analyzeBtn.click();
            });

            historyList.appendChild(div);
        });
    }
});
