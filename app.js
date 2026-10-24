// API Configuration
const API_BASE_URL = 'http://127.0.0.1:8001';

console.log('Optwise JS: Loading...');

// Global error handler for debugging
window.onerror = function (msg, url, lineNo, columnNo, error) {
    const errorMsg = document.getElementById('errorMessage');
    if (errorMsg) {
        errorMsg.textContent = `JS Error: ${msg} (at ${lineNo}:${columnNo})`;
        errorMsg.style.display = 'block';
        errorMsg.style.background = '#ef4444';
    }
    console.error('Global error:', { msg, url, lineNo, columnNo, error });
    return false;
};

// Global state
let currentTrades = [];
let charts = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Optwise JS: Initializing...');
    try {
        // Tag the UI to show JS is running — lights up the topbar status indicator
        const statusEl = document.querySelector('.market-status');
        if (statusEl) {
            statusEl.classList.add('is-ready');
            const dot = statusEl.querySelector('.status-dot');
            if (dot) dot.classList.add('live');
            const label = statusEl.querySelector('.market-status-label');
            if (label) label.textContent = 'System active';
            statusEl.title = 'Optwise front-end initialised';
        }

        initializeForm();
        setDefaultDates();
        console.log('Optwise JS: Form ready');
        // Portfolio overview & monthly profits are static in HTML — no API required.
        // Run backtest manually when the backend is available.
    } catch (error) {
        console.error('Optwise JS: Critical Initialization Error', error);
    }
});

function setDefaultDates() {
    const today = new Date();
    const defaultStartDate = new Date('2025-10-01');

    document.getElementById('fromDate').value = formatDate(defaultStartDate);
    document.getElementById('toDate').value = formatDate(today);
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function initializeForm() {
    const form = document.getElementById('backtestForm');
    form.addEventListener('submit', handleFormSubmit);

    document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
    document.getElementById('searchInput').addEventListener('input', filterTrades);
    document.getElementById('filterExitReason').addEventListener('change', filterTrades);
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const params = {
        from_date: formData.get('fromDate'),
        to_date: formData.get('toDate'),
        iv_threshold: parseFloat(formData.get('ivThreshold')),
        max_simultaneous_positions: parseInt(formData.get('maxPositions')),
        target_profit_pct: parseFloat(formData.get('targetProfit')),
        max_loss_pct: parseFloat(formData.get('maxLoss')),
        max_hold_hours: parseFloat(formData.get('maxHoldHours')),
        min_gap_minutes: parseInt(formData.get('minGapMinutes')),
        lots: parseInt(formData.get('lots')),
        hedge_type: formData.get('hedgeType'),
    };

    await runBacktest(params);
}

async function runBacktest(params) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultsPanel = document.getElementById('resultsPanel');
    const errorMessage = document.getElementById('errorMessage');
    const runBtn = document.getElementById('runBacktestBtn');

    // Show loading
    loadingOverlay.style.display = 'flex';
    runBtn.disabled = true;
    errorMessage.style.display = 'none';
    resultsPanel.style.display = 'none';

    try {
        console.log('Sending backtest request:', params);
        const response = await fetch(`${API_BASE_URL}/api/backtest`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
            throw new Error(error.detail || 'Failed to run backtest');
        }

        const data = await response.json();
        console.log('Backtest data received:', {
            trades: data.trades?.length || 0,
            summary: data.summary
        });

        if (!data.trades || data.trades.length === 0) {
            const message =
                data.error ||
                data.summary?.message ||
                'No trades generated for the selected period. Try adjusting the date range or IV threshold.';
            displayResultsEmpty(data.summary || {}, message);
            errorMessage.textContent = `Info: ${message}`;
            errorMessage.style.display = 'block';
            errorMessage.style.background = '#f59e0b';
            setTimeout(() => {
                errorMessage.style.display = 'none';
            }, 8000);
            return;
        }

        currentTrades = data.trades;
        displayResults(data);

    } catch (error) {
        console.error('Backtest error:', error);
        errorMessage.textContent = `Error: ${error.message}`;
        errorMessage.style.display = 'block';
        errorMessage.style.background = '#ef4444'; // Error color
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 8000);
    } finally {
        loadingOverlay.style.display = 'none';
        runBtn.disabled = false;
    }
}

function setBacktestInfoBanner(visible, text = '') {
    const banner = document.getElementById('backtestInfoBanner');
    if (!banner) return;
    banner.textContent = text;
    banner.style.display = visible && text ? 'block' : 'none';
}

