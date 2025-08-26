// API URL Configuration
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://shifts-api.fly.dev';

// СУММА ДЛЯ ВЫПЛАТЫ НА КАРТУ
const CARD_PAYMENT_AMOUNT = 8600;

// --- БЛОК ДЛЯ АВТОРИЗАЦИИ И НАСТРОЙКИ ДАТ ---
document.addEventListener('DOMContentLoaded', function() {
    // ВАЖНО: Эта проверка теперь будет работать с JWT/cookie, а не с localStorage
    if (!document.cookie.includes('token=')) {
        window.location.href = '/index.html';
        return; 
    }
    
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
});

async function logout() {
    await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/index.html';
}

// --- ОБЩИЕ ФУНКЦИИ И УТИЛИТЫ ---
function switchTab(tabName, button) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(tabName + '-tab').classList.add('active');
}

function formatNumber(num) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function showStatus(elementId, message, type) {
    const statusEl = document.getElementById(elementId);
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.style.display = 'flex';
    if (type !== 'info') setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
}

function hideStatus(elementId) {
    document.getElementById(elementId).style.display = 'none';
}


// --- ВКЛАДКА "ЗАГРУЗКА ВЫРУЧКИ" ---
async function uploadRevenueFile() {
    const date = document.getElementById('revenueDate').value;
    const fileInput = document.getElementById('revenueFile');
    const file = fileInput.files[0];

    if (!date) return showStatus('revenueStatus', 'Выберите дату', 'error');
    if (!file) return showStatus('revenueStatus', 'Выберите файл с выручкой', 'error');

    document.getElementById('revenueEmpty').style.display = 'none';
    showStatus('revenueStatus', 'Обработка файла...', 'info');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', date);

    try {
        const response = await fetch(`${API_BASE}/upload-revenue-file`, { 
            method: 'POST', 
            body: formData,
            credentials: 'include' 
        });
        const result = await response.json();
        if (response.status === 401 || response.status === 403) {
            alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.');
            window.location.href = '/index.html';
            return;
        }
        if (result.success) {
            displayRevenuePreview(result.revenues, result.matched, result.unmatched, result.totalRevenue);
            showStatus('revenueStatus', `Обработано записей: ${result.revenues.length}`, 'success');
        } else {
            showStatus('revenueStatus', 'Ошибка обработки файла: ' + result.error, 'error');
        }
    } catch (error) {
        showStatus('revenueStatus', 'Ошибка: ' + error.message, 'error');
    }
}

function displayRevenuePreview(revenues, matched, unmatched, totalRevenue) {
    const tbody = document.getElementById('revenueTableBody');
    tbody.innerHTML = '';
    revenues.forEach((item, index) => {
        const row = tbody.insertRow();
        const isMatched = matched.includes(item.store_address);
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.store_address}</td>
            <td>${item.revenue.toFixed(2)}</td>
            <td><span class="badge ${isMatched ? 'success' : 'warning'}">${isMatched ? '✅ Найден' : '⚠️ Не найден'}</span></td>
        `;
    });
    document.getElementById('revenuePreview').style.display = 'block';

    if (totalRevenue !== undefined) {
        document.getElementById('totalRevenueValue').textContent = formatNumber(totalRevenue) + ' грн';
    }

    if (unmatched.length > 0) {
        showStatus('revenueStatus', `Внимание! ${unmatched.length} магазинов не найдено в базе данных`, 'error');
    }
}

function cancelRevenueUpload() {
    document.getElementById('revenueFile').value = '';
    document.getElementById('revenuePreview').style.display = 'none';
    document.getElementById('revenueEmpty').style.display = 'block';
    hideStatus('revenueStatus');
}

function confirmRevenueSave() {
    showStatus('revenueStatus', 'Данные успешно сохранены', 'success');
    document.getElementById('revenueFile').value = '';
    document.getElementById('revenuePreview').style.display = 'none';
    setTimeout(() => { document.getElementById('revenueEmpty').style.display = 'block'; }, 1000);
}


// --- ВКЛАДКА "РАСЧЕТ ЗАРПЛАТЫ" ---
async function calculatePayroll() {
    const date = document.getElementById('payrollDate').value;
    if (!date) return showStatus('payrollStatus', 'Выберите дату для расчета', 'error');

    document.getElementById('loader').style.display = 'block';
    document.getElementById('payrollTable').style.display = 'none';
    document.getElementById('payrollSummary').style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/calculate-payroll`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ date }),
            credentials: 'include'
        });
        if (response.status === 401 || response.status === 403) {
            alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.');
            window.location.href = '/index.html';
            return;
        }
        const result = await response.json();
        document.getElementById('loader').style.display = 'none';

        if (result.success) {
            displayPayrollResults(result.calculations, result.summary);
            showStatus('payrollStatus', `Зарплата за ${new Date(date).toLocaleDateString('ru-RU')} успешно рассчитана`, 'success');
        } else {
            showStatus('payrollStatus', 'Ошибка расчета: ' + (result.message || result.error), 'error');
        }
    } catch (error) {
        document.getElementById('loader').style.display = 'none';
        showStatus('payrollStatus', 'Ошибка соединения с сервером: ' + error.message, 'error');
    }
}

