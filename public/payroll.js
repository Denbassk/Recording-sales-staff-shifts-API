// API URL Configuration
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://shifts-api.fly.dev';

// --- КОНСТАНТЫ (остаются для отображения, но основная логика на сервере) ---
const FIXED_CARD_PAYMENT = 8600;
const ADVANCE_PERCENTAGE = 0.9;
const MAX_ADVANCE = FIXED_CARD_PAYMENT * ADVANCE_PERCENTAGE;
const ADVANCE_PERIOD_DAYS = 15;
const ASSUMED_WORK_DAYS_IN_FIRST_HALF = 12;

// --- БЛОК АВТОРИЗАЦИИ ---
document.addEventListener('DOMContentLoaded', async function() {
    
    // Новая функция для правильной проверки авторизации
    async function verifyAuthentication() {
        try {
            const response = await fetch(`${API_BASE}/check-auth`, {
                method: 'GET',
                credentials: 'include' // Важно для отправки cookies
            });

            if (!response.ok) {
                // Если статус 401 или другой ошибочный, значит токен невалидный или отсутствует
                window.location.href = '/index.html';
                return;
            }
            
            // Если аутентификация прошла успешно, инициализируем страницу
            initializePage();

        } catch (error) {
            console.error('Ошибка проверки аутентификации:', error);
            // В случае сетевой ошибки также перенаправляем на страницу входа
            window.location.href = '/index.html';
        }
    }

    // Функция для настройки страницы после успешной проверки
    function initializePage() {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        document.getElementById('revenueDate').value = todayStr;
        document.getElementById('payrollDate').value = todayStr;
        const reportMonthSelect = document.getElementById('reportMonth');
        const reportYearInput = document.getElementById('reportYear');
        reportMonthSelect.value = today.getMonth() + 1;
        reportYearInput.value = today.getFullYear();
        function updateEndDateDefault() {
            const year = reportYearInput.value;
            const month = reportMonthSelect.value;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            document.getElementById('reportEndDate').value = endDate;
        }
        updateEndDateDefault();
        reportMonthSelect.addEventListener('change', updateEndDateDefault);
        reportYearInput.addEventListener('change', updateEndDateDefault);
    }

    // Вызываем функцию проверки при загрузке страницы
    await verifyAuthentication();
});


async function logout() {
    await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/index.html';
}

// --- УТИЛИТЫ ---
function switchTab(tabName, button) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName + '-tab').classList.add('active');
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
}
function formatNumber(num) {
    if (typeof num !== 'number') return '0,00';
    return num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$& ').replace('.', ',');
}
function showStatus(elementId, message, type) {
    const statusEl = document.getElementById(elementId);
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
    statusEl.style.display = 'flex';
}
function hideStatus(elementId) {
    document.getElementById(elementId).style.display = 'none';
}

// --- ФУНКЦИИ ЭКСПОРТА В EXCEL ---
function exportToExcel(tableId, statusId, fileName) {
    const table = document.getElementById(tableId);
    if (!table || table.rows.length === 0) {
        showStatus(statusId, 'Нет данных для экспорта', 'error');
        return;
    }
    const tableClone = table.cloneNode(true);
    tableClone.querySelectorAll('input').forEach(input => {
        const parent = input.parentNode;
        parent.textContent = input.value;
    });
    tableClone.querySelectorAll('.summary-row').forEach(row => row.remove());

    const wb = XLSX.utils.table_to_book(tableClone, { sheet: "Отчет" });
    const wbout = XLSX.write(wb, { bookType: 'xlsx', bookSST: true, type: 'array' });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `${fileName}.xlsx`);
}
function exportRevenueToExcel() {
    const date = document.getElementById('revenueDate').value;
    exportToExcel('revenueTable', 'revenueStatus', `Выручка_${date}`);
}
function exportDailyPayrollToExcel() {
    const date = document.getElementById('payrollDate').value;
    exportToExcel('payrollTable', 'payrollStatus', `Расчет_за_день_${date}`);
}
function exportMonthlyReportToExcel() {
    const month = document.getElementById('reportMonth').value;
    const year = document.getElementById('reportYear').value;
    exportToExcel('monthlyReportTable', 'reportStatus', `Отчет_за_месяц_${month}_${year}`);
}


