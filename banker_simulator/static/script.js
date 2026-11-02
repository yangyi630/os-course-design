let currentState = null;
let historyOperations = [];
let deadlockedProcesses = [];
let historyMode = false;
let maxResourceCount = 0;
let historyChart = null;
let chartMode = 'safety';
let previousChartMode = 'safety';
let previousHistoryCount = 0;
let previousLatestId = 0;

const elements = {
    messageArea: document.getElementById('message-area'),
    tableMax: document.getElementById('table-max'),
    tableAllocation: document.getElementById('table-allocation'),
    tableNeed: document.getElementById('table-need'),
    tableAvailable: document.getElementById('table-available'),
    safeSequence: document.getElementById('safe-sequence'),
    deadlockProcesses: document.getElementById('deadlock-processes'),
    selectProcess: document.getElementById('select-process'),
    requestInputs: document.getElementById('request-inputs'),
    btnRequest: document.getElementById('btn-request'),
    btnRelease: document.getElementById('btn-release'),
    btnDetect: document.getElementById('btn-detect'),
    btnReset: document.getElementById('btn-reset'),
    btnSettings: document.getElementById('btn-settings'),
    btnRandomRun: document.getElementById('btn-random-run'),
    btnBackLatest: document.getElementById('btn-back-latest'),
    cbBanker: document.getElementById('cb-banker'),
    timelineSlider: document.getElementById('timeline-slider'),
    timelineCurrent: document.getElementById('timeline-current'),
    timelineDescription: document.getElementById('timeline-description'),
    timelineStatus: document.getElementById('timeline-status'),
    historyModeIndicator: document.getElementById('history-mode-indicator'),
    logArea: document.getElementById('log-area'),
    logStream: document.getElementById('log-stream'),
    historyChart: document.getElementById('history-chart'),
    btnClearLogs: document.getElementById('btn-clear-logs'),
    btnExportLogs: document.getElementById('btn-export-logs'),
    settingsModal: document.getElementById('settings-modal'),
    closeModal: document.getElementById('close-modal'),
    inputResourceCount: document.getElementById('input-resource-count'),
    inputTotalResources: document.getElementById('input-total-resources'),
    inputProcessCount: document.getElementById('input-process-count'),
    inputMaxMatrix: document.getElementById('input-max-matrix'),
    btnApplySettings: document.getElementById('btn-apply-settings'),
    dashboardProgress: document.getElementById('dashboard-progress'),
    dashboardStep: document.getElementById('dashboard-step'),
    dashboardMeaning: document.getElementById('dashboard-meaning'),
    dashboardDetails: document.getElementById('dashboard-details'),
    systemStatusIndicator: document.getElementById('system-status-indicator'),
    statusLight: document.getElementById('status-light'),
    statusText: document.getElementById('status-text'),
    metricStatusValue: document.getElementById('metric-status-value'),
    metricStatusSub: document.getElementById('metric-status-sub'),
    metricAllocatedValue: document.getElementById('metric-allocated-value'),
    metricAllocatedFill: document.getElementById('metric-allocated-fill'),
    metricAvailableValue: document.getElementById('metric-available-value'),
    metricAvailableSub: document.getElementById('metric-available-sub'),
    metricCompletionValue: document.getElementById('metric-completion-value'),
    completionRing: document.getElementById('completion-ring'),
    metricLastOpValue: document.getElementById('metric-last-op-value'),
    metricLastOpSub: document.getElementById('metric-last-op-sub'),
    availableBars: document.getElementById('available-bars'),
    tagProcessCount: document.getElementById('tag-process-count'),
    tagResourceCount: document.getElementById('tag-resource-count'),
    funSection: document.getElementById('fun-section'),
    funToggle: document.getElementById('fun-toggle')
};

function showMessage(message, type = 'info', duration = 5000) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.textContent = message;
    elements.messageArea.appendChild(msgDiv);
    
    setTimeout(() => {
        msgDiv.style.opacity = '0';
        msgDiv.style.transform = 'translateY(-10px)';
        setTimeout(() => msgDiv.remove(), 300);
    }, duration);
}

function clearMessages() {
    elements.messageArea.innerHTML = '';
}

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    elements.logArea.value += `[${timestamp}] ${message}\n`;
    elements.logArea.scrollTop = elements.logArea.scrollHeight;
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type} new`;
    entry.innerHTML = `
        <span class="log-time">${timestamp}</span>
        <span class="log-type">${type}</span>
        <span class="log-message">${message}</span>
    `;
    elements.logStream.appendChild(entry);
    elements.logStream.scrollTop = elements.logStream.scrollHeight;
    
    setTimeout(() => entry.classList.remove('new'), 1000);
}

function clearLogs() {
    elements.logArea.value = '';
    elements.logStream.innerHTML = '';
}

function exportLogs() {
    const blob = new Blob([elements.logArea.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `banker-simulator-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

function updateDashboard(step, meaning, progress, details = '', type = 'normal') {
    elements.dashboardStep.textContent = step;
    elements.dashboardMeaning.textContent = meaning;
    elements.dashboardProgress.style.width = progress + '%';
    elements.dashboardProgress.className = 'progress-fill' + (type === 'danger' ? ' danger' : type === 'warning' ? ' warning' : '');
    if (details) {
        elements.dashboardDetails.innerHTML = details;
        elements.dashboardDetails.classList.remove('hidden');
    } else {
        elements.dashboardDetails.classList.add('hidden');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDashboardSequence(steps) {
    for (const step of steps) {
        updateDashboard(step.title, step.meaning, step.progress, step.details || '', step.type || 'normal');
        await sleep(step.delay || 800);
    }
}

function resetDashboard() {
    updateDashboard('等待操作...', '点击上方按钮开始一次资源分配或死锁检测', 0, '', 'normal');
}

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json'
            },
            ...options
        });
        return await response.json();
    } catch (error) {
        console.error('API调用失败:', error);
        showMessage('网络请求失败: ' + error.message, 'error');
        return null;
    }
}

function parseMatrix(text) {
    if (!text.trim()) return null;
    return text.trim().split('\n').map(line => 
        line.trim().split(/\s+/).map(Number)
    );
}