function displayPayrollResults(calculations, summary) {
    const tbody = document.getElementById('payrollTableBody');
    tbody.innerHTML = '';
    calculations.forEach(calc => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${calc.employee_name} ${calc.is_senior ? '<span class="badge warning">СП</span>' : ''}</td>
            <td>${calc.store_address}</td>
            <td>${calc.revenue.toFixed(2)} грн</td>
            <td>${calc.num_sellers}</td>
            <td>${calc.base_rate.toFixed(2)} грн</td>
            <td>${calc.bonus.toFixed(2)} грн</td>
            <td><strong>${calc.total_pay.toFixed(2)} грн</strong></td>
        `;
    });
    document.getElementById('payrollTable').style.display = 'table';
    updatePayrollSummary(summary.total_payroll, calculations.length);
}

function updatePayrollSummary(totalPayroll, employeeCount) {
    const tax = totalPayroll * 0.23;
    const net = totalPayroll - tax;
    document.getElementById('totalEmployees').textContent = employeeCount;
    document.getElementById('totalPayroll').textContent = formatNumber(totalPayroll);
    document.getElementById('totalTax').textContent = formatNumber(tax);
    document.getElementById('netPayroll').textContent = formatNumber(net);
    document.getElementById('payrollSummary').style.display = 'block';
}


// --- ВКЛАДКА "ОТЧЕТ ЗА МЕСЯЦ" ---
let adjustmentDebounceTimer;

async function generateMonthlyReport() {
    const month = document.getElementById('reportMonth').value;
    const year = document.getElementById('reportYear').value;
    const endDateStr = document.getElementById('reportEndDate').value;
    const endDate = new Date(endDateStr);

    showStatus('reportStatus', 'Генерация отчета...', 'info');
    document.getElementById('monthlyReportContent').innerHTML = '<div class="loader"></div>';
    document.getElementById('monthlyReportContent').style.display = 'block';

    try {
        const lastDayToCalculate = endDate.getDate();
        const dailyPromises = [];
        for (let day = 1; day <= lastDayToCalculate; day++) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const fetchPromise = fetch(`${API_BASE}/calculate-payroll`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ date }),
                credentials: 'include'
            }).then(res => {
                if (res.status === 401 || res.status === 403) throw new Error('Auth');
                return res.json();
            });
            dailyPromises.push(fetchPromise);
        }
        
        const dailyResults = await Promise.all(dailyPromises);
        const monthData = dailyResults.flatMap(result => result.success ? result.calculations : []);

        const adjustmentsResponse = await fetch(`${API_BASE}/payroll/adjustments/${year}/${month}`, {
            credentials: 'include'
        });
        if (adjustmentsResponse.status === 401 || adjustmentsResponse.status === 403) throw new Error('Auth');
        const adjustments = await adjustmentsResponse.json();

        if (monthData.length === 0) {
            showStatus('reportStatus', 'Нет данных за выбранный период', 'info');
            document.getElementById('monthlyReportContent').innerHTML = '';
            return;
        }

        displayMonthlyReport(monthData, adjustments, month, year);
        showStatus('reportStatus', 'Отчет успешно сформирован', 'success');

    } catch (error) {
        if(error.message === 'Auth') {
            alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.');
            window.location.href = '/index.html';
        } else {
            showStatus('reportStatus', 'Ошибка генерации отчета: ' + error.message, 'error');
        }
    }
}

function displayMonthlyReport(dailyData, adjustments, month, year) {
    const employeeData = {};
    dailyData.forEach(calc => {
        if (!employeeData[calc.employee_id]) {
            employeeData[calc.employee_id] = { name: calc.employee_name, totalPay: 0 };
        }
        employeeData[calc.employee_id].totalPay += calc.total_pay;
    });

    const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));

    let tableHtml = `
        <h3 style="margin-top: 30px; margin-bottom: 20px;">👥 Детализация по сотрудникам:</h3>
        <table id="monthlyReportTable">
            <thead>
                <tr>
                    <th>Сотрудник</th>
                    <th>Премирование</th>
                    <th>Депремирование</th>
                    <th>К выплате (Net)</th>
                    <th>Выплачено на карту</th>
                    <th>Выплачено наличными</th>
                </tr>
            </thead>
            <tbody>`;

    for (const [id, data] of Object.entries(employeeData)) {
        const adj = adjustmentsMap.get(id) || { manual_bonus: 0, penalty: 0, paid_cash: 0, paid_card: 0 };
        tableHtml += `
            <tr data-employee-id="${id}" data-employee-name="${data.name}" data-month="${month}" data-year="${year}" data-base-pay="${data.totalPay}">
                <td>${data.name}</td>
                <td><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus}"></td>
                <td><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty}"></td>
                <td class="final-net"><strong></strong></td>
                <td class="paid-card"></td>
                <td class="paid-cash"></td>
            </tr>`;
    }

    tableHtml += `</tbody></table>`;
    document.getElementById('monthlyReportContent').innerHTML = tableHtml;

    document.querySelectorAll('.adjustment-input').forEach(input => input.addEventListener('input', handleAdjustmentInput));
    recalculateAllRows();
}

function handleAdjustmentInput(e) {
    const row = e.target.closest('tr');
    recalculateRow(row);
    clearTimeout(adjustmentDebounceTimer);
    adjustmentDebounceTimer = setTimeout(() => saveAdjustments(row), 1000);
}

function recalculateRow(row) {
    const basePay = parseFloat(row.dataset.basePay);
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]').value) || 0;
    const penalty = parseFloat(row.querySelector('[name="penalty"]').value) || 0;
    const gross = basePay + manualBonus - penalty;
    const net = gross * 0.77; 

    let paidCard = 0, paidCash = 0;
    if (net > 0) {
        if (net >= CARD_PAYMENT_AMOUNT) {
            paidCard = CARD_PAYMENT_AMOUNT;
            paidCash = net - CARD_PAYMENT_AMOUNT;
        } else {
            paidCard = net;
            paidCash = 0;
        }
    }
    
    row.querySelector('.final-net strong').textContent = formatNumber(net);
    row.querySelector('.paid-card').textContent = formatNumber(paidCard);
    row.querySelector('.paid-cash').textContent = formatNumber(paidCash);
}

function recalculateAllRows() {
    document.querySelectorAll('#monthlyReportTable tbody tr').forEach(recalculateRow);
}

async function saveAdjustments(row) {
    const payload = {
        employee_id: row.dataset.employeeId,
        month: row.dataset.month,
        year: row.dataset.year,
        manual_bonus: parseFloat(row.querySelector('[name="manual_bonus"]').value) || 0,
        penalty: parseFloat(row.querySelector('[name="penalty"]').value) || 0,
        paid_card: parseFloat(row.querySelector('.paid-card').textContent.replace(/\s/g, '').replace(',', '.')) || 0,
        paid_cash: parseFloat(row.querySelector('.paid-cash').textContent.replace(/\s/g, '').replace(',', '.')) || 0
    };
    
    const inputField = row.querySelector('[name="manual_bonus"]');
    inputField.style.border = '1px solid orange';

    try {
        const response = await fetch(`${API_BASE}/payroll/adjustments`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload),
            credentials: 'include'
        });
        if (response.status === 401 || response.status === 403) throw new Error('Auth');
        inputField.style.border = '1px solid green';
    } catch (error) {
         if(error.message === 'Auth') {
            alert('Ошибка авторизации. Пожалуйста, войдите в систему заново.');
            window.location.href = '/index.html';
        }
        inputField.style.border = '1px solid red';
    } finally {
        setTimeout(() => { inputField.style.border = '1px solid #ccc'; }, 1500);
    }
}

// --- БЛОК ДЛЯ КОМПАКТНОЙ ПЕЧАТИ ---
function printAllPayslips() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        showStatus('reportStatus', 'Нет данных для печати', 'error');
        return;
    }

    const month = tableRows[0].dataset.month;
    const year = tableRows[0].dataset.year;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    let allPayslipsHTML = '';

    tableRows.forEach(row => {
        const employeeName = row.dataset.employeeName;
        const basePay = parseFloat(row.dataset.basePay);
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]').value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]').value) || 0;
        const paidCash = parseFloat(row.querySelector('.paid-cash').textContent.replace(/\s/g, '').replace(',', '.'));
        const paidCard = parseFloat(row.querySelector('.paid-card').textContent.replace(/\s/g, '').replace(',', '.'));
        const gross = basePay + manualBonus - penalty;
        const tax = gross * 0.23;
        const net = gross - tax;

        allPayslipsHTML += `
            <div class="payslip-compact">
                <h3>Расчетный лист</h3>
                <p><strong>Сотрудник:</strong> ${employeeName}</p>
                <p><strong>Период:</strong> ${monthNames[month - 1]} ${year}</p>
                <table>
                    <tr><td>Начислено (авто):</td><td align="right">${formatNumber(basePay)} грн</td></tr>
                    <tr><td>Премирование:</td><td align="right">${formatNumber(manualBonus)} грн</td></tr>
                    <tr><td>Депремирование:</td><td align="right">-${formatNumber(penalty)} грн</td></tr>
                    <tr><td><strong>Итого начислено:</strong></td><td align="right"><strong>${formatNumber(gross)} грн</strong></td></tr>
                    <tr><td>Удержан налог (23%):</td><td align="right">-${formatNumber(tax)} грн</td></tr>
                    <tr><td><strong>К выплате:</strong></td><td align="right"><strong>${formatNumber(net)} грн</strong></td></tr>
                </table>
                <table>
                    <tr><td>Выплачено на карту:</td><td align="right">${formatNumber(paidCard)} грн</td></tr>
                    <tr><td>Выплачено наличными:</td><td align="right">${formatNumber(paidCash)} грн</td></tr>
                </table>
                <p style="margin-top: 15px;">Подпись: _________________________</p>
            </div>
        `;
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Расчетные ведомости за ${monthNames[month - 1]} ${year}</title>
                <style>
                    body { font-family: Arial, sans-serif; }
                    .payslip-compact {
                        font-size: 9pt; padding-bottom: 10mm; margin-bottom: 10mm;
                        border-bottom: 2px dashed #999; page-break-inside: avoid;
                    }
                    .payslip-compact:last-child { border-bottom: none; }
                    .payslip-compact h3 { text-align: center; font-size: 12pt; margin-bottom: 10px; }
                    .payslip-compact table { width: 100%; border-collapse: collapse; margin: 5px 0; }
                    .payslip-compact td { padding: 2px 0; }
                    @page { size: A4; margin: 15mm; }
                </style>
            </head>
            <body>
                <div id="print-area">${allPayslipsHTML}</div>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}
}