// --- ВКЛАДКА "ЗАГРУЗКА ВЫРУЧКИ" ---
async function uploadRevenueFile() {
    const fileInput = document.getElementById('revenueFile');
    const dateInput = document.getElementById('revenueDate');
    const file = fileInput.files[0];
    const date = dateInput.value;

    if (!file || !date) {
        showStatus('revenueStatus', 'Пожалуйста, выберите файл и укажите дату.', 'error');
        return;
    }

    showStatus('revenueStatus', 'Загрузка и обработка файла...', 'info');
    
    // Используем FormData для отправки файла и даты вместе
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', date);

    try {
        const response = await fetch(`${API_BASE}/upload-revenue-file`, {
            method: 'POST',
            credentials: 'include',
            body: formData, // Отправляем FormData, заголовок Content-Type установится автоматически
        });

        const result = await response.json();

        if (result.success) {
            showStatus('revenueStatus', result.message, 'success');
            displayRevenuePreview(result.revenues, result.matched, result.unmatched, result.totalRevenue);
        } else {
            throw new Error(result.error || 'Неизвестная ошибка сервера');
        }
    } catch (error) {
        console.error('Ошибка при загрузке файла:', error);
        showStatus('revenueStatus', `Ошибка: ${error.message}`, 'error');
    }
}

function displayRevenuePreview(revenues, matched, unmatched, totalRevenue) {
    document.getElementById('revenuePreview').style.display = 'block';
    document.getElementById('revenueEmpty').style.display = 'none';
    const tbody = document.getElementById('revenueTableBody');
    tbody.innerHTML = '';
    let counter = 1;
    revenues.forEach(item => {
        const isMatched = matched.includes(item.store_address);
        tbody.innerHTML += `
            <tr>
                <td>${counter++}</td>
                <td>${item.store_address}</td>
                <td>${formatNumber(item.revenue)} грн</td>
                <td>
                    <span class="badge ${isMatched ? 'success' : 'warning'}">
                        ${isMatched ? 'Сопоставлено' : 'Нет в базе'}
                    </span>
                </td>
            </tr>
        `;
    });
    document.getElementById('totalRevenueValue').textContent = `${formatNumber(totalRevenue)} грн`;
    if (unmatched.length > 0) {
        showStatus('revenueStatus', `Внимание: ${unmatched.length} торговых точек не найдены в базе: ${unmatched.join(', ')}`, 'warning');
    }
}

function cancelRevenueUpload() {
    document.getElementById('revenuePreview').style.display = 'none';
    document.getElementById('revenueEmpty').style.display = 'block';
    document.getElementById('revenueFile').value = '';
    hideStatus('revenueStatus');
}

async function confirmRevenueSave() {
    // В текущей логике данные уже сохраняются при загрузке,
    // эта кнопка может просто закрывать превью и сбрасывать форму
    showStatus('revenueStatus', 'Данные были успешно сохранены при обработке файла.', 'success');
    setTimeout(() => {
        cancelRevenueUpload();
    }, 2000);
}


// --- ВКЛАДКА "РАСЧЕТ ЗАРПЛАТЫ" ---
async function calculatePayroll() { /* ... без изменений ... */ }

function displayPayrollResults(calculations, summary) {
    const tbody = document.getElementById('payrollTableBody');
    tbody.innerHTML = '';
    const groupedByStore = calculations.reduce((acc, calc) => {
        const store = calc.store_address || 'Старший продавец';
        if (!acc[store]) acc[store] = [];
        acc[store].push(calc);
        return acc;
    }, {});
    const sortedStores = Object.keys(groupedByStore).sort();
    for (const storeName of sortedStores) {
        const storeCalculations = groupedByStore[storeName];
        let storeTotalPay = 0;
        tbody.innerHTML += `<tr class="summary-row" style="background-color: #f0f2f5;"><td colspan="7" style="font-weight: bold;">Магазин: ${storeName}</td></tr>`;
        storeCalculations.forEach(calc => {
            storeTotalPay += calc.total_pay;
            tbody.innerHTML += `<tr><td>${calc.employee_name} ${calc.is_senior ? '<span class="badge warning">СП</span>' : ''}</td><td>${calc.store_address}</td><td>${formatNumber(calc.revenue)} грн</td><td>${calc.num_sellers}</td><td>${formatNumber(calc.base_rate)} грн</td><td>${formatNumber(calc.bonus)} грн</td><td><strong>${formatNumber(calc.total_pay)} грн</strong></td></tr>`;
        });
        tbody.innerHTML += `<tr class="summary-row" style="background-color: #e9ecef;"><td colspan="6" style="font-weight: bold; text-align: right;">Итого по магазину:</td><td style="font-weight: bold;"><strong>${formatNumber(storeTotalPay)} грн</strong></td></tr>`;
    }
    document.getElementById('payrollTable').style.display = 'table';
    updatePayrollSummary(summary.total_payroll, calculations.length);
}