async function initSystem(options = {}) {
    const payload = {
        resource_count: 3,
        total_resources: [10, 5, 7],
        process_count: 5,
        max_matrix: []
    };
    
    if (options.resource_count !== undefined) {
        payload.resource_count = options.resource_count;
        payload.total_resources = options.total_resources;
        payload.process_count = options.process_count;
        payload.max_matrix = options.max_matrix || [];
    }
    
    await runDashboardSequence([
        { title: '步骤 1/4：准备系统参数', meaning: '就像银行开业前清点资金和客户名单', progress: 20, details: `资源种类：${payload.resource_count}，进程数：${payload.process_count}，资源总量：[${payload.total_resources.join(', ')}]` },
        { title: '步骤 2/4：生成最大需求矩阵', meaning: '记录每个进程（客户）最多可能申请多少资源', progress: 45, details: '如果未提供 Max 矩阵，系统会随机生成一个至少存在安全序列的矩阵。' },
        { title: '步骤 3/4：初始化分配状态', meaning: '所有进程初始未分配资源，Need 等于 Max', progress: 70, details: 'Allocation 全为 0，Available 等于资源总量。' }
    ]);
    
    const result = await apiCall('/api/init', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    
    if (result && result.success) {
        currentState = result.state;
        deadlockedProcesses = [];
        historyMode = false;
        elements.historyModeIndicator.classList.add('hidden');
        if (result.banker_enabled !== undefined) {
            elements.cbBanker.checked = result.banker_enabled;
        }
        updateInterface();
        await loadHistory();
        updateDashboard(
            '步骤 4/4：初始化完成',
            '系统已找到一个安全起点，可以开始资源分配实验',
            100,
            `安全序列：${result.state.safe_seq ? result.state.safe_seq.map(i => `P${i}`).join(' → ') : '无'}`,
            'normal'
        );
        addLog('系统初始化完成');
        showMessage('系统初始化完成', 'success');
    } else {
        updateDashboard('初始化失败', result ? result.message : '初始化失败', 0, '', 'danger');
        showMessage(result ? result.message : '初始化失败', 'error');
    }
}

async function loadState() {
    const result = await apiCall('/api/state');
    if (result) {
        currentState = result;
        deadlockedProcesses = result.deadlocked_processes || [];
        updateInterface();
    }
}

async function loadHistory() {
    const result = await apiCall('/api/history');
    if (result && result.operations) {
        const newOperations = result.operations;
        const newLatestId = newOperations.length > 0 ? newOperations[newOperations.length - 1].id : 0;
        const isReset = newLatestId < previousLatestId;
        const shouldAnimate = previousHistoryCount > 0 && (newOperations.length > previousHistoryCount + 1 || isReset);
        historyOperations = newOperations;
        updateTimeline();
        updateLog();
        updateLogStream();

        if (shouldAnimate) {
            await animateHistoryChart(isReset ? 1 : previousHistoryCount);
        } else {
            renderHistoryChart();
        }

        previousHistoryCount = newOperations.length;
        previousLatestId = newLatestId;
    }
}

function updateTimeline() {
    if (historyOperations.length === 0) return;
    
    const maxId = historyOperations[historyOperations.length - 1].id;
    elements.timelineSlider.max = maxId;
    
    if (!historyMode) {
        elements.timelineSlider.value = maxId;
    }
    
    updateTimelineInfo();
}

function updateTimelineInfo() {
    const opId = parseInt(elements.timelineSlider.value);
    const operation = historyOperations.find(op => op.id === opId);
    if (operation) {
        elements.timelineCurrent.textContent = `操作 #${opId}`;
        elements.timelineDescription.textContent = operation.description;
        elements.timelineStatus.textContent = operation.is_deadlock ? '死锁状态' : 
            (operation.safe_seq ? '安全' : '不安全');
        elements.timelineStatus.className = operation.is_deadlock ? 'deadlock' : 
            (operation.safe_seq ? 'safe' : 'unsafe');
    }
}

function updateLog() {
    elements.logArea.value = historyOperations.map(op =>
        `[${op.timestamp}] ${op.op_type}: ${op.description}`
    ).join('\n') + '\n';
    elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

function getLogEntryType(op) {
    if (op.is_deadlock) return 'error';
    if (op.op_type === 'request_denied') return 'error';
    if (op.op_type === 'request_success') return 'success';
    if (op.op_type === 'init') return 'info';
    if (op.op_type === 'release') return 'success';
    if (op.op_type === 'deadlock_detect') return op.is_deadlock ? 'error' : 'success';
    return 'info';
}

function updateLogStream() {
    elements.logStream.innerHTML = '';
    historyOperations.forEach(op => {
        const type = getLogEntryType(op);
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `
            <span class="log-time">${op.timestamp}</span>
            <span class="log-type">${op.op_type}</span>
            <span class="log-message">${op.description}</span>
        `;
        elements.logStream.appendChild(entry);
    });
    elements.logStream.scrollTop = elements.logStream.scrollHeight;
}

function initHistoryChart() {
    if (!elements.historyChart || typeof echarts === 'undefined') return;
    historyChart = echarts.init(elements.historyChart);
    window.addEventListener('resize', () => historyChart && historyChart.resize());
}

function renderHistoryChart(forceReset = false) {
    if (!historyChart || historyOperations.length === 0) return;

    const xData = historyOperations.map(op => `#${op.id}`);
    const resourceCount = historyOperations[0].available.length;
    const colors = ['#4A90D9', '#34C759', '#FF9F0A', '#FF3B30', '#9b59b6', '#f1c40f', '#1abc9c', '#e74c3c', '#3498db', '#2ecc71'];
    const latestIndex = xData.length - 1;

    let series = [];
    let yAxisName = '';

    if (chartMode === 'safety') {
        yAxisName = '状态编码';
        const safetyData = historyOperations.map(op => {
            if (op.is_deadlock) return -1;
            return op.safe_seq ? 1 : 0;
        });
        series = [{
            name: '安全状态',
            type: 'line',
            data: safetyData,
            smooth: true,
            symbol: 'circle',
            symbolSize: 8,
            lineStyle: { width: 3, color: '#4A90D9' },
            itemStyle: { color: '#4A90D9' },
            animationDuration: 600,
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(74, 144, 217, 0.3)' },
                    { offset: 1, color: 'rgba(74, 144, 217, 0.02)' }
                ])
            },
            markLine: {
                silent: true,
                symbol: 'none',
                label: { position: 'insideStartLeft', color: '#1A1A2E', fontSize: 11 },
                data: [
                    { yAxis: 1, lineStyle: { color: '#34C759', type: 'dashed' }, label: { formatter: '安全' } },
                    { yAxis: 0, lineStyle: { color: '#FF9F0A', type: 'dashed' }, label: { formatter: '不安全' } },
                    { yAxis: -1, lineStyle: { color: '#FF3B30', type: 'dashed' }, label: { formatter: '死锁' } }
                ]
            },
            markPoint: {
                data: [
                    {
                        coord: [latestIndex, safetyData[latestIndex]],
                        value: safetyData[latestIndex] === 1 ? '安全' : safetyData[latestIndex] === 0 ? '不安全' : '死锁',
                        itemStyle: { color: safetyData[latestIndex] === 1 ? '#34C759' : safetyData[latestIndex] === 0 ? '#FF9F0A' : '#FF3B30' }
                    }
                ],
                symbolSize: 40,
                label: { color: '#fff', fontSize: 10 }
            }
        }];
    } else if (chartMode === 'allocation') {
        yAxisName = '资源数量';
        for (let r = 0; r < resourceCount; r++) {
            const data = historyOperations.map(op => op.allocation.reduce((sum, row) => sum + row[r], 0));
            series.push({
                name: `R${r} 已分配`,
                type: 'line',
                data: data,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2, color: colors[r % colors.length] },
                itemStyle: { color: colors[r % colors.length] },
                animationDuration: 600,
                markPoint: {
                    data: [{ coord: [latestIndex, data[latestIndex]], name: '最新' }],
                    symbolSize: 28,
                    itemStyle: { color: colors[r % colors.length] },
                    label: { show: false }
                }
            });
        }
    } else if (chartMode === 'available') {
        yAxisName = '资源数量';
        for (let r = 0; r < resourceCount; r++) {
            const data = historyOperations.map(op => op.available[r]);
            series.push({
                name: `R${r} 可用`,
                type: 'line',
                data: data,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { width: 2, color: colors[r % colors.length] },
                itemStyle: { color: colors[r % colors.length] },
                animationDuration: 600,
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: colors[r % colors.length] + '30' },
                        { offset: 1, color: colors[r % colors.length] + '05' }
                    ])
                },
                markPoint: {
                    data: [{ coord: [latestIndex, data[latestIndex]], name: '最新' }],
                    symbolSize: 28,
                    itemStyle: { color: colors[r % colors.length] },
                    label: { show: false }
                }
            });
        }
    }

    const totalOps = xData.length;
    const windowSize = Math.min(totalOps, 10);
    const endPercent = 100;
    const startPercent = totalOps > 10 ? ((totalOps - windowSize) / totalOps) * 100 : 0;

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#E9ECEF',
            textStyle: { color: '#1A1A2E' },
            axisPointer: { type: 'cross', label: { backgroundColor: '#4A90D9' } },
            extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.1);'
        },
        legend: {
            data: series.map(s => s.name),
            textStyle: { color: '#4A4A6A' },
            bottom: 0
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '15%',
            top: '15%',
            containLabel: true
        },
        dataZoom: [
            { type: 'inside', start: startPercent, end: endPercent },
            { type: 'slider', start: startPercent, end: endPercent, bottom: 35, height: 20, borderColor: '#E9ECEF', fillerColor: 'rgba(74, 144, 217, 0.15)', handleStyle: { color: '#4A90D9' } }
        ],
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: xData,
            axisLine: { lineStyle: { color: '#E9ECEF' } },
            axisLabel: { color: '#4A4A6A' }
        },
        yAxis: {
            type: 'value',
            name: yAxisName,
            nameTextStyle: { color: '#4A4A6A' },
            axisLine: { lineStyle: { color: '#E9ECEF' } },
            axisLabel: { color: '#4A4A6A' },
            splitLine: { lineStyle: { color: '#F1F3F5' } },
            max: chartMode === 'safety' ? 1.2 : null,
            min: chartMode === 'safety' ? -1.2 : null
        },
        series: series
    };

    const needReset = forceReset || chartMode !== previousChartMode;
    historyChart.setOption(option, needReset);
    previousChartMode = chartMode;
}

