let ws = null;
let testStartTime = null;
let warmUpStartTime = null;
let warmUpDuration = 0;
let elapsedTimer = null;
let terminalRainIntervals = {};
let userStats = {};

function initMatrixBackground() {
    const canvas = document.getElementById('matrix-bg');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(1);

    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff41';
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = chars.charAt(Math.floor(Math.random() * chars.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }

    setInterval(draw, 50);

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

function startTerminalRain(terminalId) {
    const canvas = document.querySelector(`#terminal-${terminalId} .terminal-rain-canvas`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const body = canvas.parentElement;
    canvas.width = body.offsetWidth;
    canvas.height = body.offsetHeight;

    const chars = 'ｱｲｳｴｵｶｷｸｹｺ01';
    const fontSize = 10;
    const columns = Math.floor(canvas.width / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * canvas.height / fontSize);

    const intervalId = setInterval(() => {
        ctx.fillStyle = 'rgba(2, 10, 2, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff41';
        ctx.font = `${fontSize}px monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = chars.charAt(Math.floor(Math.random() * chars.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.95) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }, 60);

    terminalRainIntervals[terminalId] = intervalId;
}

function stopTerminalRain(terminalId) {
    if (terminalRainIntervals[terminalId]) {
        clearInterval(terminalRainIntervals[terminalId]);
        delete terminalRainIntervals[terminalId];
    }
}

async function fetchModels() {
    try {
        const resp = await fetch('/api/models');
        const data = await resp.json();

        if (data.error) {
            showError(data.error);
            return;
        }

        const select = document.getElementById('model-select');
        select.innerHTML = '';

        if (data.models.length === 0) {
            select.innerHTML = '<option value="">Model bulunamadi</option>';
            return;
        }

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '— Model Secin —';
        select.appendChild(defaultOpt);

        data.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
            opt.textContent = `${m.name} (${sizeGB} GB)`;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            document.getElementById('btn-start').disabled = !select.value;
        });

    } catch (e) {
        showError('Ollama API\'ye baglanilamiyor. Ollama calistigindan emin olun.');
    }
}

async function fetchRunningModels() {
    try {
        const resp = await fetch('/api/running');
        const data = await resp.json();
        const list = document.getElementById('running-models-list');

        if (data.error) {
            list.innerHTML = `<div class="empty-state">${data.error}</div>`;
            return;
        }

        if (!data.running || data.running.length === 0) {
            list.innerHTML = '<div class="empty-state">Su an calisan model yok</div>';
            return;
        }

        list.innerHTML = '';
        data.running.forEach(m => {
            const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
            const vramGB = (m.size_vram / (1024 * 1024 * 1024)).toFixed(1);
            const card = document.createElement('div');
            card.className = 'running-model-card';
            card.innerHTML = `
                <div class="running-model-info">
                    <span class="running-model-name">${m.name}</span>
                    <span class="running-model-meta">RAM: ${sizeGB} GB | VRAM: ${vramGB} GB</span>
                </div>
                <div class="running-model-status">
                    <div class="status-dot"></div>
                    <button class="btn-stop-model" data-model="${m.name}" title="Modeli durdur">DURDUR</button>
                </div>
            `;
            list.appendChild(card);
        });

        list.querySelectorAll('.btn-stop-model').forEach(btn => {
            btn.addEventListener('click', () => stopModel(btn.dataset.model));
        });

    } catch (e) {
        document.getElementById('running-models-list').innerHTML =
            '<div class="empty-state">Baglanti hatasi</div>';
    }
}

async function stopModel(modelName) {
    try {
        const resp = await fetch('/api/stop-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName }),
        });
        const data = await resp.json();

        if (data.error) {
            showError(data.error);
        } else {
            setTimeout(fetchRunningModels, 500);
        }
    } catch (e) {
        showError('Model durdurulurken hata olustu.');
    }
}

function showError(msg) {
    const banner = document.getElementById('error-banner');
    banner.textContent = msg;
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 5000);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function formatTime(seconds) {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(0);
    return `${m}m ${s}s`;
}

function startTest() {
    const model = document.getElementById('model-select').value;
    const numParallel = parseInt(document.getElementById('num-parallel').value) || 1;
    const numUsers = parseInt(document.getElementById('num-users').value) || 1;
    const maxWords = parseInt(document.getElementById('max-words').value) || 50;

    if (!model) return;

    userStats = {};
    Object.keys(terminalRainIntervals).forEach(id => stopTerminalRain(id));
    terminalRainIntervals = {};

    document.getElementById('test-model-name').textContent = `Model: ${model}`;
    document.getElementById('test-parallel-info').textContent = `Paralel: ${numParallel}`;
    document.getElementById('test-user-count').textContent = `Kullanici: ${numUsers}`;
    document.getElementById('test-elapsed').textContent = `Max: ${maxWords} kel | Warm-up...`;

    document.getElementById('btn-cancel').classList.remove('hidden');
    document.getElementById('btn-back').classList.add('hidden');
    document.getElementById('summary-bar').classList.add('hidden');

    createTerminals(numUsers);
    showScreen('test-screen');

    warmUpStartTime = Date.now();
    warmUpDuration = 0;
    testStartTime = null;

    connectWebSocket(model, numParallel, numUsers, maxWords);
}

function createTerminals(count) {
    const grid = document.getElementById('terminals-grid');
    grid.innerHTML = '';
    grid.setAttribute('data-count', Math.min(count, 12));

    for (let i = 0; i < count; i++) {
        const box = document.createElement('div');
        box.className = 'terminal-box';
        box.id = `terminal-${i}`;
        box.innerHTML = `
            <div class="terminal-header">
                <div class="terminal-title">
                    <span class="terminal-status-icon" id="status-icon-${i}">⏳</span>
                    <span>USER-${String(i + 1).padStart(2, '0')}</span>
                </div>
                <div class="terminal-stats" id="stats-${i}">Bekliyor</div>
            </div>
            <div class="terminal-body" id="body-${i}">
                <canvas class="terminal-rain-canvas"></canvas>
                <div class="terminal-prompt" id="prompt-${i}"></div>
                <div class="terminal-output" id="output-${i}"></div>
                <div class="terminal-waiting" id="waiting-${i}">Sirada bekliyor...</div>
            </div>
        `;
        grid.appendChild(box);
    }
}

function connectWebSocket(model, numParallel, numUsers, maxWords) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/test`);

    ws.onopen = () => {
        ws.send(JSON.stringify({
            model: model,
            num_users: numUsers,
            num_parallel: numParallel,
            max_words: maxWords,
        }));
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        clearInterval(elapsedTimer);
    };
}

function handleWSMessage(msg) {
    const { type, user_id, data } = msg;

    switch (type) {
        case 'system':
            showSystemMessage(data, msg.phase, msg);
            break;
        case 'init':
            hideSystemMessage();
            initTerminal(user_id, msg.prompt);
            break;
        case 'status':
            updateTerminalStatus(user_id, data);
            break;
        case 'token':
            appendToken(user_id, data);
            break;
        case 'done':
            completeTerminal(user_id, msg.stats);
            break;
        case 'error':
            if (user_id === -1) showError(data);
            else errorTerminal(user_id, data);
            break;
        case 'all_done':
            allTestsDone();
            break;
    }
}

function showSystemMessage(message, phase, msg) {
    let overlay = document.getElementById('system-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'system-overlay';
        overlay.innerHTML = `
            <div class="system-overlay-content">
                <div class="system-spinner"></div>
                <div class="system-message" id="system-message-text"></div>
                <div class="system-phase" id="system-phase-text"></div>
            </div>
        `;
        document.getElementById('test-screen').appendChild(overlay);
    }

    overlay.classList.remove('hidden');
    document.getElementById('system-message-text').textContent = message;

    const phaseEl = document.getElementById('system-phase-text');
    const phaseMap = {
        'unloading': 'Model bellekten kaldiriliyor...',
        'reloading': 'Model yeniden yukleniyor...',
        'ready': 'Model hazir!',
        'warning': 'Uyari',
    };
    phaseEl.textContent = phaseMap[phase] || '';

    if (msg && msg.warm_up_time !== undefined) {
        warmUpDuration = msg.warm_up_time;
    }

    if (phase === 'ready' || phase === 'warning') {
        testStartTime = Date.now();
        if (elapsedTimer) clearInterval(elapsedTimer);
        elapsedTimer = setInterval(() => {
            const elapsed = (Date.now() - testStartTime) / 1000;
            document.getElementById('test-elapsed').textContent =
                `Cold: ${warmUpDuration}s | Benchmark: ${formatTime(elapsed)}`;
        }, 100);

        setTimeout(hideSystemMessage, 1000);
    }
}

function hideSystemMessage() {
    const overlay = document.getElementById('system-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function initTerminal(userId, prompt) {
    const promptEl = document.getElementById(`prompt-${userId}`);
    if (promptEl) promptEl.textContent = prompt;
}

function updateTerminalStatus(userId, status) {
    const box = document.getElementById(`terminal-${userId}`);
    const icon = document.getElementById(`status-icon-${userId}`);
    const stats = document.getElementById(`stats-${userId}`);
    const waiting = document.getElementById(`waiting-${userId}`);
    const output = document.getElementById(`output-${userId}`);

    if (!box) return;

    switch (status) {
        case 'waiting':
            icon.textContent = '⏳';
            stats.textContent = 'Sirada';
            break;
        case 'active':
            box.classList.add('active');
            icon.textContent = '🟢';
            stats.textContent = 'Calisiyor...';
            if (waiting) waiting.classList.add('hidden');

            const cursor = document.createElement('span');
            cursor.className = 'cursor-blink';
            cursor.id = `cursor-${userId}`;
            output.appendChild(cursor);

            startTerminalRain(userId);
            userStats[userId] = { startTime: Date.now(), tokens: 0 };
            break;
        case 'cancelled':
            box.classList.remove('active');
            box.classList.add('error');
            icon.textContent = '⛔';
            stats.textContent = 'Iptal edildi';
            stopTerminalRain(userId);
            removeCursor(userId);
            break;
    }
}

function appendToken(userId, token) {
    const output = document.getElementById(`output-${userId}`);
    if (!output) return;

    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) cursor.remove();

    output.appendChild(document.createTextNode(token));

    const newCursor = document.createElement('span');
    newCursor.className = 'cursor-blink';
    newCursor.id = `cursor-${userId}`;
    output.appendChild(newCursor);

    const body = document.getElementById(`body-${userId}`);
    body.scrollTop = body.scrollHeight;

    if (userStats[userId]) {
        userStats[userId].tokens++;
    }
}

function completeTerminal(userId, stats) {
    const box = document.getElementById(`terminal-${userId}`);
    const icon = document.getElementById(`status-icon-${userId}`);
    const statsEl = document.getElementById(`stats-${userId}`);

    if (!box) return;

    box.classList.remove('active');
    box.classList.add('completed');
    icon.textContent = '✅';

    stopTerminalRain(userId);
    removeCursor(userId);

    if (stats) {
        statsEl.textContent = `${stats.tokens} tok | ${stats.tokens_per_sec} t/s | ${formatTime(stats.total_time)}`;
        userStats[userId] = { ...userStats[userId], ...stats };
    }
}

function errorTerminal(userId, errorMsg) {
    const box = document.getElementById(`terminal-${userId}`);
    const icon = document.getElementById(`status-icon-${userId}`);
    const stats = document.getElementById(`stats-${userId}`);
    const output = document.getElementById(`output-${userId}`);
    const waiting = document.getElementById(`waiting-${userId}`);

    if (!box) return;

    box.classList.remove('active');
    box.classList.add('error');
    icon.textContent = '❌';
    stats.textContent = 'Hata';
    if (waiting) waiting.classList.add('hidden');

    stopTerminalRain(userId);
    removeCursor(userId);

    const errorEl = document.createElement('div');
    errorEl.style.color = 'var(--red)';
    errorEl.textContent = `\n[HATA] ${errorMsg}`;
    output.appendChild(errorEl);
}

function removeCursor(userId) {
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) cursor.remove();
}

function allTestsDone() {
    clearInterval(elapsedTimer);
    const benchmarkTime = testStartTime ? ((Date.now() - testStartTime) / 1000).toFixed(1) : '0';

    let totalTokens = 0;
    let totalTps = 0;
    let completedCount = 0;

    Object.values(userStats).forEach(s => {
        if (s.tokens_per_sec) {
            totalTokens += (s.tokens || 0);
            totalTps += s.tokens_per_sec;
            completedCount++;
        }
    });

    const avgTps = completedCount > 0 ? (totalTps / completedCount).toFixed(1) : '—';

    document.getElementById('summary-cold-start').textContent = `${warmUpDuration}s`;
    document.getElementById('summary-total-time').textContent = formatTime(parseFloat(benchmarkTime));
    document.getElementById('summary-avg-tps').textContent = avgTps;
    document.getElementById('summary-total-tokens').textContent = totalTokens;
    document.getElementById('summary-status').textContent = `${completedCount}/${Object.keys(userStats).length} tamamlandi`;

    document.getElementById('test-elapsed').textContent =
        `Cold: ${warmUpDuration}s | Benchmark: ${formatTime(parseFloat(benchmarkTime))}`;

    document.getElementById('summary-bar').classList.remove('hidden');
    document.getElementById('btn-cancel').classList.add('hidden');
    document.getElementById('btn-back').classList.remove('hidden');
}

function cancelTest() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cancel' }));
        ws.close();
    }
    clearInterval(elapsedTimer);

    document.querySelectorAll('.terminal-box.active').forEach(box => {
        const id = box.id.replace('terminal-', '');
        box.classList.remove('active');
        box.classList.add('error');
        const icon = document.getElementById(`status-icon-${id}`);
        if (icon) icon.textContent = '⛔';
        stopTerminalRain(id);
        removeCursor(id);
    });

    document.getElementById('btn-cancel').classList.add('hidden');
    document.getElementById('btn-back').classList.remove('hidden');
}

function goBack() {
    showScreen('selection-screen');
    fetchRunningModels();
    Object.keys(terminalRainIntervals).forEach(id => stopTerminalRain(id));
}

document.addEventListener('DOMContentLoaded', () => {
    initMatrixBackground();
    fetchModels();
    fetchRunningModels();

    setInterval(() => {
        if (document.getElementById('selection-screen').classList.contains('active')) {
            fetchRunningModels();
        }
    }, 5000);

    document.getElementById('btn-start').addEventListener('click', startTest);
    document.getElementById('btn-cancel').addEventListener('click', cancelTest);
    document.getElementById('btn-back').addEventListener('click', goBack);
    document.getElementById('btn-refresh-running').addEventListener('click', fetchRunningModels);
});