function updatePayrollSummary(totalPayroll, employeeCount) {
    document.getElementById('totalEmployees').textContent = employeeCount;
    document.getElementById('totalPayroll').textContent = formatNumber(totalPayroll);
    document.getElementById('payrollSummary').style.display = 'block';
}

// --- ВКЛАДКА "ОТЧЕТ ЗА МЕСЯЦ" ---
let adjustmentDebounceTimer;
async function generateMonthlyReport() { /* ... без изменений ... */ }

function displayMonthlyReport(dailyData, adjustments, month, year) {
    const employeeData = {};
    dailyData.forEach(calc => {
        if (!employeeData[calc.employee_id]) {
            employeeData[calc.employee_id] = { name: calc.employee_name, totalPay: 0, shifts: [], stores: {} };
        }
        employeeData[calc.employee_id].totalPay += calc.total_pay;
        employeeData[calc.employee_id].shifts.push(new Date(calc.work_date).getDate());
        const store = calc.store_address || 'Старший продавец';
        employeeData[calc.employee_id].stores[store] = (employeeData[calc.employee_id].stores[store] || 0) + 1;
    });
    const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));
    let tableHtml = `
        <h3 style="margin-top: 30px; margin-bottom: 20px;">👥 Детализация по сотрудникам:</h3>
        <table id="monthlyReportTable" style="font-size: 12px; white-space: nowrap;">
            <thead>
                <tr>
                    <th rowspan="2" style="vertical-align: middle;">Сотрудник</th>
                    <th rowspan="2" style="vertical-align: middle;">Всего начислено</th>
                    <th colspan="2">Премирование</th>
                    <th colspan="2">Депремирование</th>
                    <th rowspan="2" style="vertical-align: middle;">Вычет за недостачу</th>
                    <th rowspan="2" style="vertical-align: middle;">Аванс (на карту)</th>
                    <th rowspan="2" style="vertical-align: middle;">Остаток (на карту)</th>
                    <th rowspan="2" style="vertical-align: middle;">Зарплата (наличными)</th>
                </tr>
                <tr><th>Сумма</th><th>Причина</th><th>Сумма</th><th>Причина</th></tr>
            </thead>
            <tbody>`;
    for (const [id, data] of Object.entries(employeeData)) {
        let primaryStore = 'Не определен';
        if (Object.keys(data.stores).length > 0) {
            primaryStore = Object.keys(data.stores).reduce((a, b) => data.stores[a] > data.stores[b] ? a : b);
        }
        const adj = adjustmentsMap.get(id) || { manual_bonus: 0, penalty: 0, shortage: 0, bonus_reason: '', penalty_reason: '' };
        tableHtml += `<tr data-employee-id="${id}" data-employee-name="${data.name}" data-store-address="${primaryStore}" data-month="${month}" data-year="${year}" data-base-pay="${data.totalPay}" data-shifts='${JSON.stringify(data.shifts)}'>
                        <td>${data.name}</td>
                        <td class="total-gross">${formatNumber(data.totalPay + (adj.manual_bonus || 0))}</td>
                        <td><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus || 0}"></td>
                        <td><input type="text" class="adjustment-input" name="bonus_reason" value="${adj.bonus_reason || ''}" placeholder="Причина"></td>
                        <td><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty || 0}"></td>
                        <td><input type="text" class="adjustment-input" name="penalty_reason" value="${adj.penalty_reason || ''}" placeholder="Причина"></td>
                        <td><input type="number" class="adjustment-input" name="shortage" value="${adj.shortage || 0}"></td>
                        <td class="advance-payment">0,00</td>
                        <td class="card-remainder">0,00</td>
                        <td class="cash-payout"><strong>0,00</strong></td>
                    </tr>`;
    }
    tableHtml += `</tbody></table>`;
    document.getElementById('monthlyReportContent').innerHTML = tableHtml;
    document.querySelectorAll('.adjustment-input').forEach(input => input.addEventListener('input', handleAdjustmentInput));
    calculateAdvance15(true);
}