async function animateHistoryChart(startCount) {
    if (!historyChart || historyOperations.length === 0) return;

    const fullOperations = historyOperations;
    const safeStartCount = Math.max(1, Math.min(startCount, fullOperations.length));
    const stepDelay = Math.min(400, Math.max(120, 2500 / (fullOperations.length - safeStartCount + 1)));

    for (let i = safeStartCount; i <= fullOperations.length; i++) {
        historyOperations = fullOperations.slice(0, i);
        renderHistoryChart(false);
        if (i < fullOperations.length) {
            await sleep(stepDelay);
        }
    }

    historyOperations = fullOperations;
    renderHistoryChart(false);
}

function renderTableHeader(table, resourceCount, label) {
    const thead = table.querySelector('thead tr');
    thead.innerHTML = `<th>${label}</th>`;
    for (let i = 0; i < resourceCount; i++) {
        thead.innerHTML += `<th>R${i}</th>`;
    }
}

function renderMatrixTable(table, matrix, deadlockedProcesses) {
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    matrix.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.className = deadlockedProcesses.includes(index) ? 'deadlock' : '';
        tr.innerHTML = `<td>P${index}</td>`;
        row.forEach(val => {
            tr.innerHTML += `<td>${val}</td>`;
        });
        tbody.appendChild(tr);
    });
}

function renderAvailableTable(table, available) {
    const thead = table.querySelector('thead tr');
    thead.innerHTML = '<th>资源</th>';
    available.forEach((_, index) => {
        thead.innerHTML += `<th>R${index}</th>`;
    });
    
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '<tr><td>Available</td>';
    available.forEach(val => {
        tbody.innerHTML += `<td>${val}</td>`;
    });
    tbody.innerHTML += '</tr>';
}

function updateProcessSelect(processCount) {
    elements.selectProcess.innerHTML = '';
    for (let i = 0; i < processCount; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `P${i}`;
        elements.selectProcess.appendChild(option);
    }
}

function updateRequestInputs(resourceCount) {
    maxResourceCount = resourceCount;
    elements.requestInputs.innerHTML = '<label>请求资源：</label><div class="request-inputs-grid"></div>';
    const container = elements.requestInputs.querySelector('.request-inputs-grid');
    
    for (let i = 0; i < resourceCount; i++) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.value = '0';
        input.dataset.resource = i;
        input.placeholder = `R${i}`;
        container.appendChild(input);
    }
}

function getRequestVector() {
    const inputs = elements.requestInputs.querySelectorAll('input');
    return Array.from(inputs).map(input => parseInt(input.value) || 0);
}

