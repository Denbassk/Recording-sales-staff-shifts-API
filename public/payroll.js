// API URL Configuration
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://shifts-api.fly.dev';

// СУММА ДЛЯ ВЫПЛАТЫ НА КАРТУ (ИЗМЕНЯЙТЕ ЭТУ СУММУ ПРИ ИНДЕКСАЦИИ)
const CARD_PAYMENT_AMOUNT = 8600;

// Установка текущей даты при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    document.getElementById('revenueDate').value = todayStr;
    document.getElementById('payrollDate').value = todayStr;
    document.getElementById('reportMonth').value = today.getMonth() + 1;
    document.getElementById('reportYear').value = today.getFullYear();
});

// Переключение вкладок
function switchTab(tabName, button) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(tabName + '-tab').classList.add('active');
}

// Загрузка и обработка файла с выручкой
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
        const response = await fetch(`${API_BASE}/upload-revenue-file`, { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            displayRevenuePreview(result.revenues, result.matched, result.unmatched);
            showStatus('revenueStatus', `Обработано записей: ${result.revenues.length}`, 'success');
        } else {
            showStatus('revenueStatus', 'Ошибка обработки файла: ' + result.error, 'error');
        }
    } catch (error) {
        showStatus('revenueStatus', 'Ошибка: ' + error.message, 'error');
    }
}

// Отображение предпросмотра загруженных данных
function displayRevenuePreview(revenues, matched, unmatched) {
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
    if (unmatched.length > 0) {
        showStatus('revenueStatus', `Внимание! ${unmatched.length} магазинов не найдено в базе данных`, 'error');
    }
}

// Отмена и подтверждение загрузки выручки
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