function handleAdjustmentInput(e) {
    clearTimeout(adjustmentDebounceTimer);
    const row = e.target.closest('tr');
    recalculateRow(row);
    adjustmentDebounceTimer = setTimeout(() => {
        saveAdjustments(row);
    }, 800);
}

function recalculateRow(row) {
    const basePay = parseFloat(row.dataset.basePay);
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]').value) || 0;
    const totalGross = basePay + manualBonus;
    row.querySelector('.total-gross').textContent = formatNumber(totalGross);
}

async function saveAdjustments(row) { /* ... без изменений ... */ }

async function calculateAdvance15(silent = false) {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        if (!silent) showStatus('reportStatus', 'Сначала сформируйте отчет за месяц', 'error');
        return;
    }
    if (!silent) showStatus('reportStatus', 'Рассчитываем аванс...', 'info');

    const year = document.getElementById('reportYear').value;
    const month = document.getElementById('reportMonth').value;

    try {
        const response = await fetch(`${API_BASE}/calculate-advance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            credentials: 'include',
            body: JSON.stringify({ year, month })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Ошибка ответа сервера');

        tableRows.forEach(row => {
            const employeeId = row.dataset.employeeId;
            const result = data.results[employeeId];
            if (result) {
                row.querySelector('.advance-payment').textContent = formatNumber(result.advance_payment);
            } else {
                row.querySelector('.advance-payment').textContent = formatNumber(0);
            }
        });

        if (!silent) showStatus('reportStatus', 'Аванс успешно рассчитан и отображен.', 'success');

    } catch (error) {
        console.error("Ошибка при расчете аванса:", error);
        if (!silent) showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}

async function calculateFinalPayroll() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        showStatus('reportStatus', 'Сначала сформируйте отчет за месяц', 'error');
        return;
    }
    showStatus('reportStatus', 'Выполняем окончательный расчет...', 'info');

    const year = document.getElementById('reportYear').value;
    const month = document.getElementById('reportMonth').value;
    const reportEndDate = document.getElementById('reportEndDate').value;

    try {
        const savePromises = [];
        tableRows.forEach(row => savePromises.push(saveAdjustments(row)));
        await Promise.all(savePromises);

        const response = await fetch(`${API_BASE}/calculate-final-payroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            credentials: 'include',
            body: JSON.stringify({ year, month, reportEndDate })
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Ошибка ответа сервера');

        tableRows.forEach(row => {
            const employeeId = row.dataset.employeeId;
            const result = data.results[employeeId];
            if (result) {
                row.querySelector('.total-gross').textContent = formatNumber(result.total_gross);
                row.querySelector('.advance-payment').textContent = formatNumber(result.advance_payment);
                row.querySelector('.card-remainder').textContent = formatNumber(result.card_remainder);
                row.querySelector('.cash-payout strong').textContent = formatNumber(result.cash_payout);
            }
        });

        showStatus('reportStatus', 'Окончательный расчет выполнен.', 'success');

    } catch (error) {
        console.error("Ошибка при окончательном расчете:", error);
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}

function generateCashPayoutReport() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) { return showStatus('reportStatus', 'Сначала сформируйте отчет', 'error'); }
    const groupedByStore = {};
    tableRows.forEach(row => {
        const storeAddress = row.dataset.storeAddress;
        if (!groupedByStore[storeAddress]) groupedByStore[storeAddress] = [];
        const employeeName = row.dataset.employeeName;
        const cashText = row.querySelector('.cash-payout strong').textContent;
        const cashAmount = parseFloat(cashText.replace(/\s/g, '').replace(',', '.')) || 0;
        groupedByStore[storeAddress].push({ name: employeeName, cash: cashAmount });
    });
    const sortedStores = Object.keys(groupedByStore).sort();
    let reportHtml = `<div id="print-area"><h3>Ведомость по выплатам наличными</h3>`;
    let grandTotalCash = 0;
    for (const storeName of sortedStores) {
        const employees = groupedByStore[storeName];
        let storeTotal = 0;
        reportHtml += `<table border="1" style="width:100%; border-collapse: collapse; margin-top: 20px; font-size: 10pt;">
                        <thead>
                            <tr><th colspan="2" style="padding: 5px; text-align: left;">Магазин: ${storeName}</th></tr>
                            <tr><th style="padding: 5px; text-align: left;">Сотрудник</th><th style="padding: 5px;">Сумма наличными, грн</th></tr>
                        </thead><tbody>`;
        employees.forEach(emp => {
            storeTotal += emp.cash;
            reportHtml += `<tr><td style="padding: 5px;">${emp.name}</td><td style="padding: 5px; text-align: right;">${formatNumber(emp.cash)}</td></tr>`;
        });
        reportHtml += `</tbody><tfoot><tr><td style="padding: 5px;"><strong>Итого по магазину:</strong></td><td style="padding: 5px; text-align: right;"><strong>${formatNumber(storeTotal)}</strong></td></tr></tfoot></table>`;
        grandTotalCash += storeTotal;
    }
    reportHtml += `<h4 style="margin-top: 20px; text-align: right;">Общий итог: ${formatNumber(grandTotalCash)} грн</h4></div>`;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Ведомость по наличным</title></head><body>${reportHtml}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