function updateInterface() {
    if (!currentState) return;
    
    const processCount = currentState.allocation.length;
    const resourceCount = currentState.available.length;
    
    renderTableHeader(elements.tableMax, resourceCount, '进程');
    renderTableHeader(elements.tableAllocation, resourceCount, '进程');
    renderTableHeader(elements.tableNeed, resourceCount, '进程');
    
    renderMatrixTable(elements.tableMax, currentState.max, deadlockedProcesses);
    renderMatrixTable(elements.tableAllocation, currentState.allocation, deadlockedProcesses);
    renderMatrixTable(elements.tableNeed, currentState.need, deadlockedProcesses);
    
    updateProcessSelect(processCount);
    updateRequestInputs(resourceCount);
    
    elements.tagProcessCount.textContent = `进程 ${processCount}`;
    elements.tagResourceCount.textContent = `资源 ${resourceCount}`;
    
    renderAvailableBars();
    renderMetrics();
    updateSystemStatus();
    updateLastOperationMetric();
    updateSafeSequence();
    updateDeadlockProcesses();
    
    elements.btnRequest.disabled = historyMode;
    elements.btnRelease.disabled = historyMode;
    elements.btnDetect.disabled = historyMode;
}

function renderMetrics() {
    if (!currentState) return;
    
    const allocated = currentState.allocation.flat().reduce((a, b) => a + b, 0);
    const available = currentState.available.reduce((a, b) => a + b, 0);
    const total = allocated + available;
    const allocatedPercent = total > 0 ? Math.round((allocated / total) * 100) : 0;
    
    const completedProcesses = currentState.need.filter(row => row.every(v => v === 0)).length;
    const processCount = currentState.allocation.length;
    const completionPercent = processCount > 0 ? Math.round((completedProcesses / processCount) * 100) : 0;
    
    elements.metricAllocatedValue.textContent = allocated;
    elements.metricAllocatedFill.style.width = allocatedPercent + '%';
    elements.metricAvailableValue.textContent = available;
    elements.metricAvailableSub.textContent = `总量 ${total}`;
    elements.metricCompletionValue.textContent = completionPercent + '%';
    elements.completionRing.setAttribute('stroke-dasharray', `${completionPercent}, 100`);
}

function updateSafeSequence() {
    if (!currentState) return;
    
    if (currentState.safe_seq && currentState.safe_seq.length > 0) {
        elements.safeSequence.textContent = currentState.safe_seq.map(i => `P${i}`).join(' → ');
    } else {
        elements.safeSequence.textContent = '-';
    }
}

function updateDeadlockProcesses() {
    if (!currentState) return;
    
    if (deadlockedProcesses && deadlockedProcesses.length > 0) {
        elements.deadlockProcesses.textContent = deadlockedProcesses.map(i => `P${i}`).join(', ');
        elements.deadlockProcesses.classList.add('has-deadlock');
    } else {
        elements.deadlockProcesses.textContent = '无';
        elements.deadlockProcesses.classList.remove('has-deadlock');
    }
}

function updateSystemStatus() {
    const indicator = elements.systemStatusIndicator;
    const metricCard = document.getElementById('metric-status');
    
    indicator.classList.remove('unsafe', 'deadlock');
    metricCard.classList.remove('unsafe', 'deadlock');
    
    if (currentState.is_deadlock || deadlockedProcesses.length > 0) {
        elements.statusText.textContent = '死锁';
        elements.metricStatusValue.textContent = '死锁';
        elements.metricStatusSub.textContent = '检测到死锁进程';
        indicator.classList.add('deadlock');
        metricCard.classList.add('deadlock');
    } else if (currentState.safe_seq) {
        elements.statusText.textContent = '安全';
        elements.metricStatusValue.textContent = '安全';
        elements.metricStatusSub.textContent = '存在安全序列';
    } else {
        elements.statusText.textContent = '不安全';
        elements.metricStatusValue.textContent = '不安全';
        elements.metricStatusSub.textContent = '死锁风险';
        indicator.classList.add('unsafe');
        metricCard.classList.add('unsafe');
    }
}

function updateLastOperationMetric() {
    if (historyOperations.length === 0) {
        elements.metricLastOpValue.textContent = '-';
        elements.metricLastOpSub.textContent = '等待操作';
        return;
    }
    const lastOp = historyOperations[historyOperations.length - 1];
    let typeLabel = '操作';
    let typeClass = 'info';
    
    if (lastOp.op_type.includes('success')) {
        typeLabel = '成功';
        typeClass = 'success';
    } else if (lastOp.op_type.includes('denied')) {
        typeLabel = '拒绝';
        typeClass = 'error';
    } else if (lastOp.op_type === 'deadlock_detect') {
        typeLabel = '检测';
        typeClass = lastOp.is_deadlock ? 'error' : 'success';
    }
    
    elements.metricLastOpValue.textContent = typeLabel;
    elements.metricLastOpSub.textContent = lastOp.description;
    elements.metricLastOpValue.className = 'metric-value ' + typeClass;
}

function renderAvailableBars() {
    if (!currentState) return;
    const available = currentState.available;
    const max = currentState.max;
    const resourceCount = available.length;
    
    const totalResources = [];
    for (let r = 0; r < resourceCount; r++) {
        const allocated = currentState.allocation.reduce((sum, row) => sum + row[r], 0);
        totalResources.push(allocated + available[r]);
    }
    
    elements.availableBars.innerHTML = '';
    available.forEach((val, index) => {
        const total = totalResources[index];
        const percent = total > 0 ? Math.round((val / total) * 100) : 0;
        let color = 'var(--accent-green)';
        if (percent < 30) color = 'var(--accent-red)';
        else if (percent < 60) color = 'var(--accent-orange)';
        
        const item = document.createElement('div');
        item.className = 'available-bar-item';
        item.innerHTML = `
            <div class="available-bar-header">
                <span class="available-bar-label">R${index}</span>
                <span class="available-bar-value">${val} / ${total}</span>
            </div>
            <div class="available-bar-track">
                <div class="available-bar-fill" style="width: ${percent}%; background: ${color};"></div>
            </div>
            <div class="available-bar-percent">${percent}% 可用</div>
        `;
        elements.availableBars.appendChild(item);
    });
}