function displayResultsEmpty(summary, message) {
    const resultsPanel = document.getElementById('resultsPanel');
    resultsPanel.style.display = 'block';
    setBacktestInfoBanner(true, message);
    updateSummaryCards(summary);
    updateDetailedMetrics(summary);
    displayTradeTable([]);
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function displayResults(data) {
    const resultsPanel = document.getElementById('resultsPanel');
    resultsPanel.style.display = 'block';
    setBacktestInfoBanner(false);

    // Scroll to results
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update summary cards
    updateSummaryCards(data.summary);

    // Update detailed metrics
    updateDetailedMetrics(data.summary);

    // Create charts
    createCharts(data);

    // Display trade table
    displayTradeTable(data.trades);
}

function updateSummaryCards(summary) {
    summary = summary || {};
    const totalTrades = summary.total_trades ?? 0;
    document.getElementById('totalTrades').textContent = totalTrades.toLocaleString();

    const winRate = summary.win_rate ?? 0;
    document.getElementById('winRate').textContent = `${Number(winRate).toFixed(2)}%`;

    const totalPnl = summary.total_pnl_after_costs ?? summary.total_pnl_inr ?? 0;
    const pnlElement = document.getElementById('totalPnl');
    pnlElement.textContent = `₹${Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    pnlElement.style.color = totalPnl >= 0 ? '#10b981' : '#ef4444';

    const avgPnl = summary.avg_pnl_after_costs ?? summary.avg_pnl_inr ?? 0;
    const avgPnlElement = document.getElementById('avgPnl');
    avgPnlElement.textContent = `₹${Math.abs(avgPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    avgPnlElement.style.color = avgPnl >= 0 ? '#10b981' : '#ef4444';
}

function updateDetailedMetrics(summary) {
    summary = summary || {};
    document.getElementById('winningTrades').textContent = (summary.winning_trades ?? 0).toLocaleString();
    document.getElementById('losingTrades').textContent = (summary.losing_trades ?? 0).toLocaleString();

    const worst = summary.worst_trade_inr;
    document.getElementById('worstTrade').textContent =
        worst !== undefined && worst !== null && !Number.isNaN(Number(worst))
            ? `₹${Number(worst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : '—';

    document.getElementById('maxLossHits').textContent = (summary.max_loss_cap_hit ?? 0).toLocaleString();

    const prem = summary.avg_premium_received;
    document.getElementById('avgPremium').textContent =
        prem !== undefined && prem !== null && !Number.isNaN(Number(prem))
            ? `₹${Number(prem).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : '—';
}

function createCharts(data) {
    // Charts removed as per user request
}

function createCumulativePnlChart(cumulativeData) {
    const ctx = document.getElementById('cumulativePnlChart').getContext('2d');

    // Destroy existing chart if it exists
    if (charts.cumulativePnl) {
        charts.cumulativePnl.destroy();
    }

    const dates = cumulativeData.map(d => new Date(d.date).toLocaleDateString());
    const pnlValues = cumulativeData.map(d => d.cumulative_pnl);

    charts.cumulativePnl = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Cumulative P&L (INR)',
                data: pnlValues,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#cbd5e1'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cbd5e1' },
                    grid: { color: '#475569' }
                },
                y: {
                    ticks: {
                        color: '#cbd5e1',
                        callback: function (value) {
                            return '₹' + value.toLocaleString('en-IN');
                        }
                    },
                    grid: { color: '#475569' }
                }
            }
        }
    });
}

function displayTradeTable(trades) {
    const tbody = document.getElementById('tradesTableBody');
    tbody.innerHTML = '';

    trades.forEach(trade => {
        const pnlAfterCosts = trade.pnl_after_costs !== undefined ? trade.pnl_after_costs : (trade.pnl_value - (trade.trading_cost || 200));
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDateTime(trade.entry_time)}</td>
            <td>${formatDateTime(trade.exit_time)}</td>
            <td>₹${parseFloat(trade.entry_spot).toFixed(2)}</td>
            <td>₹${parseFloat(trade.exit_spot).toFixed(2)}</td>
            <td>₹${parseFloat(trade.premium_received).toFixed(2)}</td>
            <td class="${trade.pnl >= 0 ? 'positive' : 'negative'}">${trade.pnl.toFixed(2)}</td>
            <td class="${pnlAfterCosts >= 0 ? 'positive' : 'negative'}">₹${Math.abs(pnlAfterCosts).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
            <td>${parseFloat(trade.hold_hours).toFixed(2)}</td>
            <td><span class="exit-badge exit-${trade.exit_reason.toLowerCase().replace('_', '-')}">${trade.exit_reason}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function filterTrades() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const exitReasonFilter = document.getElementById('filterExitReason').value;
    const rows = document.querySelectorAll('#tradesTableBody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const exitReason = row.querySelector('td:last-child').textContent.trim();

        const matchesSearch = !searchTerm || text.includes(searchTerm);
        const matchesFilter = !exitReasonFilter || exitReason === exitReasonFilter;

        row.style.display = matchesSearch && matchesFilter ? '' : 'none';
    });
}

function exportToCSV() {
    if (currentTrades.length === 0) {
        alert('No trades to export');
        return;
    }

    // Convert trades to CSV
    const headers = Object.keys(currentTrades[0]);
    const csvRows = [
        headers.join(','),
        ...currentTrades.map(trade =>
            headers.map(header => {
                const value = trade[header];
                // Handle values that might contain commas
                if (typeof value === 'string' && value.includes(',')) {
                    return `"${value}"`;
                }
                return value;
            }).join(',')
        )
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optwise_trades_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Add CSS for exit badges
const style = document.createElement('style');
style.textContent = `
    .positive { color: #10b981; }
    .negative { color: #ef4444; }
    .exit-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 500;
    }
    .exit-target { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .exit-max-loss { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .exit-time { background: rgba(99, 102, 241, 0.2); color: #6366f1; }
    .exit-iv-reversion { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
`;
document.head.appendChild(style);
