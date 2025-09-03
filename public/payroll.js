// API URL Configuration
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://shifts-api.fly.dev';

// --- Глобальная переменная для кэширования данных отчета ФОТ ---
let fotReportDataCache = [];

// --- КОНСТАНТЫ (остаются для отображения, но основная логика на сервере) ---
const FIXED_CARD_PAYMENT = 8600;
const ADVANCE_PERCENTAGE = 0.9;
const MAX_ADVANCE = FIXED_CARD_PAYMENT * ADVANCE_PERCENTAGE;
const ADVANCE_PERIOD_DAYS = 15;
const ASSUMED_WORK_DAYS_IN_FIRST_HALF = 12;

// --- Функция прокрутки наверх ---
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Показать/скрыть кнопку вверх при прокрутке ---
window.onscroll = function() {
    const btn = document.getElementById("back-to-top-btn");
    if (btn) {
        if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
            btn.style.display = "block";
        } else {
            btn.style.display = "none";
        }
    }
};

// --- БЛОК АВТОРИЗАЦИИ И ИНИЦИАЛИЗАЦИИ ---
document.addEventListener('DOMContentLoaded', async function() {
    
    async function verifyAuthentication() {
        try {
            const response = await fetch(`${API_BASE}/check-auth`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) {
                window.location.href = '/index.html';
                return;
            }
            
            const data = await response.json();
            
           // Находим кнопки
const fotTabButton = document.getElementById('fot-tab-button');
const clearDataButton = document.querySelector('button.danger[onclick="clearDatabase()"]');

// Проверяем, существует ли кнопка очистки, чтобы избежать ошибок
if (clearDataButton) {
    // Проверяем роль пользователя
    if (data.success && data.user.role === 'admin') {
        // Показываем элементы для админа
        if (fotTabButton) fotTabButton.style.display = 'block';
        clearDataButton.parentElement.style.display = 'block';
    } else {
        // Скрываем элементы от других ролей (например, бухгалтера)
        if (fotTabButton) fotTabButton.style.display = 'none'; // Также скроем ФОТ для не-админов
        clearDataButton.parentElement.style.display = 'none';
    }
}

            initializePage();

        } catch (error) {
            console.error('Ошибка проверки аутентификации:', error);
            window.location.href = '/index.html';
        }
    }

    function initializePage() {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Заполняем даты и месяцы на всех вкладках
        const monthSelects = [
            document.getElementById('reportMonth'),
            document.getElementById('fotReportMonth')
        ];
        const yearInputs = [
            document.getElementById('reportYear'),
            document.getElementById('fotReportYear')
        ];
        const endDateInputs = [
            document.getElementById('reportEndDate'),
            document.getElementById('fotReportEndDate')
        ];
        
        const revenueDateEl = document.getElementById('revenueDate');
        if (revenueDateEl) revenueDateEl.value = todayStr;

        const payrollDateEl = document.getElementById('payrollDate');
        if (payrollDateEl) payrollDateEl.value = todayStr;

        monthSelects.forEach(select => {
            if (select) {
                if (select.id === 'fotReportMonth') {
                    const reportMonthEl = document.getElementById('reportMonth');
                    if (reportMonthEl) select.innerHTML = reportMonthEl.innerHTML;
                }
                select.value = today.getMonth() + 1;
            }
        });
        yearInputs.forEach(input => { if (input) input.value = today.getFullYear(); });
        endDateInputs.forEach(input => { if (input) input.value = todayStr; });

        function updateEndDateDefault() {
            const controlPanel = this.closest('.control-panel');
            if (!controlPanel) return;

            const yearInput = controlPanel.querySelector('input[type="number"]');
            const monthSelect = controlPanel.querySelector('select');
            const endDateInput = controlPanel.querySelector('input[type="date"]');
            
            if (!yearInput || !monthSelect || !endDateInput) {
                console.error("Не удалось найти элементы управления датой в панели", controlPanel);
                return;
            }

            const year = yearInput.value;
            const month = monthSelect.value;
            
            if (!year || !month) return;

            const lastDay = new Date(year, month, 0).getDate();
            const lastDayOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            
            if (new Date() < new Date(year, month - 1, lastDay)) {
                 endDateInput.value = todayStr;
            } else {
                 endDateInput.value = lastDayOfMonthStr;
            }
        }
        
        monthSelects.forEach(s => {
            if(s) s.addEventListener('change', updateEndDateDefault)
        });
        yearInputs.forEach(i => {
            if(i) i.addEventListener('change', updateEndDateDefault)
        });
        
        // Привязываем события к кнопкам
        const uploadBtn = document.getElementById('uploadRevenueBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', uploadRevenueFile);
        }
    }

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
    if (!statusEl) return;
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
    statusEl.style.display = 'flex';
}
function hideStatus(elementId) {
    const statusEl = document.getElementById(elementId);
    if (statusEl) statusEl.style.display = 'none';
}