async function handleRequest() {
    if (historyMode) {
        showMessage('请先回到最新状态再进行操作', 'error');
        return;
    }
    
    const process = parseInt(elements.selectProcess.value);
    const request = getRequestVector();
    const bankerEnabled = elements.cbBanker.checked;
    
    await runDashboardSequence([
        { title: '步骤 1/5：接收资源请求', meaning: '进程像客户一样提出借款申请', progress: 15, details: `进程 P${process} 请求资源 [${request.join(', ')}]` },
        { title: '步骤 2/5：合法性检查', meaning: '确认请求没有超过进程自身需求和当前可用资源', progress: 35, details: '检查 request ≤ Need[process] 且 request ≤ Available。' },
        { title: bankerEnabled ? '步骤 3/5：试探性分配' : '步骤 3/5：直接分配（银行家算法已关闭）', meaning: bankerEnabled ? '先假装把钱借出去，看看后续会不会出事' : '跳过安全性检查，直接满足请求，可能引发死锁', progress: 55, details: bankerEnabled ? '更新临时 Available、Allocation、Need 矩阵。' : 'Available、Allocation、Need 直接更新。' }
    ]);
    
    const result = await apiCall('/api/request', {
        method: 'POST',
        body: JSON.stringify({ process, request })
    });
    
    if (result) {
        if (result.success) {
            currentState = result.state;
            deadlockedProcesses = result.state.deadlocked_processes || [];
            if (bankerEnabled) {
                await runDashboardSequence([
                    { title: '步骤 4/5：运行安全性算法', meaning: '寻找一个能让所有进程都顺利完成的执行顺序', progress: 80, details: '模拟每个进程在获得所需资源后释放其全部资源，检查是否所有进程都能完成。' },
                    { title: '步骤 5/5：确认分配', meaning: '系统仍处于安全状态，正式批准请求', progress: 100, details: `安全序列：${result.state.safe_seq ? result.state.safe_seq.map(i => `P${i}`).join(' → ') : '无'}` }
                ]);
            } else {
                await runDashboardSequence([
                    { title: '步骤 4/5：跳过安全检查', meaning: '未验证系统是否安全', progress: 80, details: '已直接分配资源。' },
                    { title: '步骤 5/5：分配完成', meaning: result.state.is_deadlock ? '系统可能已进入死锁状态' : '分配成功', progress: 100, details: result.state.is_deadlock ? '检测到死锁风险，建议进行死锁检测。' : '当前状态可能不安全。', type: result.state.is_deadlock ? 'danger' : 'warning' }
                ]);
            }
            showMessage(result.message, 'success');
            addLog(`P${process} 申请 ${request} - 成功`);
        } else {
            await runDashboardSequence([
                { title: '步骤 4/5：安全性检查失败', meaning: '如果批准这次请求，系统将找不到安全执行顺序', progress: 80, details: '存在某些进程将永远无法获得足够资源完成工作。', type: 'warning' },
                { title: '步骤 5/5：回滚并拒绝', meaning: '为了保护系统，撤销试探分配，拒绝本次请求', progress: 100, details: result.message, type: 'danger' }
            ]);
            showMessage(result.message, 'error');
            addLog(`P${process} 申请 ${request} - 被拒绝`);
        }
        updateInterface();
        await loadHistory();
    }
}

async function handleRelease() {
    if (historyMode) {
        showMessage('请先回到最新状态再进行操作', 'error');
        return;
    }
    
    const process = parseInt(elements.selectProcess.value);
    
    await runDashboardSequence([
        { title: '步骤 1/3：接收释放请求', meaning: '进程完成工作，准备归还全部资源', progress: 25, details: `进程 P${process} 将释放其所有已分配资源。` },
        { title: '步骤 2/3：回收资源', meaning: '把进程占用的资源加回可用资源池', progress: 60, details: 'Allocation[process] 清零，Need[process] 恢复为 Max[process]。' }
    ]);
    
    const result = await apiCall('/api/release', {
        method: 'POST',
        body: JSON.stringify({ process })
    });
    
    if (result && result.success) {
        currentState = result.state;
        deadlockedProcesses = [];
        await runDashboardSequence([
            { title: '步骤 3/3：释放完成', meaning: '资源已归还，系统重新计算安全序列', progress: 100, details: `安全序列：${result.state.safe_seq ? result.state.safe_seq.map(i => `P${i}`).join(' → ') : '无'}` }
        ]);
        showMessage('资源释放成功', 'success');
        addLog(`P${process} 释放所有资源`);
        updateInterface();
        await loadHistory();
    } else {
        updateDashboard('释放失败', result ? result.message : '释放失败', 0, '', 'danger');
        showMessage(result ? result.message : '释放失败', 'error');
    }
}

async function handleDetect() {
    if (historyMode) {
        showMessage('请先回到最新状态再进行操作', 'error');
        return;
    }
    
    await runDashboardSequence([
        { title: '步骤 1/3：触发死锁检测', meaning: '像医生给系统做体检，看看有没有卡住的进程', progress: 25, details: '基于当前 Available、Allocation 和 Need 矩阵进行分析。' },
        { title: '步骤 2/3：模拟进程完成', meaning: '看看哪些进程能在当前资源下跑完并释放资源', progress: 60, details: '重复寻找 Need ≤ Available 的进程，模拟其完成后回收资源。' }
    ]);
    
    const result = await apiCall('/api/detect', {
        method: 'POST',
        body: JSON.stringify({})
    });
    
    if (result && result.success) {
        deadlockedProcesses = result.deadlocked_processes || [];
        currentState = result.state;
        if (deadlockedProcesses.length > 0) {
            await runDashboardSequence([
                { title: '步骤 3/3：发现死锁', meaning: '部分进程永远无法获得足够资源', progress: 100, details: `死锁进程：${deadlockedProcesses.map(i => `P${i}`).join(', ')}。它们互相等待，形成循环依赖。`, type: 'danger' }
            ]);
            showMessage('检测到死锁进程: ' + deadlockedProcesses.map(i => `P${i}`).join(', '), 'error');
            addLog('死锁检测：检测到死锁进程 ' + deadlockedProcesses.map(i => `P${i}`).join(', '));
        } else {
            await runDashboardSequence([
                { title: '步骤 3/3：未检测到死锁', meaning: '至少存在一个安全序列让所有进程完成', progress: 100, details: '系统当前没有循环等待，资源最终可以被回收。' }
            ]);
            showMessage('未检测到死锁', 'success');
            addLog('死锁检测：未检测到死锁');
        }
        updateInterface();
        await loadHistory();
    }
}