function printAllPayslips() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) { return showStatus('reportStatus', 'Нет данных для печати', 'error'); }
    const month = tableRows[0].dataset.month;
    const year = tableRows[0].dataset.year;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    let allPayslipsHTML = '';
    tableRows.forEach(row => {
        const employeeName = row.dataset.employeeName;
        const storeAddress = row.dataset.storeAddress;
        const basePay = parseFloat(row.dataset.basePay);
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]').value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]').value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]').value) || 0;
        const bonus_reason = row.querySelector('[name="bonus_reason"]').value || '-';
        const penalty_reason = row.querySelector('[name="penalty_reason"]').value || '-';
        const totalGross = basePay + manualBonus;
        const advanceAmount = parseFloat(row.querySelector('.advance-payment').textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cardRemainderAmount = parseFloat(row.querySelector('.card-remainder').textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cashAmount = parseFloat(row.querySelector('.cash-payout strong').textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const totalToPay = totalGross - penalty - shortage;
        allPayslipsHTML += `<div class="payslip-compact">
                                <h3>Расчетный лист</h3>
                                <p><strong>Сотрудник:</strong> ${employeeName}</p>
                                ${storeAddress !== 'Старший продавец' && storeAddress !== 'Не определен' ? `<p><strong>Магазин:</strong> ${storeAddress}</p>` : ''}
                                <p><strong>Период:</strong> ${monthNames[month - 1]} ${year}</p>
                                <table>
                                    <tr><td>Начислено (ставка + бонус):</td><td align="right">${formatNumber(basePay)} грн</td></tr>
                                    <tr><td>Премирование (${bonus_reason}):</td><td align="right">${formatNumber(manualBonus)} грн</td></tr>
                                    <tr><td><strong>Всего начислено:</strong></td><td align="right"><strong>${formatNumber(totalGross)} грн</strong></td></tr>
                                    <tr><td style="color:red;">Депремирование (${penalty_reason}):</td><td align="right" style="color:red;">-${formatNumber(penalty)} грн</td></tr>
                                    <tr><td style="color:red;">Вычет за недостачу:</td><td align="right" style="color:red;">-${formatNumber(shortage)} грн</td></tr>
                                    <tr><td><strong>Итого к выплате:</strong></td><td align="right"><strong>${formatNumber(totalToPay)} грн</strong></td></tr>
                                </table>
                                <table>
                                    <tr><td>Выплачено авансом (на карту):</td><td align="right">${formatNumber(advanceAmount)} грн</td></tr>
                                    <tr><td>Выплачено остатка (на карту):</td><td align="right">${formatNumber(cardRemainderAmount)} грн</td></tr>
                                    <tr><td>Выплачено зарплаты (наличными):</td><td align="right">${formatNumber(cashAmount)} грн</td></tr>
                                </table>
                                <p style="margin-top: 15px;">Подпись: _________________________</p>
                            </div>`;
    });
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Расчетные ведомости</title><style>
        body { font-family: Arial, sans-serif; }
        #print-area { display: flex; flex-direction: column; }
        .payslip-compact {
            font-size: 9pt; height: 30%; box-sizing: border-box;
            padding-bottom: 5mm; margin-bottom: 5mm;
            border-bottom: 2px dashed #999; page-break-inside: avoid;
        }
        .payslip-compact:last-child { border-bottom: none; }
        .payslip-compact h3 { text-align: center; font-size: 12pt; margin-bottom: 10px; }
        .payslip-compact table { width: 100%; border-collapse: collapse; margin: 5px 0; }
        .payslip-compact td { padding: 2px 0; }
        @page { size: A4; margin: 15mm; }
    </style></head><body><div id="print-area">${allPayslipsHTML}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}