// --- ФУНКЦИИ ЭКСПОРТА В EXCEL ---
function applyExcelFormatting(ws) {
    const borderStyle = { style: 'thin', color: { auto: 1 } };
    const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };
    const headerFont = { bold: true };
    
    const range = XLSX.utils.decode_range(ws['!ref']);
    const colWidths = [];

    for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = 0;
        for (let R = range.s.r; R <= range.e.r; ++R) {
            const cell_address = { c: C, r: R };
            const cell_ref = XLSX.utils.encode_cell(cell_address);
            if (ws[cell_ref]) {
                const cell = ws[cell_ref];
                const cellContent = cell.v ? String(cell.v) : '';
                maxWidth = Math.max(maxWidth, cellContent.length);
                cell.s = { ...cell.s, border: borders };
                if (R === 0) {
                    cell.s = { ...cell.s, font: headerFont };
                }
            }
        }
        colWidths[C] = { wch: maxWidth + 2 };
    }
    ws['!cols'] = colWidths;
}

function exportToExcelWithFormatting(tableId, statusId, fileName) {
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
    const ws = XLSX.utils.table_to_sheet(tableClone);
    applyExcelFormatting(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Отчет");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function exportRevenueToExcel() {
    const dateEl = document.getElementById('revenueDate');
    const date = dateEl ? dateEl.value : 'unknown_date';
    exportToExcelWithFormatting('revenueTable', 'revenueStatus', `Выручка_${date}`);
}

function exportDailyPayrollToExcel() {
    const dateEl = document.getElementById('payrollDate');
    const date = dateEl ? dateEl.value : 'unknown_date';
    exportToExcelWithFormatting('payrollTable', 'payrollStatus', `Расчет_за_день_${date}`);
}

function exportMonthlyReportToExcel() {
    const monthEl = document.getElementById('reportMonth');
    const yearEl = document.getElementById('reportYear');
    const month = monthEl ? monthEl.value : 'M';
    const year = yearEl ? yearEl.value : 'Y';
    exportToExcelWithFormatting('monthlyReportTable', 'reportStatus', `Отчет_за_месяц_${month}_${year}`);
}

function exportFotReportToExcel() {
    const monthEl = document.getElementById('fotReportMonth');
    const yearEl = document.getElementById('fotReportYear');
    const month = monthEl ? monthEl.value : 'M';
    const year = yearEl ? yearEl.value : 'Y';
    const fileName = `Отчет_ФОТ_${month}_${year}`;

    const table = document.getElementById('fotTable');
    if (!table || table.rows.length === 0 || fotReportDataCache.length === 0) {
        showStatus('fotReportStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    // --- Лист 1: Основной отчет (сводный) ---
    const mainReportSheet = [];
    const tableHeaders = [];
    table.querySelectorAll('thead th').forEach(th => tableHeaders.push(th.textContent));
    mainReportSheet.push(tableHeaders);

    fotReportDataCache.forEach(data => {
        mainReportSheet.push([
            data.employee_name,
            data.work_date,
            data.store_id || 'N/A',
            Number(data.daily_store_revenue),
            Number(data.payout),
            Number(data.tax_22),
            Number(data.payout_with_tax),
            Number(data.fot_personal_pct)
        ]);
    });
    
    // Добавляем итоговые данные в конец первого листа
    mainReportSheet.push([]); // Пустая строка для разделения
    mainReportSheet.push(['Итоговые данные']);
    mainReportSheet.push(['Общая выручка:', document.getElementById('fotTotalRevenue')?.textContent || '0.00 грн']);
    mainReportSheet.push(['Общий ФОТ (выплаты + 22%):', document.getElementById('fotTotalFund')?.textContent || '0.00 грн']);
    mainReportSheet.push(['Итоговый ФОТ % от выручки:', document.getElementById('fotPercentage')?.textContent || '0.00 %']);

    const ws_report = XLSX.utils.aoa_to_sheet(mainReportSheet);

    // --- Лист 2: Проверка расчетов (Детализация по начислениям) ---
    // Этот лист теперь будет содержать детальную разбивку данных, которые были использованы для отчета.
    const checkDataHeaders = ["Сотрудник", "Дата работы", "ID Магазина", "ЗП начислено", "Налог (22%)", "Итого (ЗП + Налог)"];
    const checkData = [checkDataHeaders];
    fotReportDataCache.forEach(emp => {
        checkData.push([
            emp.employee_name,
            emp.work_date,
            emp.store_id || 'N/A',
            Number(emp.payout),
            Number(emp.tax_22),
            Number(emp.payout_with_tax)
        ]);
    });
    const ws_check = XLSX.utils.aoa_to_sheet(checkData);

    // --- Создание книги и применение форматирования ---
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws_report, "Отчет ФОТ");
    XLSX.utils.book_append_sheet(wb, ws_check, "Проверка расчетов");

    applyExcelFormatting(ws_report);
    applyExcelFormatting(ws_check);

    XLSX.writeFile(wb, `${fileName}.xlsx`);
}


async function uploadRevenueFile() {
    const fileInput = document.getElementById('revenueFile');
    const dateInput = document.getElementById('revenueDate');
    if (!fileInput || !dateInput) return;

    const file = fileInput.files[0];
    const date = dateInput.value;

    if (!file || !date) {
        showStatus('revenueStatus', 'Пожалуйста, выберите файл и укажите дату.', 'error');
        return;
    }

    // --- ОБНОВЛЕННАЯ ПРОВЕРКА ИМЕНИ ФАЙЛА ---
    const fileName = file.name;
    const dateMatch = fileName.match(/(\d{2})\.(\d{2})\.(\d{4}|\d{2})/);

    if (dateMatch) {
        let [, day, month, year] = dateMatch;
        
        if (year.length === 2) {
            year = "20" + year;
        }
        
        const dateFromFile = `${year}-${month}-${day}`;
        const selectedDate = new Date(date);
        const fileDate = new Date(dateFromFile);
        const dayDiff = Math.round((selectedDate - fileDate) / (1000 * 60 * 60 * 24));
        
        // Проверяем, что дата загрузки = дата из файла + 1 день
        if (dayDiff !== 1) {
            const userConfirmation = confirm(
                `ВНИМАНИЕ!\n\n` +
                `Файл содержит кассу за ${dateFromFile}\n` +
                `Обычно она загружается на следующий день (${new Date(fileDate.getTime() + 86400000).toISOString().split('T')[0]})\n` +
                `Но вы выбрали дату ${date}\n\n` +
                `Продолжить загрузку?`
            );
            if (!userConfirmation) {
                showStatus('revenueStatus', 'Загрузка отменена пользователем.', 'info');
                return;
            }
        }
    }
    // --- КОНЕЦ ОБНОВЛЕННОЙ ПРОВЕРКИ ---

    showStatus('revenueStatus', 'Загрузка и обработка файла...', 'info');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', date);

    try {
        const response = await fetch(`${API_BASE}/upload-revenue-file`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        const result = await response.json();

        if (result.success) {
            // Обновленное сообщение с двумя датами
            const message = result.revenueDate && result.uploadDate 
                ? `Выручка за ${result.revenueDate} успешно загружена (дата обработки: ${result.uploadDate})`
                : result.message;
            showStatus('revenueStatus', message, 'success');
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
    const revenuePreviewEl = document.getElementById('revenuePreview');
    const tbody = document.getElementById('revenueTableBody');

    if (!revenuePreviewEl || !tbody) return;

    revenuePreviewEl.style.display = 'block';
    tbody.innerHTML = '';
    let counter = 1;
    let tableHtml = '';
    revenues.forEach(item => {
        const isMatched = matched.includes(item.store_address);
        tableHtml += `
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
    
    // Добавляем строку с итогом
    tableHtml += `
        <tr class="summary-row" style="font-weight: bold; background-color: #f8f9fa;">
            <td colspan="2" style="text-align: right;">Итого загружено:</td>
            <td>${formatNumber(totalRevenue)} грн</td>
            <td></td>
        </tr>
    `;

    tbody.innerHTML = tableHtml;

    if (unmatched.length > 0) {
        showStatus('revenueStatus', `Внимание: ${unmatched.length} торговых точек не найдены в базе: ${unmatched.join(', ')}`, 'warning');
    }
}

function cancelRevenueUpload() {
    const revenuePreviewEl = document.getElementById('revenuePreview');
    const revenueFileEl = document.getElementById('revenueFile');

    if (revenuePreviewEl) revenuePreviewEl.style.display = 'none';
    if (revenueFileEl) revenueFileEl.value = '';
    hideStatus('revenueStatus');
}


// --- УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ FETCH-ЗАПРОСОВ (ИСПРАВЛЕННАЯ ВЕРСИЯ) ---
async function fetchData(url, options, statusId) {
    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            let errorText = `Ошибка HTTP: ${response.status}`;
            
            // Клонируем response чтобы можно было прочитать тело несколько раз
            const responseClone = response.clone();
            
            try {
                // Пытаемся прочитать тело ответа как JSON
                const errorResult = await responseClone.json();
                errorText = errorResult.error || errorResult.message || JSON.stringify(errorResult);
            } catch (e) {
                // Если тело не JSON, пытаемся прочитать как текст
                try {
                    const textError = await response.text();
                    // Если это HTML страница 404, извлечем только важную информацию
                    if (textError.includes('<!DOCTYPE') || textError.includes('<html')) {
                        errorText = `Ошибка ${response.status}: Эндпоинт не найден`;
                    } else {
                        errorText = textError || errorText;
                    }
                } catch (textError) {
                    // Если и текст не читается, используем стандартное сообщение
                    errorText = `Ошибка HTTP: ${response.status} - ${response.statusText}`;
                }
            }
            throw new Error(errorText);
        }
        
        return await response.json();

    } catch (error) {
        console.error(`Ошибка при запросе к ${url}:`, error);
        showStatus(statusId, `Ошибка: ${error.message}`, 'error');
        throw error; // Пробрасываем ошибку дальше, чтобы остановить выполнение
    }
}


// --- ВКЛАДКА "РАСЧЕТ ЗАРПЛАТЫ" ---
async function calculatePayroll() {
    const dateInput = document.getElementById('payrollDate');
    if (!dateInput) return;
    const date = dateInput.value;

    if (!date) {
        showStatus('payrollStatus', 'Пожалуйста, выберите дату для расчета.', 'error');
        return;
    }
    showStatus('payrollStatus', 'Выполняется расчет...', 'info');
    
    const loader = document.getElementById('loader');
    const payrollTable = document.getElementById('payrollTable');
    const payrollSummary = document.getElementById('payrollSummary');
    
    if (loader) loader.style.display = 'block';
    if (payrollTable) payrollTable.style.display = 'none';
    if (payrollSummary) payrollSummary.style.display = 'none';

    try {
        const result = await fetchData(
            `${API_BASE}/calculate-payroll`, 
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ date: date })
            },
            'payrollStatus'
        );

        if (result.success) {
            hideStatus('payrollStatus');
            displayPayrollResults(result.calculations, result.summary);
        }
    } catch (error) {
        // Ошибка уже отображена в fetchData
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function displayPayrollResults(calculations, summary) {
    const tbody = document.getElementById('payrollTableBody');
    const payrollTable = document.getElementById('payrollTable');
    const payrollSummary = document.getElementById('payrollSummary');

    if (!tbody || !payrollTable || !payrollSummary) return;

    tbody.innerHTML = '';
    if (calculations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Нет данных за выбранную дату.</td></tr>';
        payrollTable.style.display = 'table';
        payrollSummary.style.display = 'none';
        return;
    }

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
    payrollTable.style.display = 'table';
    updatePayrollSummary(summary.total_payroll, calculations.length);
}

function updatePayrollSummary(totalPayroll, employeeCount) {
    const totalEmployeesEl = document.getElementById('totalEmployees');
    if (totalEmployeesEl) totalEmployeesEl.textContent = employeeCount;

    const totalPayrollEl = document.getElementById('totalPayroll');
    if (totalPayrollEl) totalPayrollEl.textContent = formatNumber(totalPayroll);

    const payrollSummaryEl = document.getElementById('payrollSummary');
    if (payrollSummaryEl) payrollSummaryEl.style.display = 'block';
}

// --- ВКЛАДКА "ОТЧЕТ ЗА МЕСЯЦ" ---
let adjustmentDebounceTimer;

async function generateMonthlyReport() {
    const monthEl = document.getElementById('reportMonth');
    const yearEl = document.getElementById('reportYear');
    const endDateEl = document.getElementById('reportEndDate');
    const reportContentEl = document.getElementById('monthlyReportContent');

    if (!monthEl || !yearEl || !endDateEl || !reportContentEl) return;
    
    const month = monthEl.value;
    const year = yearEl.value;
    const reportEndDate = endDateEl.value;

    if (!month || !year || !reportEndDate) {
        showStatus('reportStatus', 'Пожалуйста, выберите месяц, год и конечную дату.', 'error');
        return;
    }
    showStatus('reportStatus', 'Формирование отчета...', 'info');
    reportContentEl.style.display = 'none';

    try {
        const result = await fetchData(
            `${API_BASE}/get-monthly-data`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ year, month, reportEndDate })
            },
            'reportStatus'
        );
        
        if (result.success) {
            hideStatus('reportStatus');
            reportContentEl.style.display = 'block';
            displayMonthlyReport(result.dailyData, result.adjustments, month, year);
        }
    } catch (error) {
        // Ошибка уже отображена
    }
}


function displayMonthlyReport(dailyData, adjustments, month, year) {
    const reportContentEl = document.getElementById('monthlyReportContent');
    if (!reportContentEl) return;

    const employeeData = {};
    dailyData.forEach(calc => {
        if (!employeeData[calc.employee_id]) {
            employeeData[calc.employee_id] = { 
                name: calc.employee_name, 
                totalPay: 0, 
                shifts: [], 
                stores: {},
                primaryStore: calc.store_address || 'Не определен' 
            };
        }
        employeeData[calc.employee_id].totalPay += calc.total_pay;
        employeeData[calc.employee_id].shifts.push(new Date(calc.work_date).getDate());
        const store = calc.store_address || 'Старший продавец';
        employeeData[calc.employee_id].stores[store] = (employeeData[calc.employee_id].stores[store] || 0) + 1;
    });
    
    // Определяем основной магазин для каждого сотрудника
    for (const [id, data] of Object.entries(employeeData)) {
        if (Object.keys(data.stores).length > 0) {
            data.primaryStore = Object.keys(data.stores).reduce((a, b) => data.stores[a] > data.stores[b] ? a : b);
        }
    }
    
    const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));
    
    // Сортируем сотрудников по магазину и имени
    const sortedEmployees = Object.entries(employeeData).sort((a, b) => {
        const storeCompare = a[1].primaryStore.localeCompare(b[1].primaryStore);
        if (storeCompare !== 0) return storeCompare;
        return a[1].name.localeCompare(b[1].name);
    });
    
    let tableHtml = `
        <h3 style="margin-top: 30px; margin-bottom: 20px;">👥 Детализация по сотрудникам:</h3>
        <div class="table-container">
        <table id="monthlyReportTable" style="font-size: 11px; white-space: nowrap;">
            <thead>
                <tr>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Сотрудник</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Магазин</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Всего начислено</th>
                    <th colspan="2" style="padding: 8px 5px;">Премирование</th>
                    <th colspan="2" style="padding: 8px 5px;">Депремирование</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Вычет за недостачу</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Аванс (на карту)</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Остаток (на карту)</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Зарплата (наличными)</th>
                    <th rowspan="2" style="vertical-align: middle; padding: 8px 5px;">Итого к выплате</th>
                </tr>
                <tr><th style="padding: 8px 5px;">Сумма</th><th style="padding: 8px 5px;">Причина</th><th style="padding: 8px 5px;">Сумма</th><th style="padding: 8px 5px;">Причина</th></tr>
            </thead>
            <tbody>`;
    
    if (sortedEmployees.length === 0) {
        tableHtml += '<tr><td colspan="12" style="text-align: center; padding: 20px;">Нет данных для отображения за выбранный период.</td></tr>';
    } else {
        for (const [id, data] of sortedEmployees) {
            const adj = adjustmentsMap.get(id) || { manual_bonus: 0, penalty: 0, shortage: 0, bonus_reason: '', penalty_reason: '' };
            const totalToPay = data.totalPay + (adj.manual_bonus || 0) - (adj.penalty || 0) - (adj.shortage || 0);
            tableHtml += `<tr data-employee-id="${id}" data-employee-name="${data.name}" data-store-address="${data.primaryStore}" data-month="${month}" data-year="${year}" data-base-pay="${data.totalPay}" data-shifts='${JSON.stringify(data.shifts)}'>
                            <td style="padding: 5px;">${data.name}</td>
                            <td style="padding: 5px; font-size: 10px;">${data.primaryStore}</td>
                            <td class="total-gross" style="padding: 5px;">${formatNumber(data.totalPay + (adj.manual_bonus || 0))}</td>
                            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus || 0}" style="width: 70px;"></td>
                            <td style="padding: 5px;"><input type="text" class="adjustment-input" name="bonus_reason" value="${adj.bonus_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
                            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty || 0}" style="width: 70px;"></td>
                            <td style="padding: 5px;"><input type="text" class="adjustment-input" name="penalty_reason" value="${adj.penalty_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
                            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="shortage" value="${adj.shortage || 0}" style="width: 70px;"></td>
                            <td class="advance-payment" style="padding: 5px;">0,00</td>
                            <td class="card-remainder" style="padding: 5px;">0,00</td>
                            <td class="cash-payout" style="padding: 5px;"><strong>0,00</strong></td>
                            <td class="total-payout" style="padding: 5px;"><strong>${formatNumber(totalToPay)}</strong></td>
                        </tr>`;
        }
    }
    tableHtml += `</tbody></table></div>`;
    reportContentEl.innerHTML = tableHtml;
    document.querySelectorAll('.adjustment-input').forEach(input => input.addEventListener('input', handleAdjustmentInput));
    if (sortedEmployees.length > 0) {
        calculateAdvance15(true);
    }
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
    if (!row) return;
    const basePay = parseFloat(row.dataset.basePay) || 0;
    
    const manualBonusInput = row.querySelector('[name="manual_bonus"]');
    const manualBonus = manualBonusInput ? (parseFloat(manualBonusInput.value) || 0) : 0;
    
    const penaltyInput = row.querySelector('[name="penalty"]');
    const penalty = penaltyInput ? (parseFloat(penaltyInput.value) || 0) : 0;

    const shortageInput = row.querySelector('[name="shortage"]');
    const shortage = shortageInput ? (parseFloat(shortageInput.value) || 0) : 0;

    const totalGross = basePay + manualBonus;
    const totalToPay = totalGross - penalty - shortage;
    
    const totalGrossCell = row.querySelector('.total-gross');
    if (totalGrossCell) {
        totalGrossCell.textContent = formatNumber(totalGross);
    }

    const totalPayoutCell = row.querySelector('.total-payout strong');
    if (totalPayoutCell) {
        totalPayoutCell.textContent = formatNumber(totalToPay);
    }
}

async function saveAdjustments(row) {
    if (!row) return;
    const payload = {
        employee_id: row.dataset.employeeId,
        month: row.dataset.month,
        year: row.dataset.year,
        manual_bonus: parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0,
        penalty: parseFloat(row.querySelector('[name="penalty"]')?.value) || 0,
        shortage: parseFloat(row.querySelector('[name="shortage"]')?.value) || 0,
        bonus_reason: row.querySelector('[name="bonus_reason"]')?.value || '',
        penalty_reason: row.querySelector('[name="penalty_reason"]')?.value || ''
    };
    try {
        await fetchData(
            `${API_BASE}/payroll/adjustments`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            },
            'reportStatus'
        );
        // Можно добавить индикатор сохранения, но пока просто отправляем
    } catch (error) {
        // Ошибка уже обработана и показана пользователю
    }
}


async function calculateAdvance15(silent = false) {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        if (!silent) showStatus('reportStatus', 'Сначала сформируйте отчет за месяц', 'error');
        return;
    }
    if (!silent) showStatus('reportStatus', 'Рассчитываем аванс...', 'info');

    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    const advanceEndDate = document.getElementById('reportEndDate')?.value;
    if (!year || !month || !advanceEndDate) return;

    try {
        const data = await fetchData(
            `${API_BASE}/calculate-advance`, 
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ year, month, advanceEndDate })
            },
            'reportStatus'
        );
        
        if (data.success) {
            tableRows.forEach(row => {
                const employeeId = row.dataset.employeeId;
                const result = data.results[employeeId];
                const advanceCell = row.querySelector('.advance-payment');
                if (advanceCell) {
                    advanceCell.textContent = result ? formatNumber(result.advance_payment) : formatNumber(0);
                }
            });

            if (!silent) showStatus('reportStatus', 'Аванс успешно рассчитан и отображен.', 'success');
        }
    } catch (error) {
        // Ошибка уже отображена
    }
}

async function calculateFinalPayroll() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        showStatus('reportStatus', 'Сначала сформируйте отчет за месяц', 'error');
        return;
    }
    showStatus('reportStatus', 'Выполняем окончательный расчет...', 'info');

    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    const reportEndDate = document.getElementById('reportEndDate')?.value;
    if (!year || !month || !reportEndDate) return;

    try {
        const savePromises = [];
        tableRows.forEach(row => savePromises.push(saveAdjustments(row)));
        await Promise.all(savePromises);

        const data = await fetchData(
            `${API_BASE}/calculate-final-payroll`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ year, month, reportEndDate })
            },
            'reportStatus'
        );

        if (data.success) {
            tableRows.forEach(row => {
                const employeeId = row.dataset.employeeId;
                const result = data.results[employeeId];
                if (result) {
                    const totalGrossCell = row.querySelector('.total-gross');
                    if (totalGrossCell) totalGrossCell.textContent = formatNumber(result.total_gross);

                    const advanceCell = row.querySelector('.advance-payment');
                    if (advanceCell) advanceCell.textContent = formatNumber(result.advance_payment);

                    const remainderCell = row.querySelector('.card-remainder');
                    if (remainderCell) remainderCell.textContent = formatNumber(result.card_remainder);
                    
                    const cashCell = row.querySelector('.cash-payout strong');
                    if (cashCell) cashCell.textContent = formatNumber(result.cash_payout);

                    const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
                    const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
                    const totalToPay = result.total_gross - penalty - shortage;
                    const totalPayoutCell = row.querySelector('.total-payout strong');
                    if (totalPayoutCell) {
                        totalPayoutCell.textContent = formatNumber(totalToPay);
                    }
                }
            });
            showStatus('reportStatus', 'Окончательный расчет выполнен.', 'success');
        }
    } catch (error) {
       // Ошибка уже отображена
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
        const cashText = row.querySelector('.cash-payout strong')?.textContent;
        const cashAmount = cashText ? parseFloat(cashText.replace(/\s/g, '').replace(',', '.')) || 0 : 0;
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
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        const bonus_reason = row.querySelector('[name="bonus_reason"]')?.value || '-';
        const penalty_reason = row.querySelector('[name="penalty_reason"]')?.value || '-';
        const totalGross = basePay + manualBonus;
        const advanceAmount = parseFloat(row.querySelector('.advance-payment')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cardRemainderAmount = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cashAmount = parseFloat(row.querySelector('.cash-payout strong')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
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

async function generateFotReport() {
    const monthEl = document.getElementById('fotReportMonth');
    const yearEl = document.getElementById('fotReportYear');
    const endDateEl = document.getElementById('fotReportEndDate');
    const loader = document.getElementById('fotLoader');
    const contentEl = document.getElementById('fotReportContent');

    if (!monthEl || !yearEl || !endDateEl || !loader || !contentEl) return;

    const month = monthEl.value;
    const year = yearEl.value;
    const reportEndDate = endDateEl.value;

    if (!month || !year || !reportEndDate) {
        showStatus('fotReportStatus', 'Пожалуйста, выберите все параметры.', 'error');
        return;
    }
    showStatus('fotReportStatus', 'Формирование отчета ФОТ...', 'info');
    loader.style.display = 'block';
    contentEl.style.display = 'none';
    document.getElementById('fotByStorePanel').style.display = 'none';

    try {
        const result = await fetchData(
            `${API_BASE}/get-fot-report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ year, month, reportEndDate })
            },
            'fotReportStatus'
        );

        if (result.success) {
            hideStatus('fotReportStatus');
            contentEl.style.display = 'block';
            
            fotReportDataCache = result.rows; // Теперь сервер возвращает 'rows'
            const reportData = result.rows;

            const tbody = document.getElementById('fotTableBody');
            tbody.innerHTML = '';
            
            if (reportData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Нет данных для расчета за выбранный период.</td></tr>';
                // Скрываем итоговые панели
                document.querySelector('.summary-panel').style.display = 'none';
                document.getElementById('fotByStorePanel').style.display = 'none';
                return;
            } else {
                 document.querySelector('.summary-panel').style.display = 'block';
            }

            // --- НОВЫЙ БЛОК: НАКОПИТЕЛЬНЫЙ РАСЧЕТ И ГРУППИРОВКА ---
            const fotByStore = {};
            let totalRevenue = 0;
            let totalFotFund = 0;

            // Накапливаем данные по магазинам и общие итоги
            reportData.forEach(item => {
                const store = item.store_address || 'Не присвоено';
                if (!fotByStore[store]) {
                    fotByStore[store] = { revenue: 0, fot: 0 };
                }
                fotByStore[store].revenue += item.daily_store_revenue;
                fotByStore[store].fot += item.payout_with_tax;
                
                totalRevenue += item.daily_store_revenue;
                totalFotFund += item.payout_with_tax;
            });

            // Сортируем магазины по алфавиту
            const sortedStores = Object.keys(fotByStore).sort((a, b) => a.localeCompare(b));

            // Отображаем детальную таблицу по сотрудникам
            reportData.sort((a,b) => a.employee_name.localeCompare(b.employee_name)).forEach(data => {
                const row = `
                    <tr>
                        <td>${data.employee_name}</td>
                        <td>${data.work_date}</td>
                        <td>${data.store_address || 'N/A'}</td>
                        <td>${formatNumber(data.daily_store_revenue)} грн</td>
                        <td>${formatNumber(data.payout)} грн</td>
                        <td>${formatNumber(data.tax_22)} грн</td>
                        <td><strong>${formatNumber(data.payout_with_tax)} грн</strong></td>
                        <td>${formatNumber(data.fot_personal_pct || 0)} %</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            });
            
            // Отображаем таблицу ФОТ по магазинам
            const fotByStorePanel = document.getElementById('fotByStorePanel');
            const fotByStoreBody = document.getElementById('fotByStoreTableBody');
            fotByStoreBody.innerHTML = '';

            if (sortedStores.length > 0) {
                fotByStorePanel.style.display = 'block';
                for (const storeName of sortedStores) {
                    const data = fotByStore[storeName];
                    const percentage = data.revenue > 0 ? (data.fot / data.revenue) * 100 : 0;
                    const row = `
                        <tr>
                            <td>${storeName}</td>
                            <td>${formatNumber(data.revenue)} грн</td>
                            <td>${formatNumber(data.fot)} грн</td>
                            <td><strong>${formatNumber(percentage)} %</strong></td>
                        </tr>
                    `;
                    fotByStoreBody.innerHTML += row;
                }
            }
            
            // Заполняем итоговую панель (общую)
            const totalFotPercentage = totalRevenue > 0 ? (totalFotFund / totalRevenue) * 100 : 0;
            document.getElementById('fotTotalRevenue').textContent = `${formatNumber(totalRevenue)} грн`;
            document.getElementById('fotTotalFund').textContent = `${formatNumber(totalFotFund)} грн`;
            document.getElementById('fotPercentage').textContent = `${formatNumber(totalFotPercentage)} %`;
            // --- КОНЕЦ НОВОГО БЛОКА ---
        }
    } catch (error) {
        // Ошибка уже отображена
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

async function clearDatabase() {
  // Первое подтверждение
  const firstConfirm = confirm("ВНИМАНИЕ!\nВы собираетесь удалить все данные о сменах, расчетах зарплаты и выручке. Эта операция необратима.\n\nВы уверены, что хотите продолжить?");

  if (!firstConfirm) {
    showStatus('reportStatus', 'Очистка данных отменена.', 'info');
    return;
  }
  
  // Второе, контрольное подтверждение
  const secondConfirm = confirm("ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ.\nВсе операционные данные будут стерты. Справочники (сотрудники, магазины) останутся.\n\nПодтверждаете удаление?");

  if (!secondConfirm) {
    showStatus('reportStatus', 'Очистка данных отменена.', 'info');
    return;
  }

  showStatus('reportStatus', 'Выполняется очистка данных...', 'info');

  try {
    const result = await fetchData(
      `${API_BASE}/clear-transactional-data`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      },
      'reportStatus'
    );

    if (result.success) {
      showStatus('reportStatus', result.message, 'success');
      // Опционально: можно перезагрузить страницу или очистить текущие отчеты
      document.getElementById('monthlyReportContent').innerHTML = '';
    }
  } catch (error) {
    // Ошибка уже отображена в функции fetchData
  }
}