async function handleRandomRun() {
    if (historyMode) {
        showMessage('请先回到最新状态再进行操作', 'error');
        return;
    }
    
    await runDashboardSequence([
        { title: '步骤 1/4：准备死锁实验', meaning: '关闭银行家算法，让系统像没有风控的银行一样放贷', progress: 20, details: '系统重置为初始安全状态，银行家算法开关临时关闭。' },
        { title: '步骤 2/4：随机发起请求', meaning: '模拟客户们随机来借钱', progress: 45, details: '循环随机选择进程，随机申请其 Need 与 Available 范围内的资源。' }
    ]);
    
    const result = await apiCall('/api/random_run', {
        method: 'POST',
        body: JSON.stringify({ max_steps: 100 })
    });
    
    if (result && result.success) {
        deadlockedProcesses = result.deadlocked_processes || [];
        if (result.deadlock_achieved) {
            await runDashboardSequence([
                { title: '步骤 3/4：检测到死锁', meaning: '资源被占光，多个进程互相等待', progress: 75, details: `新增 ${result.operations_added} 条操作记录。部分进程再也无法获得所需资源。`, type: 'danger' },
                { title: '步骤 4/4：实验结束', meaning: '没有银行家算法的保护，系统最终陷入死锁', progress: 100, details: `死锁进程：${deadlockedProcesses.map(i => `P${i}`).join(', ')}。这就是死锁避免算法存在的意义。`, type: 'danger' }
            ]);
        } else {
            await runDashboardSequence([
                { title: '步骤 3/4：达到实验上限', meaning: '随机请求次数达到上限，未触发死锁', progress: 75, details: `新增 ${result.operations_added} 条操作记录。`, type: 'warning' },
                { title: '步骤 4/4：实验结束', meaning: '本次随机实验未进入死锁，可再次尝试', progress: 100, details: '由于随机性，多次实验通常会观察到死锁。' }
            ]);
        }
        addLog(`随机实验：${result.message}，新增 ${result.operations_added} 条记录`);
        showMessage(`随机实验完成：${result.message}`, result.deadlock_achieved ? 'error' : 'info');
        await loadState();
        await loadHistory();
    } else {
        updateDashboard('随机实验失败', result ? result.message : '随机实验失败', 0, '', 'danger');
        showMessage(result ? result.message : '随机实验失败', 'error');
    }
}

async function handleToggleAlgorithm() {
    const enable = elements.cbBanker.checked;
    const result = await apiCall('/api/toggle_algorithm', {
        method: 'POST',
        body: JSON.stringify({ enable })
    });
    
    if (result && result.success) {
        showMessage(`银行家算法已${enable ? '启用' : '禁用'}`, 'info');
        addLog(`银行家算法已${enable ? '启用' : '禁用'}`);
    }
}

async function handleTimelineChange() {
    const opId = parseInt(elements.timelineSlider.value);
    const maxId = parseInt(elements.timelineSlider.max);
    
    if (opId < maxId) {
        historyMode = true;
        elements.historyModeIndicator.classList.remove('hidden');
    } else {
        historyMode = false;
        elements.historyModeIndicator.classList.add('hidden');
    }
    
    const result = await apiCall(`/api/snapshot?op_id=${opId}`);
    if (result && result.state) {
        currentState = result.state;
        deadlockedProcesses = result.state.deadlocked_processes || [];
        updateTimelineInfo();
        updateInterface();
    }
}

async function handleBackToLatest() {
    historyMode = false;
    elements.historyModeIndicator.classList.add('hidden');
    await loadState();
    await loadHistory();
}

function openSettings() {
    elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    elements.settingsModal.classList.add('hidden');
}

async function applySettings() {
    const resourceCount = parseInt(elements.inputResourceCount.value) || 3;
    const totalResources = elements.inputTotalResources.value
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter(n => !isNaN(n));
    const processCount = parseInt(elements.inputProcessCount.value) || 5;
    const maxMatrix = parseMatrix(elements.inputMaxMatrix.value);
    
    if (totalResources.length !== resourceCount) {
        showMessage('资源总量数量与资源种类数不匹配', 'error');
        return;
    }
    
    if (maxMatrix && maxMatrix.length !== processCount) {
        showMessage('最大需求矩阵行数与进程数不匹配', 'error');
        return;
    }
    
    if (maxMatrix) {
        for (const row of maxMatrix) {
            if (row.length !== resourceCount) {
                showMessage('最大需求矩阵列数与资源种类数不匹配', 'error');
                return;
            }
        }
    }
    
    await initSystem({
        resource_count: resourceCount,
        total_resources: totalResources,
        process_count: processCount,
        max_matrix: maxMatrix
    });
    
    closeSettings();
}

function bindEvents() {
    elements.btnRequest.addEventListener('click', handleRequest);
    elements.btnRelease.addEventListener('click', handleRelease);
    elements.btnDetect.addEventListener('click', handleDetect);
    elements.btnReset.addEventListener('click', () => initSystem());
    elements.btnRandomRun.addEventListener('click', handleRandomRun);
    elements.cbBanker.addEventListener('change', handleToggleAlgorithm);
    elements.timelineSlider.addEventListener('input', handleTimelineChange);
    elements.btnBackLatest.addEventListener('click', handleBackToLatest);
    elements.btnSettings.addEventListener('click', openSettings);
    elements.closeModal.addEventListener('click', closeSettings);
    elements.btnApplySettings.addEventListener('click', applySettings);

    if (elements.btnClearLogs) {
        elements.btnClearLogs.addEventListener('click', clearLogs);
    }
    if (elements.btnExportLogs) {
        elements.btnExportLogs.addEventListener('click', exportLogs);
    }

    document.querySelectorAll('.chart-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chartMode = btn.dataset.mode;
            renderHistoryChart(true);
        });
    });

    if (elements.funToggle && elements.funSection) {
        elements.funToggle.addEventListener('click', () => {
            elements.funSection.classList.toggle('collapsed');
        });
    }

    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeSettings();
        }
    });
}

function bindFunTabs() {
    const tabs = document.querySelectorAll('.fun-tab');
    const contents = document.querySelectorAll('.fun-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(`fun-${target}`).classList.add('active');
        });
    });
}

let funBankState = {
    cash: 100,
    loans: { A: 0, B: 0, C: 0 },
    max: { A: 70, B: 50, C: 60 }
};

function funBankUpdateUI() {
    document.getElementById('bank-cash').textContent = funBankState.cash;
    document.getElementById('bank-a').textContent = funBankState.loans.A;
    document.getElementById('bank-b').textContent = funBankState.loans.B;
    document.getElementById('bank-c').textContent = funBankState.loans.C;
}