// Расчет зарплаты за день
async function calculatePayroll() {
    const date = document.getElementById('payrollDate').value;
    if (!date) return showStatus('payrollStatus', 'Выберите дату для расчета', 'error');

    document.getElementById('loader').style.display = 'block';
    document.getElementById('payrollTable').style.display = 'none';
    document.getElementById('payrollSummary').style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/calculate-payroll`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date })
        });
        const result = await response.json();
        document.getElementById('loader').style.display = 'none';

        if (result.success) {
            displayPayrollResults(result.calculations, result.summary);
            showStatus('payrollStatus', `Зарплата за ${new Date(date).toLocaleDateString('ru-RU')} успешно рассчитана`, 'success');
        } else {
            showStatus('payrollStatus', 'Ошибка расчета: ' + result.error, 'error');
        }
    } catch (error) {
        document.getElementById('loader').style.display = 'none';
        showStatus('payrollStatus', 'Ошибка соединения с сервером: ' + error.message, 'error');
    }
}

// Отображение результатов расчета за день
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

// --- Утилиты ---
function formatNumber(num) {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
function showStatus(elementId, message, type) {
    const statusEl = document.getElementById(elementId);
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
    statusEl.style.display = 'flex';
    if (type !== 'error') setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
}
function hideStatus(elementId) {
    document.getElementById(elementId).style.display = 'none';
}

// --- НОВЫЙ БЛОК ДЛЯ МЕСЯЧНЫХ ОТЧЕТОВ ---
let adjustmentDebounceTimer;

async function generateMonthlyReport() {
    const month = document.getElementById('reportMonth').value;
    const year = document.getElementById('reportYear').value;
    showStatus('reportStatus', 'Генерация отчета...', 'info');
    document.getElementById('monthlyReportContent').innerHTML = '<div class="loader"></div>';
    document.getElementById('monthlyReportContent').style.display = 'block';

    try {
        const daysInMonth = new Date(year, month, 0).getDate();
        const dailyPromises = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dailyPromises.push(fetch(`${API_BASE}/calculate-payroll`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date })
            }).then(res => res.json()));
        }
        
        const dailyResults = await Promise.all(dailyPromises);
        const monthData = dailyResults.flatMap(result => result.success ? result.calculations : []);

        const adjustmentsResponse = await fetch(`${API_BASE}/payroll/adjustments/${year}/${month}`);
        const adjustments = await adjustmentsResponse.json();

        if (monthData.length === 0) {
            showStatus('reportStatus', 'Нет данных за выбранный период', 'info');
            document.getElementById('monthlyReportContent').innerHTML = '';
            return;
        }

        displayMonthlyReport(monthData, adjustments, month, year);
        showStatus('reportStatus', 'Отчет успешно сформирован', 'success');

    } catch (error) {
        showStatus('reportStatus', 'Ошибка генерации отчета: ' + error.message, 'error');
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
                    <th>Сотрудник</th><th>Премия (ручная)</th><th>Штраф (ручной)</th><th>К выплате (Net)</th>
                    <th>Выплачено на карту</th><th>Выплачено наличными</th><th>Действия</th> 
                </tr>
            </thead>
            <tbody>`;

    for (const [id, data] of Object.entries(employeeData)) {
        const adj = adjustmentsMap.get(id) || { manual_bonus: 0, penalty: 0 };
        tableHtml += `
            <tr data-employee-id="${id}" data-employee-name="${data.name}" data-month="${month}" data-year="${year}" data-base-pay="${data.totalPay}">
                <td>${data.name}</td>
                <td><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus}"></td>
                <td><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty}"></td>
                <td class="final-net"><strong></strong></td>
                <td class="paid-card"></td>
                <td class="paid-cash"></td>
                <td><button class="print-btn">🖨️ Печать</button></td>
            </tr>`;
    }

    tableHtml += `</tbody></table>`;
    document.getElementById('monthlyReportContent').innerHTML = tableHtml;

    document.querySelectorAll('.adjustment-input').forEach(input => input.addEventListener('input', handleAdjustmentInput));
    recalculateAllRows();
    addPrintButtonListeners();
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
    const net = gross * 0.77; // 100% - 23% tax

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
        await fetch(`${API_BASE}/payroll/adjustments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        inputField.style.border = '1px solid green';
    } catch (error) {
        inputField.style.border = '1px solid red';
    } finally {
        setTimeout(() => { inputField.style.border = '1px solid #ccc'; }, 1500);
    }
}

// --- БЛОК ДЛЯ ПЕЧАТИ РАСЧЕТНЫХ ЛИСТОВ ---
function addPrintButtonListeners() {
    document.querySelectorAll('.print-btn').forEach(button => {
        button.addEventListener('click', (e) => printPayslip(e.target.closest('tr')));
    });
}

function printPayslip(row) {
    const employeeName = row.dataset.employeeName;
    const month = row.dataset.month;
    const year = row.dataset.year;
    const basePay = parseFloat(row.dataset.basePay);
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]').value) || 0;
    const penalty = parseFloat(row.querySelector('[name="penalty"]').value) || 0;
    const paidCash = parseFloat(row.querySelector('.paid-cash').textContent.replace(/\s/g, '').replace(',', '.'));
    const paidCard = parseFloat(row.querySelector('.paid-card').textContent.replace(/\s/g, '').replace(',', '.'));

    const gross = basePay + manualBonus - penalty;
    const tax = gross * 0.23;
    const net = gross - tax;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

    const payslipHTML = `
        <div id="payslip" style="font-family: Arial, sans-serif; width: 600px; margin: 20px; padding: 20px; border: 1px solid #ccc;">
            <h2 style="text-align: center; margin-bottom: 20px;">Расчетный лист</h2>
            <p><strong>Сотрудник:</strong> ${employeeName}</p>
            <p><strong>Период:</strong> ${monthNames[month - 1]} ${year}</p>
            <hr>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px;">Начислено (ставка + бонус)</td><td style="padding: 8px; text-align: right;">${formatNumber(basePay)} грн</td></tr>
                <tr><td style="padding: 8px;">Премия (ручная)</td><td style="padding: 8px; text-align: right;">${formatNumber(manualBonus)} грн</td></tr>
                <tr><td style="padding: 8px; color: red;">Штраф (ручной)</td><td style="padding: 8px; text-align: right; color: red;">-${formatNumber(penalty)} грн</td></tr>
                <tr style="font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000;">
                    <td style="padding: 8px;">Итого начислено (Gross)</td><td style="padding: 8px; text-align: right;">${formatNumber(gross)} грн</td>
                </tr>
                <tr><td style="padding: 8px;">Удержан налог (23%)</td><td style="padding: 8px; text-align: right;">-${formatNumber(tax)} грн</td></tr>
                <tr style="font-weight: bold; font-size: 1.1em;">
                    <td style="padding: 8px;">Сумма к выплате (Net)</td><td style="padding: 8px; text-align: right;">${formatNumber(net)} грн</td>
                </tr>
            </table>
            <hr>
            <h3 style="margin-top: 20px;">Информация о выплате:</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px;">Выплачено на карту</td><td style="padding: 8px; text-align: right;">${formatNumber(paidCard)} грн</td></tr>
                <tr><td style="padding: 8px;">Выплачено наличными</td><td style="padding: 8px; text-align: right;">${formatNumber(paidCash)} грн</td></tr>
            </table>
            <div style="margin-top: 40px;"><p>Подпись сотрудника: _________________________</p></div>
        </div>
    `;

    const oldPayslip = document.getElementById('payslip');
    if (oldPayslip) oldPayslip.remove();
    document.body.insertAdjacentHTML('beforeend', payslipHTML);
    window.print();
}