function funBankCheckSafe(tempLoans, tempCash) {
    const names = ['A', 'B', 'C'];
    const need = {};
    names.forEach(name => {
        need[name] = funBankState.max[name] - tempLoans[name];
    });
    
    let work = tempCash;
    let finish = { A: false, B: false, C: false };
    let changed = true;
    
    while (changed) {
        changed = false;
        names.forEach(name => {
            if (!finish[name] && need[name] <= work) {
                work += tempLoans[name];
                finish[name] = true;
                changed = true;
            }
        });
    }
    
    return names.every(name => finish[name]);
}

function funBankLoan(name, amount) {
    const resultDiv = document.getElementById('bank-result');
    
    if (amount > funBankState.cash) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>拒绝：</strong>银行现金不足，无法借给 ${name} ${amount} 万。<br>这相当于请求资源超过 Available。`;
        return;
    }
    
    if (funBankState.loans[name] + amount > funBankState.max[name]) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>拒绝：</strong>${name} 已借 ${funBankState.loans[name]} 万，再借 ${amount} 万会超过最高额度 ${funBankState.max[name]} 万。<br>这相当于请求超过 Need。`;
        return;
    }
    
    const tempLoans = { ...funBankState.loans, [name]: funBankState.loans[name] + amount };
    const tempCash = funBankState.cash - amount;
    
    if (funBankCheckSafe(tempLoans, tempCash)) {
        funBankState.loans[name] += amount;
        funBankState.cash -= amount;
        funBankUpdateUI();
        resultDiv.className = 'fun-demo-result success';
        resultDiv.innerHTML = `<strong>同意放贷：</strong>借给 ${name} ${amount} 万后，仍存在安全顺序让所有客户还清贷款。<br><strong>银行家算法：</strong>这次放贷是安全的。`;
    } else {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>拒绝放贷：</strong>如果借给 ${name} ${amount} 万，银行将找不到一种顺序让 A、B、C 都借到最高额度并还款。<br><strong>银行家算法：</strong>这次放贷会导致“死锁”风险，所以拒绝。`;
    }
}

function funBankReset() {
    funBankState = {
        cash: 100,
        loans: { A: 0, B: 0, C: 0 },
        max: { A: 70, B: 50, C: 60 }
    };
    funBankUpdateUI();
    const resultDiv = document.getElementById('bank-result');
    resultDiv.className = 'fun-demo-result';
    resultDiv.textContent = '点击按钮，体验银行家如何决定是否放贷。';
}

function funGenericCheckSafe(maxMap, allocatedMap, total) {
    const result = funGenericFindSafeSequence(maxMap, allocatedMap, total);
    return result.safe;
}

function funGenericFindSafeSequence(maxMap, allocatedMap, total) {
    const names = Object.keys(maxMap);
    const need = {};
    names.forEach(name => {
        need[name] = maxMap[name] - allocatedMap[name];
    });
    
    let work = total;
    const finish = {};
    names.forEach(name => finish[name] = false);
    const sequence = [];
    let changed = true;
    
    while (changed) {
        changed = false;
        names.forEach(name => {
            if (!finish[name] && need[name] <= work) {
                work += allocatedMap[name];
                finish[name] = true;
                sequence.push(name);
                changed = true;
            }
        });
    }
    
    const safe = names.every(name => finish[name]);
    return { safe, sequence, unfinished: names.filter(name => !finish[name]) };
}

let funRestaurantState = {
    tables: 10,
    seated: { A: 0, B: 0, C: 0, D: 0 },
    max: { A: 5, B: 4, C: 4, D: 3 }
};

function funRestaurantUpdateUI() {
    document.getElementById('restaurant-tables').textContent = funRestaurantState.tables;
    document.getElementById('restaurant-a').textContent = funRestaurantState.seated.A;
    document.getElementById('restaurant-b').textContent = funRestaurantState.seated.B;
    document.getElementById('restaurant-c').textContent = funRestaurantState.seated.C;
    document.getElementById('restaurant-d').textContent = funRestaurantState.seated.D;
}

function funRestaurantSeat(name, tables) {
    const resultDiv = document.getElementById('restaurant-result');
    
    if (tables > funRestaurantState.tables) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>请稍等：</strong>当前只剩 ${funRestaurantState.tables} 张空桌，无法给 ${name} 组安排 ${tables} 张桌子。<br>这相当于请求资源超过 Available。`;
        return;
    }
    
    if (funRestaurantState.seated[name] + tables > funRestaurantState.max[name]) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>请稍等：</strong>${name} 组已经坐了 ${funRestaurantState.seated[name]} 张桌子，再坐 ${tables} 张会超过最多 ${funRestaurantState.max[name]} 张的需求。<br>这相当于请求超过 Need。`;
        return;
    }
    
    const tempSeated = { ...funRestaurantState.seated, [name]: funRestaurantState.seated[name] + tables };
    const tempTables = funRestaurantState.tables - tables;
    
    if (funGenericCheckSafe(funRestaurantState.max, tempSeated, tempTables)) {
        funRestaurantState.seated[name] += tables;
        funRestaurantState.tables -= tables;
        funRestaurantUpdateUI();
        resultDiv.className = 'fun-demo-result success';
        resultDiv.innerHTML = `<strong>安排入座：</strong>给 ${name} 组安排 ${tables} 张桌子后，仍存在安全翻台顺序让所有客人最终都能坐满需求并离开。<br><strong>银行家算法：</strong>这次安排是安全的。`;
    } else {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>请 ${name} 组稍等：</strong>如果安排 ${tables} 张桌子，服务员将找不到一种顺序让所有组都坐到最多需要的桌子并翻台。<br><strong>银行家算法：</strong>这次安排会导致“死锁”风险，所以请客人先排队。`;
    }
}

function funRestaurantReset() {
    funRestaurantState = {
        tables: 10,
        seated: { A: 0, B: 0, C: 0, D: 0 },
        max: { A: 5, B: 4, C: 4, D: 3 }
    };
    funRestaurantUpdateUI();
    const resultDiv = document.getElementById('restaurant-result');
    resultDiv.className = 'fun-demo-result';
    resultDiv.innerHTML = '点击按钮，体验服务员如何用银行家算法安排座位。<br><small>提示：尝试 A→B→C→D，看看最后一步会不会因为“死锁风险”被拒绝。</small>';
}

let funProjectState = {
    engineers: 5,
    assigned: { A: 0, B: 0, C: 0 },
    max: { A: 4, B: 3, C: 4 }
};

function funProjectUpdateUI() {
    document.getElementById('project-engineers').textContent = funProjectState.engineers;
    document.getElementById('project-a').textContent = funProjectState.assigned.A;
    document.getElementById('project-b').textContent = funProjectState.assigned.B;
    document.getElementById('project-c').textContent = funProjectState.assigned.C;
}

function funProjectAssign(name, engineers) {
    const resultDiv = document.getElementById('project-result');
    
    if (engineers > funProjectState.engineers) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>暂缓分配：</strong>当前只有 ${funProjectState.engineers} 名空闲工程师，无法给 ${name} 项目分配 ${engineers} 人。<br>这相当于请求资源超过 Available。`;
        return;
    }
    
    if (funProjectState.assigned[name] + engineers > funProjectState.max[name]) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>暂缓分配：</strong>${name} 项目已投入 ${funProjectState.assigned[name]} 人，再加 ${engineers} 人会超过最多 ${funProjectState.max[name]} 人的需求。<br>这相当于请求超过 Need。`;
        return;
    }
    
    const tempAssigned = { ...funProjectState.assigned, [name]: funProjectState.assigned[name] + engineers };
    const tempEngineers = funProjectState.engineers - engineers;
    
    if (funGenericCheckSafe(funProjectState.max, tempAssigned, tempEngineers)) {
        funProjectState.assigned[name] += engineers;
        funProjectState.engineers -= engineers;
        funProjectUpdateUI();
        resultDiv.className = 'fun-demo-result success';
        resultDiv.innerHTML = `<strong>同意分配：</strong>给 ${name} 项目加 ${engineers} 人后，仍存在安全完成顺序让所有项目最终都能拿到所需人力并结束。<br><strong>银行家算法：</strong>这次分配是安全的。`;
    } else {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>暂缓分配：</strong>如果给 ${name} 项目加 ${engineers} 人，项目经理将找不到一种顺序让所有项目都获得所需人力并完成交付。<br><strong>银行家算法：</strong>这次分配会导致“死锁”风险，所以先不加人。`;
    }
}

function funProjectReset() {
    funProjectState = {
        engineers: 5,
        assigned: { A: 0, B: 0, C: 0 },
        max: { A: 4, B: 3, C: 4 }
    };
    funProjectUpdateUI();
    const resultDiv = document.getElementById('project-result');
    resultDiv.className = 'fun-demo-result';
    resultDiv.innerHTML = '点击按钮，体验项目经理如何用银行家算法分配人力。<br><small>提示：尝试 A→B→C，看看最后一步会不会因为“死锁风险”被拒绝。</small>';
}

function funBankShowAnswer() {
    const resultDiv = document.getElementById('bank-result');
    const result = funGenericFindSafeSequence(funBankState.max, funBankState.loans, funBankState.cash);
    
    if (!result.safe) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>当前状态已不安全：</strong>已无法找到一个让客户全部还清贷款的顺序。<br><strong>应对策略：</strong>点击“重置”回到初始状态，或尝试减少某笔放贷，保留银行现金缓冲。`;
        return;
    }
    
    const seqText = result.sequence.map(name => `${name} 客户还清 ${funBankState.max[name]} 万`).join(' → ');
    resultDiv.className = 'fun-demo-result info';
    resultDiv.innerHTML = `<strong>安全应对策略：</strong>按 <strong>${result.sequence.join(' → ')}</strong> 的顺序让客户完成还款。<br>具体路径：${seqText}。每完成一位客户，银行就收回其全部贷款，现金池变大，下一位客户自然能借到最高额度。<br><strong>现实启示：</strong>银行应优先安排“所需尾款少、能尽快回笼资金”的客户，形成良性循环。`;
}

function funRestaurantShowAnswer() {
    const resultDiv = document.getElementById('restaurant-result');
    const result = funGenericFindSafeSequence(funRestaurantState.max, funRestaurantState.seated, funRestaurantState.tables);
    
    if (!result.safe) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>当前状态已不安全：</strong>已无法找到一个让全部客人坐到最多桌子并翻台的顺序。<br><strong>应对策略：</strong>点击“重置”回到初始状态，或让部分客人先少坐几张桌子，保留空桌缓冲；必要时请最后一组客人排队等位。`;
        return;
    }
    
    const seqText = result.sequence.map(name => `${name} 组坐满 ${funRestaurantState.max[name]} 张后离开`).join(' → ');
    resultDiv.className = 'fun-demo-result info';
    resultDiv.innerHTML = `<strong>安全应对策略：</strong>按 <strong>${result.sequence.join(' → ')}</strong> 的顺序安排翻台。<br>具体路径：${seqText}。每翻台一组就释放其占用的全部桌子，空桌数量增加，下一组就能追加到最大需求。<br><strong>现实启示：</strong>服务员应优先安排“剩余需求小、能尽快翻台”的客人，避免所有桌子被“半满”状态长期占用。`;
}

function funProjectShowAnswer() {
    const resultDiv = document.getElementById('project-result');
    const result = funGenericFindSafeSequence(funProjectState.max, funProjectState.assigned, funProjectState.engineers);
    
    if (!result.safe) {
        resultDiv.className = 'fun-demo-result error';
        resultDiv.innerHTML = `<strong>当前状态已不安全：</strong>已无法找到一个让所有项目都获得所需人力并完成的顺序。<br><strong>应对策略：</strong>点击“重置”回到初始状态，或暂缓某个项目的人力追加，保留机动工程师；优先完成一个项目后再释放人力到下一个项目。`;
        return;
    }
    
    const seqText = result.sequence.map(name => `${name} 项目集齐 ${funProjectState.max[name]} 人完成`).join(' → ');
    resultDiv.className = 'fun-demo-result info';
    resultDiv.innerHTML = `<strong>安全应对策略：</strong>按 <strong>${result.sequence.join(' → ')}</strong> 的顺序推进项目。<br>具体路径：${seqText}。每完成一个项目就释放其全部人力，可用工程师变多，下一个项目就能追加到最高人力。<br><strong>现实启示：</strong>项目经理应优先推进“剩余人力缺口小、能尽快交付”的项目，避免所有项目都缺人而互相等待。`;
}

window.funBankLoan = funBankLoan;
window.funBankReset = funBankReset;
window.funBankShowAnswer = funBankShowAnswer;
window.funRestaurantSeat = funRestaurantSeat;
window.funRestaurantReset = funRestaurantReset;
window.funRestaurantShowAnswer = funRestaurantShowAnswer;
window.funProjectAssign = funProjectAssign;
window.funProjectReset = funProjectReset;
window.funProjectShowAnswer = funProjectShowAnswer;

document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    bindFunTabs();
    initHistoryChart();
    await initSystem();
});