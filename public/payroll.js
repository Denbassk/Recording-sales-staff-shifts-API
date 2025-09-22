// API URL Configuration
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://shifts-api.fly.dev';

// --- Глобальная переменная для кэширования данных отчета ФОТ ---
let fotReportDataCache = [];

// --- КОНСТАНТЫ (остаются для отображения, но основная логика на сервере) ---
const FIXED_CARD_PAYMENT = 8600;      // Лимит на карту за месяц
const ADVANCE_PERCENTAGE = 0.9;       // 90% для расчета аванса
const MAX_ADVANCE = 7900;              // Максимальный аванс (ИМЕННО 7900!)
const ADVANCE_PERIOD_DAYS = 15;       // Период для аванса
const ASSUMED_WORK_DAYS_IN_FIRST_HALF = 12;

// --- Функция прокрутки наверх ---
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Показать/скрыть кнопку вверх при прокрутке ---
window.onscroll = function () {
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
document.addEventListener('DOMContentLoaded', async function () {

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

            // Проверяем роль пользователя
  if (data.success && data.user) {
    const isAdmin = data.user.role === 'admin';
    const isAccountant = data.user.role === 'accountant';

    // ФОТ - только для админа
    if (fotTabButton) {
        fotTabButton.style.display = isAdmin ? 'block' : 'none';
    }

    // Админская секция - только для админа
    const adminSection = document.getElementById('adminSection');
    if (adminSection) {
        adminSection.style.display = isAdmin ? 'block' : 'none';
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
            if (s) s.addEventListener('change', updateEndDateDefault)
        });
        yearInputs.forEach(i => {
            if (i) i.addEventListener('change', updateEndDateDefault)
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
    // Проверяем, что это число
    if (num === null || num === undefined) return '0,00';
    
    // Преобразуем в число если это строка
    const number = typeof num === 'string' ? parseFloat(num) : num;
    
    // Проверяем что получилось число
    if (isNaN(number)) return '0,00';
    
    // Форматируем
    return number.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$& ').replace('.', ',');
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

// Эта функция больше не используется - заменена на специализированные функции экспорта
// function exportToExcelWithFormatting - deprecated

function exportRevenueToExcel() {
    const dateEl = document.getElementById('revenueDate');
    const date = dateEl ? dateEl.value : '';

    if (!date) {
        showStatus('revenueStatus', 'Сначала загрузите выручку', 'error');
        return;
    }

    const tbody = document.getElementById('revenueTableBody');
    if (!tbody || tbody.children.length === 0) {
        showStatus('revenueStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    const exportData = [];
    let totalRevenue = 0;

    Array.from(tbody.children).forEach(row => {
        if (!row.classList.contains('summary-row')) {
            const cells = row.cells;
            if (cells.length >= 4) {
                const revenue = parseFloat(cells[2].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0;
                const rowData = {
                    '№': cells[0].textContent,
                    'Дата выручки': date,
                    'Торговая точка': cells[1].textContent,
                    'Выручка': revenue,
                    'Статус': cells[3].textContent.trim()
                };
                exportData.push(rowData);
                totalRevenue += revenue;
            }
        }
    });

    if (exportData.length === 0) {
        showStatus('revenueStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    // Добавляем итоговую строку
    exportData.push({
        '№': '',
        'Дата выручки': '',
        'Торговая точка': 'ИТОГО:',
        'Выручка': totalRevenue,
        'Статус': ''
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    ws['!cols'] = [
        { wch: 5 },  // №
        { wch: 15 }, // Дата
        { wch: 30 }, // Торговая точка
        { wch: 15 }, // Выручка
        { wch: 15 }  // Статус
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Выручка");

    const fileName = `Выручка_${date}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function exportDailyPayrollToExcel() {
    const dateEl = document.getElementById('payrollDate');
    const date = dateEl ? dateEl.value : '';

    if (!date) {
        showStatus('payrollStatus', 'Сначала выполните расчет', 'error');
        return;
    }

    const table = document.getElementById('payrollTable');
    const tbody = document.getElementById('payrollTableBody');

    if (!table || !tbody || tbody.children.length === 0) {
        showStatus('payrollStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    const exportData = [];
    let currentStore = '';
    let storeRevenue = 0;
    let storeTotal = 0;

    Array.from(tbody.children).forEach(row => {
        if (row.classList.contains('summary-row')) {
            // Это строка с названием магазина или итогом
            const text = row.textContent;
            if (text.includes('Магазин:')) {
                currentStore = text.replace('Магазин:', '').trim();
                // Ищем выручку в следующих строках
                const nextRow = row.nextElementSibling;
                if (nextRow && !nextRow.classList.contains('summary-row')) {
                    const revCell = nextRow.cells[2];
                    if (revCell) {
                        storeRevenue = parseFloat(revCell.textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0;
                    }
                }
            }
        } else {
            // Это строка с данными сотрудника
            const cells = row.cells;
            if (cells.length >= 8) {
                const rowData = {
                    'Дата': date,
                    'Магазин': currentStore,
                    'Сотрудник': cells[0].textContent.replace(/СП/g, '').trim(),
                    'Старший продавец': cells[0].textContent.includes('СП') ? 'Да' : 'Нет',
                    'Касса магазина': storeRevenue,
                    'Кол-во продавцов': parseInt(cells[3].textContent) || 0,
                    'Ставка': parseFloat(cells[4].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0,
                    'Бонус': parseFloat(cells[5].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0,
                    'Расшифровка бонуса': cells[6].textContent.trim(),
                    'Итого начислено': parseFloat(cells[7].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0
                };
                exportData.push(rowData);
            }
        }
    });

    if (exportData.length === 0) {
        showStatus('payrollStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    // Создаем Excel файл
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Настраиваем ширину колонок
    ws['!cols'] = [
        { wch: 12 }, // Дата
        { wch: 20 }, // Магазин
        { wch: 25 }, // Сотрудник
        { wch: 15 }, // Старший продавец
        { wch: 15 }, // Касса
        { wch: 10 }, // Кол-во продавцов
        { wch: 12 }, // Ставка
        { wch: 12 }, // Бонус
        { wch: 35 }, // Расшифровка бонуса
        { wch: 15 }  // Итого
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Расчет за день");

    // Добавляем сводку
    const summaryData = [];
    const totals = exportData.reduce((acc, row) => {
        acc.employees++;
        acc.totalPay += row['Итого начислено'];
        return acc;
    }, { employees: 0, totalPay: 0 });

    summaryData.push({
        'Показатель': 'Дата расчета',
        'Значение': date
    });
    summaryData.push({
        'Показатель': 'Количество сотрудников',
        'Значение': totals.employees
    });
    summaryData.push({
        'Показатель': 'Общая сумма начислений',
        'Значение': totals.totalPay.toFixed(2) + ' грн'
    });

    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    ws2['!cols'] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Сводка");

    const fileName = `Расчет_зарплаты_${date}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function exportMonthlyReportToExcel() {
    const monthEl = document.getElementById('reportMonth');
    const yearEl = document.getElementById('reportYear');
    const month = monthEl ? monthEl.value : '';
    const year = yearEl ? yearEl.value : '';
    
    if (!month || !year) {
        showStatus('reportStatus', 'Сначала сформируйте отчет', 'error');
        return;
    }

    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        showStatus('reportStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

    const exportData = [];

    // Собираем данные из таблицы
    tableRows.forEach(row => {
        if (row.classList.contains('summary-row')) return;
        
        // Получаем все значения из строки таблицы
        const basePay = parseFloat(row.dataset.basePay) || 0;
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        
        // Расчеты
        const totalGross = basePay + manualBonus;
        const totalDeductions = penalty + shortage;
        const totalAfterDeductions = totalGross - totalDeductions;
        
        // Получаем авансы раздельно для карты и наличных
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        
        let advanceCardAmount = 0;
        let advanceCashAmount = 0;
        let isManualAdjustment = false;
        let isTermination = false; // НОВОЕ
        
        // Аванс на карту
        if (advanceCardCell) {
            const cardText = advanceCardCell.textContent;
            const cardHTML = advanceCardCell.innerHTML;
            advanceCardAmount = parseFloat(cardText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            if (cardHTML.includes('✏️')) {
                isManualAdjustment = true;
            }
            if (cardHTML.includes('🚪')) { // НОВОЕ: проверка на увольнение
                isTermination = true;
            }
        }
        
        // Аванс наличными
        if (advanceCashCell) {
            const cashText = advanceCashCell.textContent;
            const cashHTML = advanceCashCell.innerHTML;
            advanceCashAmount = parseFloat(cashText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            if (cashHTML.includes('✏️')) {
                isManualAdjustment = true;
            }
            if (cashHTML.includes('🚪')) { // НОВОЕ: проверка на увольнение
                isTermination = true;
            }
        }
        
        // Определяем основной способ выплаты аванса
        let advancePaymentMethod = 'card';
        if (advanceCashAmount > 0 && advanceCardAmount === 0) {
            advancePaymentMethod = 'cash';
        } else if (advanceCashAmount > 0 && advanceCardAmount > 0) {
            advancePaymentMethod = 'mixed';
        }
        
        // Остаток на карту
        const cardRemainder = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        
        // Зарплата наличными
        const cashPayoutCell = row.querySelector('.cash-payout');
        let cashAmount = 0;
        if (cashPayoutCell) {
            const strongElement = cashPayoutCell.querySelector('strong');
            if (strongElement) {
                cashAmount = parseFloat(strongElement.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
            } else {
                cashAmount = parseFloat(cashPayoutCell.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
            }
        }
        
        // НОВОЕ: Определяем статус сотрудника
        let employeeStatus = 'Работает';
        let paymentType = 'Стандартная';
        
        if (isTermination) {
            employeeStatus = 'УВОЛЕН';
            paymentType = 'Полная выплата при увольнении';
        } else if (advanceCardAmount + advanceCashAmount >= totalAfterDeductions) {
            paymentType = 'Полная выплата авансом';
        }
        
        // Создаем объект с данными для экспорта
        const rowData = {
            'Сотрудник': row.dataset.employeeName || '',
            'Статус': employeeStatus, // НОВОЕ
            'Магазин': row.dataset.storeAddress || '',
            'Месяц': `${monthNames[month - 1]} ${year}`,
            'База начислений': basePay,
            'Премирование': manualBonus,
            'Причина премии': row.querySelector('[name="bonus_reason"]')?.value || '',
            'Всего начислено': totalGross,
            'Депремирование': penalty,
            'Причина депремирования': row.querySelector('[name="penalty_reason"]')?.value || '',
            'Вычет за недостачу': shortage,
            'Всего вычетов': totalDeductions,
            'К выплате после вычетов': totalAfterDeductions,
            'Тип выплаты': paymentType, // НОВОЕ
            'Аванс (на карту)': advanceCardAmount,
            'Аванс (наличные)': advanceCashAmount,
            'Способ выплаты аванса': advancePaymentMethod === 'cash' ? 'Наличные' : advancePaymentMethod === 'mixed' ? 'Карта + Наличные' : 'Карта',
            'Ручная корректировка': isManualAdjustment ? 'Да' : 'Нет',
            'Увольнение': isTermination ? 'ДА' : 'Нет', // НОВОЕ
            'Остаток (на карту)': cardRemainder,
            'Зарплата (наличными)': cashAmount,
            'ИТОГО к выплате': totalAfterDeductions,
            'Рабочие дни': JSON.parse(row.dataset.shifts || '[]').join(', ')
        };
        
        exportData.push(rowData);
    });

    // Проверяем, что есть данные для экспорта
    if (exportData.length === 0) {
        showStatus('reportStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    // Создаем рабочую книгу
    const wb = XLSX.utils.book_new();
    
    // ЛИСТ 1: Детальный отчет
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Настраиваем ширину колонок
    ws['!cols'] = [
        { wch: 25 }, // Сотрудник
        { wch: 10 }, // Статус (НОВОЕ)
        { wch: 20 }, // Магазин
        { wch: 15 }, // Месяц
        { wch: 12 }, // База
        { wch: 12 }, // Премирование
        { wch: 20 }, // Причина премии
        { wch: 14 }, // Всего начислено
        { wch: 14 }, // Депремирование
        { wch: 20 }, // Причина депремирования
        { wch: 14 }, // Вычет за недостачу
        { wch: 12 }, // Всего вычетов
        { wch: 18 }, // К выплате после вычетов
        { wch: 25 }, // Тип выплаты (НОВОЕ)
        { wch: 14 }, // Аванс на карту
        { wch: 14 }, // Аванс наличные
        { wch: 18 }, // Способ выплаты
        { wch: 14 }, // Ручная корректировка
        { wch: 10 }, // Увольнение (НОВОЕ)
        { wch: 14 }, // Остаток на карту
        { wch: 15 }, // Наличными
        { wch: 15 }, // ИТОГО к выплате
        { wch: 20 }  // Рабочие дни
    ];
    
    // НОВОЕ: Применяем условное форматирование для уволенных (подсветка строк)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) { // Начинаем с 1, чтобы пропустить заголовок
        const statusCell = ws[XLSX.utils.encode_cell({r: R, c: 1})]; // Колонка "Статус"
        if (statusCell && statusCell.v === 'УВОЛЕН') {
            // Применяем стиль ко всей строке
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = XLSX.utils.encode_cell({r: R, c: C});
                if (ws[cell_address]) {
                    ws[cell_address].s = {
                        fill: { fgColor: { rgb: "FFE6E6" } }, // Светло-красный фон
                        font: { bold: true }
                    };
                }
            }
        }
    }
    
    XLSX.utils.book_append_sheet(wb, ws, "Детальный отчет");
    
    // ЛИСТ 2: Сводка по выплатам (с учетом увольнений)
    const paymentSummary = [];
    let totalAdvanceCard = 0;
    let totalAdvanceCash = 0;
    let totalCardRemainder = 0;
    let totalCash = 0;
    let totalCardPayments = 0;
    let terminatedCount = 0; // НОВОЕ
    let terminatedAmount = 0; // НОВОЕ
    
    exportData.forEach(row => {
        totalAdvanceCard += row['Аванс (на карту)'];
        totalAdvanceCash += row['Аванс (наличные)'];
        totalCardRemainder += row['Остаток (на карту)'];
        totalCash += row['Зарплата (наличными)'];
        totalCardPayments = totalAdvanceCard + totalCardRemainder;
        
        if (row['Увольнение'] === 'ДА') { // НОВОЕ
            terminatedCount++;
            terminatedAmount += row['ИТОГО к выплате'];
        }
    });
    
    const totalAdvance = totalAdvanceCard + totalAdvanceCash;
    
    paymentSummary.push(
        { 'Показатель': 'Период', 'Значение': `${monthNames[month - 1]} ${year}` },
        { 'Показатель': 'Всего сотрудников', 'Значение': exportData.length },
        { 'Показатель': 'Из них УВОЛЕНО', 'Значение': terminatedCount }, // НОВОЕ
        { 'Показатель': 'Сумма выплат уволенным', 'Значение': terminatedAmount.toFixed(2) + ' грн' }, // НОВОЕ
        { 'Показатель': '═══════════════════════', 'Значение': '═══════════════════════' },
        // ... остальные показатели
    );
    
    const ws2 = XLSX.utils.json_to_sheet(paymentSummary);
    ws2['!cols'] = [{ wch: 45 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Сводка по выплатам");
    
    // НОВОЕ: ЛИСТ 3 - Отдельный список уволенных
    const terminatedEmployees = exportData.filter(row => row['Увольнение'] === 'ДА');
    if (terminatedEmployees.length > 0) {
        const terminatedData = terminatedEmployees.map(row => ({
            'Сотрудник': row['Сотрудник'],
            'Магазин': row['Магазин'],
            'Всего начислено': row['Всего начислено'],
            'Вычеты': row['Всего вычетов'],
            'К выплате': row['К выплате после вычетов'],
            'Выплачено на карту': row['Аванс (на карту)'],
            'Выплачено наличными': row['Аванс (наличные)'],
            'Причина': row['Причина депремирования'] || 'Увольнение'
        }));
        
        const ws3 = XLSX.utils.json_to_sheet(terminatedData);
        ws3['!cols'] = [
            { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }
        ];
        XLSX.utils.book_append_sheet(wb, ws3, "Уволенные сотрудники");
    }
    
    // Сохраняем файл
    const hasTerminations = terminatedCount > 0 ? `_есть_увольнения_${terminatedCount}` : '';
    const fileName = `Отчет_${monthNames[month - 1]}_${year}_полный${hasTerminations}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showStatus('reportStatus', `✅ Экспорт выполнен: ${fileName}`, 'success');
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

// --- УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ FETCH-ЗАПРОСОВ ---
async function fetchData(url, options, statusId) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    let errorText = `Ошибка HTTP: ${response.status}`;
                    const responseClone = response.clone();

                    try {
                        const errorResult = await responseClone.json();
                        errorText = errorResult.error || errorResult.message || JSON.stringify(errorResult);
                    } catch (e) {
                        try {
                            const textError = await response.text();
                            if (textError.includes('<!DOCTYPE') || textError.includes('<html')) {
                                errorText = `Ошибка ${response.status}: Эндпоинт не найден`;
                            } else {
                                errorText = textError || errorText;
                            }
                        } catch (textError) {
                            errorText = `Ошибка HTTP: ${response.status} - ${response.statusText}`;
                        }
                    }
                    throw new Error(errorText);
                }

                return await response.json();

            } catch (error) {
                console.error(`Ошибка при запросе к ${url}:`, error);
                showStatus(statusId, `Ошибка: ${error.message}`, 'error');
                throw error;
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
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">Нет данных за выбранную дату.</td></tr>';
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
                tbody.innerHTML += `<tr class="summary-row" style="background-color: #f0f2f5;"><td colspan="8" style="font-weight: bold;">Магазин: ${storeName}</td></tr>`;
                storeCalculations.forEach(calc => {
                    storeTotalPay += calc.total_pay;
                    const bonusDetails = calc.bonus_details || '';
                    tbody.innerHTML += `<tr>
                <td>${calc.employee_name} ${calc.is_senior ? '<span class="badge warning">СП</span>' : ''}</td>
                <td>${calc.store_address}</td>
                <td>${formatNumber(calc.revenue)} грн</td>
                <td style="text-align: center;">${calc.num_sellers}</td>
                <td>${formatNumber(calc.base_rate)} грн</td>
                <td>${formatNumber(calc.bonus)} грн</td>
                <td style="font-size: 11px; color: #666;">${bonusDetails}</td>
                <td><strong>${formatNumber(calc.total_pay)} грн</strong></td>
            </tr>`;
                });
                tbody.innerHTML += `<tr class="summary-row" style="background-color: #e9ecef;"><td colspan="7" style="font-weight: bold; text-align: right;">Итого по магазину:</td><td style="font-weight: bold;"><strong>${formatNumber(storeTotalPay)} грн</strong></td></tr>`;
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

// --- ФУНКЦИИ ДЛЯ ОБРАБОТКИ КОРРЕКТИРОВОК ---
let adjustmentDebounceTimer;

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
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
    const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
    const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;

    const totalGross = basePay + manualBonus;
    const totalAfterDeductions = totalGross - penalty - shortage;

    // Получаем текущий аванс из обеих колонок
    const advanceCardCell = row.querySelector('.advance-payment-card');
    const advanceCashCell = row.querySelector('.advance-payment-cash');
    
    let totalAdvance = 0;
    if (advanceCardCell) {
        const cardText = advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
        totalAdvance += parseFloat(cardText) || 0;
    }
    if (advanceCashCell) {
        const cashText = advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
        totalAdvance += parseFloat(cashText) || 0;
    }

    // ИСПРАВЛЕНИЕ: Остаток к выплате = Всего после вычетов - Аванс
    const remainingToPay = totalAfterDeductions - totalAdvance;

    const totalGrossCell = row.querySelector('.total-gross');
    if (totalGrossCell) {
        totalGrossCell.textContent = formatNumber(totalGross);
    }

    const totalPayoutCell = row.querySelector('.total-payout strong');
    if (totalPayoutCell) {
        totalPayoutCell.textContent = formatNumber(remainingToPay);
        totalPayoutCell.title = `После вычета аванса ${formatNumber(totalAdvance)} грн`;
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
    } catch (error) {
        console.error('Ошибка сохранения корректировок:', error);
    }
}


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

        // Логируем параметры запроса
        console.log(`Формирование отчета за ${month}/${year} до ${reportEndDate}`);

        showStatus('reportStatus', 'Формирование отчета...', 'info');
        reportContentEl.innerHTML = ''; // Очищаем содержимое перед генерацией
        reportContentEl.style.display = 'none';

        try {
            const result = await fetchData(
                `${API_BASE}/get-monthly-data`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ year: parseInt(year), month: parseInt(month), reportEndDate })
                },
                'reportStatus'
            );

            if (result.success) {
                console.log(`Получено ${result.dailyData.length} записей, ${result.adjustments.length} корректировок и ${(result.finalCalculations || []).length} финальных расчетов`);
                hideStatus('reportStatus');
                reportContentEl.style.display = 'block';

                // ВАЖНО: Передаем finalCalculations в функцию displayMonthlyReport
                displayMonthlyReport(
                    result.dailyData,
                    result.adjustments,
                    month,
                    year,
                    result.finalCalculations || [] // Добавляем финальные расчеты
                );
            }
        } catch (error) {
            console.error('Ошибка генерации отчета:', error);
            showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
        }
    }

function displayMonthlyReport(dailyData, adjustments, month, year, finalCalculations = []) {
    const reportContentEl = document.getElementById('monthlyReportContent');
    if (!reportContentEl) return;

    // Суммируем данные за весь период
    const employeeData = {};

    // Логируем для отладки
    console.log(`Обработка ${dailyData.length} записей за месяц`);
    console.log(`Получено финальных расчетов: ${finalCalculations.length}`);

    dailyData.forEach(calc => {
        if (!employeeData[calc.employee_id]) {
            employeeData[calc.employee_id] = {
                name: calc.employee_name,
                totalPay: 0,
                shifts: [],
                stores: {},
                primaryStore: calc.store_address || 'Не определен',
                workDates: []
            };
        }
        // Суммируем все начисления за период
        employeeData[calc.employee_id].totalPay += calc.total_pay;

        // Сохраняем дату работы
        const workDate = new Date(calc.work_date);
        employeeData[calc.employee_id].shifts.push(workDate.getDate());
        employeeData[calc.employee_id].workDates.push(calc.work_date);

        const store = calc.store_address || 'Старший продавец';
        employeeData[calc.employee_id].stores[store] = (employeeData[calc.employee_id].stores[store] || 0) + 1;
    });

    // Логируем итоговые суммы
    console.log('Итоговые суммы по сотрудникам:');
    Object.entries(employeeData).forEach(([id, data]) => {
        console.log(`${data.name}: ${data.totalPay} грн за ${data.shifts.length} дней`);
    });

    // Определяем основной магазин для каждого сотрудника
    for (const [id, data] of Object.entries(employeeData)) {
        if (Object.keys(data.stores).length > 0) {
            data.primaryStore = Object.keys(data.stores).reduce((a, b) => data.stores[a] > data.stores[b] ? a : b);
        }
    }

    // Создаем мапы для корректировок и финальных расчетов
    const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));

    // Создаем мапу финальных расчетов
    const finalCalcMap = new Map();
    if (finalCalculations && finalCalculations.length > 0) {
        finalCalculations.forEach(calc => {
            finalCalcMap.set(calc.employee_id, calc);
        });
        console.log(`Создана мапа финальных расчетов для ${finalCalcMap.size} сотрудников`);
    }

    const sortedEmployees = Object.entries(employeeData).sort((a, b) => {
        const storeCompare = a[1].primaryStore.localeCompare(b[1].primaryStore);
        if (storeCompare !== 0) return storeCompare;
        return a[1].name.localeCompare(b[1].name);
    });

    // Считаем общие суммы для отображения в заголовке
    const totalBasePay = Object.values(employeeData).reduce((sum, data) => sum + data.totalPay, 0);
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

    let tableHtml = `
    <h3>👥 Детализация по сотрудникам за ${monthNames[month - 1]} ${year}:</h3>
    <p style="margin: 10px 0; color: #666;">Общая сумма начислений (база): <strong>${formatNumber(totalBasePay)} грн</strong></p>
    <div class="table-container">
    <table id="monthlyReportTable" style="font-size: 11px; white-space: nowrap;">
        <thead class="monthly-report-head">
            <tr>
                <th rowspan="2" style="vertical-align: middle;">Сотрудник</th>
                <th rowspan="2" style="vertical-align: middle;">Магазин</th>
                <th rowspan="2" style="vertical-align: middle;">Всего начислено<br/>(база)</th>
                <th colspan="2">Премирование</th>
                <th colspan="2">Депремирование</th>
                <th rowspan="2" style="vertical-align: middle;">Вычет за<br/>недостачу</th>
                <th rowspan="2" style="vertical-align: middle;">Аванс<br/>(на карту)</th>
                <th rowspan="2" style="vertical-align: middle;">Аванс<br/>(наличные)</th>
                <th rowspan="2" style="vertical-align: middle;">Остаток<br/>(на карту)</th>
                <th rowspan="2" style="vertical-align: middle;">Зарплата<br/>(наличными)</th>
                <th rowspan="2" style="vertical-align: middle;">Итого<br/>к выплате</th>
            </tr>
            <tr><th>Сумма</th><th>Причина</th><th>Сумма</th><th>Причина</th></tr>
        </thead>
        <tbody>`;

    if (sortedEmployees.length === 0) {
        tableHtml += '<tr><td colspan="13" style="text-align: center; padding: 20px;">Нет данных для отображения за выбранный период.</td></tr>';
    } else {
        for (const [id, data] of sortedEmployees) {
            const adj = adjustmentsMap.get(id) || { manual_bonus: 0, penalty: 0, shortage: 0, bonus_reason: '', penalty_reason: '' };

            // Получаем финальный расчет если он есть
            const finalCalc = finalCalcMap.get(id);

            // Расчет итоговой суммы
            const totalGross = data.totalPay + (adj.manual_bonus || 0);
            const totalDeductions = (adj.penalty || 0) + (adj.shortage || 0);
            const totalAfterDeductions = totalGross - totalDeductions;

            // Используем сохраненные данные из финального расчета, если они есть
            let advancePayment = 0;
            let advanceCard = 0;
            let advanceCash = 0;
            let cardRemainder = 0;
            let cashPayout = 0;
            let isManualAdvance = false;
            let manualAdvanceReason = '';
            let isTermination = false;

            if (finalCalc) {
                // Если есть финальный расчет, берем ВСЕ данные из него
                advancePayment = finalCalc.advance_payment || 0;
                advanceCard = finalCalc.advance_card || 0;
                advanceCash = finalCalc.advance_cash || 0;
                cardRemainder = finalCalc.card_remainder || 0;
                cashPayout = finalCalc.cash_payout || 0;
                isManualAdvance = finalCalc.is_manual_adjustment || false;
                manualAdvanceReason = finalCalc.adjustment_reason || '';
                isTermination = finalCalc.is_termination || false;

                console.log(`Для ${data.name} загружены финальные данные: аванс=${advancePayment}, остаток=${cardRemainder}, наличные=${cashPayout}`);
            }

            // ВАЖНО: Расчет остатка к выплате зависит от наличия финального расчета
            let remainingToPay;
            let hasCompleteCalculation = false;
            
            if (finalCalc && finalCalc.is_fixed) {
                // Если есть финальный расчет с зафиксированным авансом
                remainingToPay = cardRemainder + cashPayout;
                hasCompleteCalculation = true;
            } else {
                // Предварительный расчет - просто разница
                remainingToPay = totalAfterDeductions - advancePayment;
                hasCompleteCalculation = false;
            }

            // Определяем содержимое для авансов на карту и наличными
            let advanceCardContent = '0';
            let advanceCashContent = '0';

            // Определяем состояние аванса
            if (isTermination) {
                // Увольнение
                if (advanceCash > 0 && advanceCard > 0) {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        💳 🚪 ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        💵 🚪 ${formatNumber(advanceCash)}
                    </span>`;
                } else if (advanceCash > 0) {
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        💵 🚪 ${formatNumber(advanceCash)}
                    </span>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        💳 🚪 ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = '0';
                }
            } else if (isManualAdvance) {
                // Ручная корректировка
                if (advanceCash > 0 && advanceCard > 0) {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        💳 ✏️ ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        💵 ✏️ ${formatNumber(advanceCash)}
                    </span>`;
                } else if (advanceCash > 0) {
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        💵 ✏️ ${formatNumber(advanceCash)}
                    </span>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        💳 ✏️ ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = '0';
                }
            } else if (finalCalc && finalCalc.is_fixed) {
                // Зафиксированный аванс
                if (advanceCash > 0) {
                    advanceCashContent = `
                    <strong style="color: #28a745;" title="Аванс зафиксирован (наличные)">
                        🔒 💵 ${formatNumber(advanceCash)}
                    </strong>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `
                    <strong style="color: #f5576c;" title="Аванс зафиксирован (карта)">
                        🔒 💳 ${formatNumber(advanceCard)}
                    </strong>`;
                    advanceCashContent = '0';
                }
            } else if (finalCalc) {
                // Есть финальный расчет, но аванс не помечен как зафиксированный
                if (advanceCash > 0) {
                    advanceCashContent = `<strong style="color: #28a745;">💵 ${formatNumber(advanceCash)}</strong>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `<strong>💳 ${formatNumber(advanceCard)}</strong>`;
                    advanceCashContent = '0';
                }
            } else {
                // Расчетный аванс (еще не зафиксирован) - по умолчанию на карту
                advanceCardContent = `
                <span style="color: #666;" title="Расчетный аванс">
                    ${formatNumber(advanceCard)}
                </span>`;
                advanceCashContent = '0';
            }

            // Добавляем класс для выделения если есть финальный расчет
            const rowClass = finalCalc ? 'has-final-calc' : '';

            // Добавляем строку в таблицу
            tableHtml += `<tr class="${rowClass}" 
            data-employee-id="${id}" 
            data-employee-name="${data.name}" 
            data-store-address="${data.primaryStore}" 
            data-month="${month}" 
            data-year="${year}" 
            data-base-pay="${data.totalPay}" 
            data-shifts='${JSON.stringify(data.shifts)}'>
            <td style="padding: 5px;">${data.name}</td>
            <td style="padding: 5px; font-size: 10px;">${data.primaryStore}</td>
            <td class="total-gross" style="padding: 5px;">${formatNumber(totalGross)}</td>
            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus || 0}" style="width: 70px;"></td>
            <td style="padding: 5px;"><input type="text" class="adjustment-input" name="bonus_reason" value="${adj.bonus_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty || 0}" style="width: 70px;"></td>
            <td style="padding: 5px;"><input type="text" class="adjustment-input" name="penalty_reason" value="${adj.penalty_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="shortage" value="${adj.shortage || 0}" style="width: 70px;"></td>
            <td class="advance-payment-card" style="padding: 5px;">
                <span class="advance-card-content" data-employee-id="${id}" data-employee-name="${data.name}">${advanceCardContent}</span>
            </td>
            <td class="advance-payment-cash" style="padding: 5px;">
                <span class="advance-cash-content" data-employee-id="${id}" data-employee-name="${data.name}">${advanceCashContent}</span>
            </td>
            <td class="card-remainder" style="padding: 5px; ${!hasCompleteCalculation ? 'color: #ccc;' : (cardRemainder > 0 ? 'color: #28a745; font-weight: bold;' : '')}">
                ${hasCompleteCalculation ? formatNumber(cardRemainder) : '—'}
            </td>
            <td class="cash-payout" style="padding: 5px; ${!hasCompleteCalculation ? 'color: #ccc;' : ''}">
                ${hasCompleteCalculation ? (cashPayout > 0 ? `<strong style="color: #007bff;">${formatNumber(cashPayout)}</strong>` : formatNumber(cashPayout)) : '—'}
            </td>
            <td class="total-payout" style="padding: 5px;">
                <strong title="${hasCompleteCalculation ? 'Итоговый расчет выполнен' : 'Предварительный расчет'}">${formatNumber(remainingToPay)}</strong>
            </td>
        </tr>`;
        }
    }

    tableHtml += `</tbody></table></div>`;

    if (finalCalcMap.size > 0) {
        let totalAdvanceCard = 0;
        let totalAdvanceCash = 0;
        let totalCardRemainder = 0;
        let totalCash = 0;
        
        Array.from(finalCalcMap.values()).forEach(calc => {
            totalAdvanceCard += (calc.advance_card || 0);
            totalAdvanceCash += (calc.advance_cash || 0);
            totalCardRemainder += (calc.card_remainder || 0);
            totalCash += (calc.cash_payout || 0);
        });
        
        const manualAdjustmentsCount = Array.from(finalCalcMap.values()).filter(calc => calc.is_manual_adjustment).length;
        const cashAdvanceCount = Array.from(finalCalcMap.values()).filter(calc => calc.advance_cash > 0).length;
        
        let infoMessage = `
            <strong>ℹ️ Загружены финальные расчеты</strong><br>
            Аванс на карту: ${formatNumber(totalAdvanceCard)} грн | 
            Аванс наличными: ${formatNumber(totalAdvanceCash)} грн<br>
            Остаток на карту: ${formatNumber(totalCardRemainder)} грн | 
            Зарплата наличными: ${formatNumber(totalCash)} грн
        `;
        
        if (manualAdjustmentsCount > 0) {
            infoMessage += `<br><span style="color: #ff6b6b;">✏️ Ручных корректировок аванса: ${manualAdjustmentsCount}</span>`;
        }
        if (cashAdvanceCount > 0) {
            infoMessage += `<br><span style="color: #28a745;">💵 Авансов наличными: ${cashAdvanceCount}</span>`;
        }
        
        const existingInfoPanel = document.querySelector('#monthlyReportContent .status.info');
        if (existingInfoPanel) {
            existingInfoPanel.innerHTML = infoMessage;
        } else {
            tableHtml = `
                <div class="status info" style="margin-bottom: 15px;">
                    ${infoMessage}
                </div>
            ` + tableHtml;
        }
    }

    reportContentEl.innerHTML = tableHtml;

    // После создания таблицы применяем стили если есть финальные расчеты
    if (finalCalcMap.size > 0) {
        document.querySelectorAll('#monthlyReportTable tbody tr').forEach(row => {
            const employeeId = row.dataset.employeeId;
            const finalCalc = finalCalcMap.get(employeeId);

            if (finalCalc) {
                if (finalCalc.card_remainder > 0) {
                    const cardRemainderCell = row.querySelector('.card-remainder');
                    if (cardRemainderCell) {
                        cardRemainderCell.style.color = '#28a745';
                        cardRemainderCell.style.fontWeight = 'bold';
                    }
                }

                if (finalCalc.cash_payout > 0) {
                    const cashPayoutCell = row.querySelector('.cash-payout');
                    if (cashPayoutCell && !cashPayoutCell.innerHTML.includes('strong')) {
                        cashPayoutCell.innerHTML = `<strong style="color: #007bff;">${formatNumber(finalCalc.cash_payout)}</strong>`;
                    }
                }
            }
        });
    }

    // Привязываем обработчики событий
    document.querySelectorAll('.adjustment-input').forEach(input => {
        input.addEventListener('input', handleAdjustmentInput);
    });

    // ИСПРАВЛЕНИЕ: Добавляем кнопки корректировки для админов с правильными обработчиками
    setTimeout(async () => {
        try {
            const authResponse = await fetch(`${API_BASE}/check-auth`, { credentials: 'include' });
            const authData = await authResponse.json();
            const canAdjust = authData.success && authData.user && 
                             (authData.user.role === 'admin' || authData.user.role === 'accountant');
            
            if (canAdjust) {
                document.querySelectorAll('.advance-card-content, .advance-cash-content').forEach(cell => {
                    if (!cell.querySelector('button')) {
                        const employeeId = cell.dataset.employeeId;
                        const employeeName = cell.dataset.employeeName;
                        const button = document.createElement('button');
                        button.innerHTML = '✏️';
                        button.style.cssText = 'padding: 2px 6px; font-size: 10px; cursor: pointer; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; margin-left: 5px;';
                        button.title = 'Корректировать аванс';
                        button.onclick = () => adjustAdvanceManually(employeeId, employeeName);
                        cell.appendChild(button);
                    }
                });
            }
        } catch (error) {
            console.error('Ошибка проверки прав:', error);
        }
    }, 100);

    // Если есть сотрудники и нет финальных расчетов, пробуем рассчитать аванс
    if (sortedEmployees.length > 0 && finalCalcMap.size === 0) {
        console.log('Финальных расчетов нет, выполняем расчет аванса...');
        calculateAdvance15(true);
    } else if (finalCalcMap.size > 0) {
        console.log('Финальные расчеты загружены, пропускаем автоматический расчет аванса');
    }
}


    function recalculateRow(row) {
    if (!row) return;
    const basePay = parseFloat(row.dataset.basePay) || 0;
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
    const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
    const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;

    const totalGross = basePay + manualBonus;
    const totalAfterDeductions = totalGross - penalty - shortage;

    // Получаем текущий аванс из обеих колонок
    const advanceCardCell = row.querySelector('.advance-payment-card');
    const advanceCashCell = row.querySelector('.advance-payment-cash');
    
    let totalAdvance = 0;
    if (advanceCardCell) {
        const cardText = advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
        totalAdvance += parseFloat(cardText) || 0;
    }
    if (advanceCashCell) {
        const cashText = advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
        totalAdvance += parseFloat(cashText) || 0;
    }

    // ИСПРАВЛЕНИЕ: Остаток к выплате = Всего после вычетов - Аванс
    const remainingToPay = totalAfterDeductions - totalAdvance;

    const totalGrossCell = row.querySelector('.total-gross');
    if (totalGrossCell) {
        totalGrossCell.textContent = formatNumber(totalGross);
    }

    const totalPayoutCell = row.querySelector('.total-payout strong');
    if (totalPayoutCell) {
        totalPayoutCell.textContent = formatNumber(remainingToPay);
        totalPayoutCell.title = `После вычета аванса ${formatNumber(totalAdvance)} грн`;
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
        } catch (error) {
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

    // Сохраняем ссылку на новых сотрудников для использования в диалоге
    let newEmployeesData = null;

    // ========== ПРОВЕРКА НОВЫХ СОТРУДНИКОВ ==========
    try {
        const checkResponse = await fetch(`${API_BASE}/check-new-employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ year, month })
        });
        
        const checkData = await checkResponse.json();
        
        if (checkData.newEmployees && checkData.newEmployees.length > 0) {
            newEmployeesData = checkData.newEmployees;
            // Показываем диалог и ждем решения
            await showNewEmployeesDialog(checkData.newEmployees, month, year);
            // После закрытия диалога функция завершится и будет вызвана заново
            return;
        }
    } catch (error) {
        console.error('Ошибка проверки новых сотрудников:', error);
        // Продолжаем выполнение даже если проверка не удалась
    }

    // ========== ОСНОВНОЙ РАСЧЕТ АВАНСА ==========
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
            let hasFixedAdvances = false;
            let hasManualAdjustments = false;
            
            // Обновляем таблицу с результатами
            tableRows.forEach(row => {
                const employeeId = row.dataset.employeeId;
                const employeeName = row.dataset.employeeName;
                const result = data.results[employeeId];
                
                // Находим правильные ячейки для карты и наличных
                const advanceCellCard = row.querySelector('.advance-payment-card');
                const advanceCellCash = row.querySelector('.advance-payment-cash');
                
                if (result) {
                    let cardContent = '0';
                    let cashContent = '0';
                    
                    // Определяем куда записать аванс - на карту или наличные
                    if (result.payment_method === 'cash') {
                        cashContent = formatNumber(result.advance_payment);
                        if (result.is_manual) {
                            hasManualAdjustments = true;
                            cashContent = `<span style="color: #28a745; font-weight: bold;" title="${result.reason || 'Ручная корректировка'}">💵 ✏️ ${formatNumber(result.advance_payment)}</span>`;
                        } else if (result.is_fixed) {
                            hasFixedAdvances = true;
                            cashContent = `<strong style="color: #28a745;" title="Аванс зафиксирован">🔒 💵 ${formatNumber(result.advance_payment)}</strong>`;
                        } else {
                            cashContent = `<span style="color: #28a745;">💵 ${formatNumber(result.advance_payment)}</span>`;
                        }
                    } else {
                        // По умолчанию на карту
                        cardContent = formatNumber(result.advance_payment);
                        if (result.is_manual) {
                            hasManualAdjustments = true;
                            cardContent = `<span style="color: #ff6b6b; font-weight: bold;" title="${result.reason || 'Ручная корректировка'}">💳 ✏️ ${formatNumber(result.advance_payment)}</span>`;
                        } else if (result.is_fixed) {
                            hasFixedAdvances = true;
                            cardContent = `<strong style="color: #f5576c;" title="Аванс зафиксирован">🔒 💳 ${formatNumber(result.advance_payment)}</strong>`;
                        } else {
                            cardContent = `<span>💳 ${formatNumber(result.advance_payment)}</span>`;
                        }
                    }
                    
                    // Обновляем содержимое ячеек
                    if (advanceCellCard) {
                        const cardSpan = advanceCellCard.querySelector('.advance-card-content');
                        if (cardSpan) {
                            cardSpan.innerHTML = cardContent;
                        } else {
                            advanceCellCard.innerHTML = `<span class="advance-card-content" data-employee-id="${employeeId}" data-employee-name="${employeeName}">${cardContent}</span>`;
                        }
                    }
                    
                    if (advanceCellCash) {
                        const cashSpan = advanceCellCash.querySelector('.advance-cash-content');
                        if (cashSpan) {
                            cashSpan.innerHTML = cashContent;
                        } else {
                            advanceCellCash.innerHTML = `<span class="advance-cash-content" data-employee-id="${employeeId}" data-employee-name="${employeeName}">${cashContent}</span>`;
                        }
                    }
                } else {
                    // Если нет результата, устанавливаем 0
                    if (advanceCellCard) {
                        advanceCellCard.innerHTML = `<span class="advance-card-content" data-employee-id="${employeeId}" data-employee-name="${employeeName}">0</span>`;
                    }
                    if (advanceCellCash) {
                        advanceCellCash.innerHTML = `<span class="advance-cash-content" data-employee-id="${employeeId}" data-employee-name="${employeeName}">0</span>`;
                    }
                }
            });

            // ВАЖНО: Пересчитываем итоговые суммы для всех строк после обновления авансов
            tableRows.forEach(row => {
                recalculateRow(row);
            });

            // Добавляем кнопки корректировки для админов
            const authResponse = await fetch(`${API_BASE}/check-auth`, { credentials: 'include' });
            const authData = await authResponse.json();
            const canAdjust = authData.success && authData.user && 
                             (authData.user.role === 'admin' || authData.user.role === 'accountant');
            
            if (canAdjust) {
                document.querySelectorAll('.advance-card-content, .advance-cash-content').forEach(cell => {
                    if (!cell.querySelector('button')) {
                        const employeeId = cell.dataset.employeeId;
                        const employeeName = cell.dataset.employeeName;
                        const button = document.createElement('button');
                        button.innerHTML = '✏️';
                        button.style.cssText = 'padding: 2px 6px; font-size: 10px; cursor: pointer; background: #f0f0f0; border: 1px solid #ccc; border-radius: 3px; margin-left: 5px;';
                        button.title = 'Корректировать аванс';
                        button.onclick = () => adjustAdvanceManually(employeeId, employeeName);
                        cell.appendChild(button);
                    }
                });
            }

            // Показываем соответствующее сообщение
            if (!silent) {
                if (hasManualAdjustments) {
                    showStatus('reportStatus', '✅ Аванс рассчитан. Есть ручные корректировки авансов.', 'success');
                } else if (hasFixedAdvances || data.hasFixedAdvances) {
                    showStatus('reportStatus', '✅ Аванс рассчитан. Используются зафиксированные выплаты.', 'success');
                } else {
                    showStatus('reportStatus', '✅ Аванс успешно рассчитан. ⚠️ Не забудьте зафиксировать выплату!', 'warning');
                }
            }
        }
    } catch (error) {
        console.error('Ошибка расчета аванса:', error);
        if (!silent) {
            showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
        }
    }
}


    async function adjustAdvanceManually(employeeId, employeeName) {
    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    
    if (!year || !month) {
        showStatus('reportStatus', 'Сначала выберите период', 'error');
        return;
    }
    
    const row = document.querySelector(`tr[data-employee-id="${employeeId}"]`);
    if (!row) return;
    
    // Получаем полную сумму начислений
    const basePay = parseFloat(row.dataset.basePay) || 0;
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
    const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
    const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
    
    const totalGross = basePay + manualBonus;
    const totalDeductions = penalty + shortage;
    const totalToPay = totalGross - totalDeductions;
    
    const advanceCellCard = row.querySelector('.advance-payment-card');
    const advanceCellCash = row.querySelector('.advance-payment-cash');
    const currentAdvanceCard = parseFloat(advanceCellCard?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
    const currentAdvanceCash = parseFloat(advanceCellCash?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
    const currentAdvanceTotal = currentAdvanceCard + currentAdvanceCash;
    const maxAdvanceAmount = MAX_ADVANCE; // 7900
    
    // НОВОЕ: Спрашиваем тип операции
    const operationType = prompt(
        `Выберите тип операции для ${employeeName}:\n\n` +
        `1 - Обычная корректировка аванса (макс ${maxAdvanceAmount} грн)\n` +
        `2 - УВОЛЬНЕНИЕ (полная выплата ${totalToPay} грн)\n\n` +
        `Текущие начисления: ${totalToPay} грн\n` +
        `Текущий аванс: ${currentAdvanceTotal} грн\n\n` +
        `Введите 1 или 2:`,
        '1'
    );
    
    if (operationType === null) return;
    
    let totalAdvance = 0;
    let isTermination = false;
    let maxAmount = maxAdvanceAmount;
    
    if (operationType === '2') {
        // Режим увольнения - можно выплатить всю сумму
        isTermination = true;
        maxAmount = totalToPay; // Снимаем ограничение
        totalAdvance = totalToPay;
        
        const confirmTermination = confirm(
            `⚠️ РЕЖИМ УВОЛЬНЕНИЯ\n\n` +
            `Сотрудник: ${employeeName}\n` +
            `К выплате: ${totalToPay} грн\n\n` +
            `Будет выплачена ВСЯ сумма начислений.\n` +
            `Лимиты аванса НЕ применяются.\n\n` +
            `Продолжить?`
        );
        
        if (!confirmTermination) return;
        
    } else {
        // Обычная корректировка с лимитами
        const totalAdvanceStr = prompt(
            `Корректировка аванса для ${employeeName}\n\n` +
            `Текущий аванс:\n` +
            `• На карту: ${currentAdvanceCard} грн\n` +
            `• Наличными: ${currentAdvanceCash} грн\n` +
            `• Всего: ${currentAdvanceTotal} грн\n\n` +
            `К выплате всего: ${totalToPay} грн\n` +
            `Максимум аванса: ${maxAmount} грн\n\n` +
            `Введите сумму аванса:`,
            Math.min(currentAdvanceTotal, maxAmount)
        );
        
        if (totalAdvanceStr === null) return;
        
        totalAdvance = parseFloat(totalAdvanceStr);
        if (isNaN(totalAdvance) || totalAdvance < 0) {
            showStatus('reportStatus', 'Некорректная сумма', 'error');
            return;
        }
        
        if (totalAdvance > maxAmount) {
            showStatus('reportStatus', `Аванс не может превышать ${maxAmount} грн`, 'error');
            return;
        }
    }
    
    let advanceCard = 0;
    let advanceCash = 0;
    
    if (totalAdvance > 0) {
        // Выбор способа выплаты
        const paymentChoice = prompt(
            `Как выплатить ${totalAdvance} грн?\n\n` +
            `1 - Всё на карту (безнал)\n` +
            `2 - Всё наличными\n` +
            `3 - Разделить между картой и наличными\n\n` +
            `Введите 1, 2 или 3:`,
            '3' // По умолчанию предлагаем разделить
        );
        
        if (paymentChoice === null) return;
        
        if (paymentChoice === '1') {
            advanceCard = totalAdvance;
            advanceCash = 0;
        } else if (paymentChoice === '2') {
            advanceCard = 0;
            advanceCash = totalAdvance;
        } else if (paymentChoice === '3') {
            // Разделение суммы
            let defaultCardAmount = Math.min(totalAdvance, 8600); // Предлагаем максимум карты
            if (isTermination) {
                // При увольнении предлагаем разумное разделение
                defaultCardAmount = Math.min(totalAdvance, 6000); // Или другая логика
            }
            
            const cardAmountStr = prompt(
                `Разделение суммы ${formatNumber(totalAdvance)} грн\n\n` +
                `Сколько выплатить НА КАРТУ?\n` +
                `(остальное будет выплачено наличными)\n\n` +
                `Максимум на карту: ${Math.min(totalAdvance, 8600)} грн\n` +
                `Остаток наличными: ${formatNumber(totalAdvance - Math.min(totalAdvance, 8600))} грн\n\n` +
                `Введите сумму для карты:`,
                defaultCardAmount
            );
            
            if (cardAmountStr === null) return;
            
            advanceCard = parseFloat(cardAmountStr) || 0;
            if (isNaN(advanceCard) || advanceCard < 0 || advanceCard > totalAdvance) {
                showStatus('reportStatus', 'Некорректная сумма для карты', 'error');
                return;
            }
            
            // При увольнении проверяем лимит карты 8600
            if (advanceCard > 8600) {
                showStatus('reportStatus', 'На карту нельзя выплатить больше 8600 грн даже при увольнении', 'error');
                return;
            }
            
            advanceCash = totalAdvance - advanceCard;
            
            // Подтверждение разделения
            const confirmSplit = confirm(
                `${isTermination ? '⚠️ УВОЛЬНЕНИЕ\n' : ''}` +
                `Подтвердите разделение выплаты:\n\n` +
                `💳 На карту: ${formatNumber(advanceCard)} грн\n` +
                `💵 Наличными: ${formatNumber(advanceCash)} грн\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📊 ИТОГО: ${formatNumber(totalAdvance)} грн\n` +
                `${isTermination ? '(Полная выплата при увольнении)\n' : ''}\n` +
                `Продолжить?`
            );
            
            if (!confirmSplit) return;
        } else {
            showStatus('reportStatus', 'Некорректный выбор. Введите 1, 2 или 3', 'error');
            return;
        }
    }
    
    const reason = isTermination 
        ? prompt('Укажите причину увольнения:', 'Увольнение по собственному желанию')
        : prompt('Укажите причину корректировки:', 'По заявлению сотрудника');
    
    if (!reason) {
        showStatus('reportStatus', 'Необходимо указать причину', 'error');
        return;
    }
    
    showStatus('reportStatus', 'Сохраняем корректировку...', 'info');
    
    try {
        const response = await fetch(`${API_BASE}/adjust-advance-manually`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                employee_id: employeeId,
                month: parseInt(month),
                year: parseInt(year),
                advance_card: advanceCard,
                advance_cash: advanceCash,
                adjusted_advance: totalAdvance,
                adjustment_reason: reason,
                payment_method: advanceCash > 0 && advanceCard > 0 ? 'mixed' : (advanceCash > 0 ? 'cash' : 'card'),
                is_termination: isTermination // Новое поле
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', result.message, 'success');
            
            // Обновляем отображение в таблице
            const updateCellContent = (cell, amount, isCard = true) => {
                if (amount > 0) {
                    const icon = isCard ? '💳' : '💵';
                    const color = isCard ? '#ff6b6b' : '#28a745';
                    const terminationIcon = isTermination ? '🚪' : '✏️';
                    
                    cell.innerHTML = `
                        <span class="advance-${isCard ? 'card' : 'cash'}-content" 
                              data-employee-id="${employeeId}" 
                              data-employee-name="${employeeName}">
                            <span style="color: ${color}; font-weight: bold;" 
                                  title="${reason}">
                                ${icon} ${terminationIcon} ${formatNumber(amount)}
                            </span>
                        </span>`;
                } else {
                    cell.innerHTML = `
                        <span class="advance-${isCard ? 'card' : 'cash'}-content" 
                              data-employee-id="${employeeId}" 
                              data-employee-name="${employeeName}">
                            0
                        </span>`;
                }
            };
            
            updateCellContent(advanceCellCard, advanceCard, true);
            updateCellContent(advanceCellCash, advanceCash, false);
            
            // При увольнении обнуляем остаток и зарплату
            if (isTermination) {
                const cardRemainderCell = row.querySelector('.card-remainder');
                const cashPayoutCell = row.querySelector('.cash-payout');
                
                if (cardRemainderCell) cardRemainderCell.textContent = '0,00';
                if (cashPayoutCell) cashPayoutCell.innerHTML = '<strong>0,00</strong>';
            }
            
            setTimeout(() => {
                recalculateRow(row);
            }, 100);
            
        } else {
            showStatus('reportStatus', result.error || 'Ошибка при сохранении', 'error');
        }
    } catch (error) {
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Добавьте эту функцию после функции adjustAdvanceManually (примерно на строке 1650-1700)

async function showAdjustmentsHistory() {
    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    
    if (!year || !month) {
        showStatus('reportStatus', 'Сначала выберите период', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/advance-adjustments-history?month=${month}&year=${year}`, {
            method: 'GET',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success && result.adjustments && result.adjustments.length > 0) {
            let historyHTML = `
                <div style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    max-width: 900px;
                    max-height: 600px;
                    overflow-y: auto;
                    z-index: 10000;
                " id="history-modal">
                    <h3 style="margin-bottom: 20px;">📜 История корректировок за ${month}/${year}</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                                <th style="padding: 10px; text-align: left;">Сотрудник</th>
                                <th style="padding: 10px;">Сумма</th>
                                <th style="padding: 10px;">Способ</th>
                                <th style="padding: 10px;">Причина</th>
                                <th style="padding: 10px;">Кто изменил</th>
                                <th style="padding: 10px;">Когда</th>
                            </tr>
                        </thead>
                        <tbody>`;
            
            result.adjustments.forEach((adj, index) => {
                const date = new Date(adj.adjusted_at).toLocaleString('ru-RU');
                const method = adj.payment_method === 'cash' ? 'Наличные' : 
                              adj.payment_method === 'mixed' ? 'Карта+Наличные' : 'Карта';
                const bgColor = index % 2 === 0 ? '#f9f9f9' : '#ffffff';
                historyHTML += `
                    <tr style="background: ${bgColor};">
                        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${adj.employee_name}</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${formatNumber(adj.advance_amount)} грн</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">${method}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${adj.reason}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${adj.adjusted_by}</td>
                        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${date}</td>
                    </tr>`;
            });
            
            historyHTML += `
                        </tbody>
                    </table>
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="document.getElementById('history-modal').remove(); document.getElementById('history-overlay').remove();" 
                                style="padding: 10px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 5px; cursor: pointer;">
                            Закрыть
                        </button>
                    </div>
                </div>
                <div id="history-overlay" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 9999;
                " onclick="document.getElementById('history-modal').remove(); document.getElementById('history-overlay').remove();"></div>`;
            
            document.body.insertAdjacentHTML('beforeend', historyHTML);
        } else {
            showStatus('reportStatus', 'Нет истории корректировок за выбранный период', 'info');
        }
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        showStatus('reportStatus', `Ошибка загрузки истории: ${error.message}`, 'error');
    }
}

    // Новая функция для фиксации аванса
    async function fixAdvancePayment() {
    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    const advanceEndDate = document.getElementById('reportEndDate')?.value;

    if (!year || !month || !advanceEndDate) {
        showStatus('reportStatus', 'Сначала выберите период и дату расчета', 'error');
        return;
    }

    // Проверяем, был ли рассчитан аванс
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) {
        showStatus('reportStatus', 'Сначала сформируйте отчет и рассчитайте аванс', 'error');
        return;
    }

    // Проверяем, не зафиксирован ли уже аванс
    let alreadyFixed = false;
    tableRows.forEach(row => {
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        if ((advanceCardCell && advanceCardCell.innerHTML.includes('🔒')) || 
            (advanceCashCell && advanceCashCell.innerHTML.includes('🔒'))) {
            alreadyFixed = true;
        }
    });

    if (alreadyFixed) {
        showStatus('reportStatus',
            '⚠️ Аванс уже зафиксирован! Сначала отмените текущую фиксацию.',
            'warning'
        );
        return;
    }

    // Проверяем наличие рассчитанного аванса
    let hasAdvance = false;
    let totalAdvanceAmount = 0;
    let employeesWithAdvance = 0;

    tableRows.forEach(row => {
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        
        let cardAmount = 0;
        let cashAmount = 0;
        
        if (advanceCardCell) {
            const cardText = advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
            cardAmount = parseFloat(cardText) || 0;
        }
        
        if (advanceCashCell) {
            const cashText = advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
            cashAmount = parseFloat(cashText) || 0;
        }
        
        const totalRowAdvance = cardAmount + cashAmount;
        if (totalRowAdvance > 0) {
            hasAdvance = true;
            totalAdvanceAmount += totalRowAdvance;
            employeesWithAdvance++;
        }
    });

    if (!hasAdvance) {
        showStatus('reportStatus', 'Сначала рассчитайте аванс', 'error');
        return;
    }

    // Запрашиваем дату выплаты
    const today = new Date().toISOString().split('T')[0];
    const paymentDate = prompt(
        `Укажите дату фактической выплаты аванса (по умолчанию - сегодня: ${today}):\n\n` +
        `Будет зафиксировано:\n` +
        `• Сотрудников: ${employeesWithAdvance}\n` +
        `• Общая сумма: ${formatNumber(totalAdvanceAmount)} грн\n\n` +
        `ВНИМАНИЕ! После фиксации суммы изменить их можно будет только через отмену.`,
        today
    );

    if (!paymentDate) {
        showStatus('reportStatus', 'Фиксация отменена', 'info');
        return;
    }

    // Проверка корректности даты
    const paymentDateObj = new Date(paymentDate);
    if (isNaN(paymentDateObj.getTime())) {
        showStatus('reportStatus', 'Некорректная дата выплаты', 'error');
        return;
    }

    // Подтверждение фиксации
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

    const confirmMessage = `⚠️ ПОДТВЕРЖДЕНИЕ ФИКСАЦИИ АВАНСА\n\n` +
        `Период: ${monthNames[month - 1]} ${year}\n` +
        `Расчет по дату: ${advanceEndDate}\n` +
        `Дата выплаты: ${paymentDate}\n` +
        `Сотрудников: ${employeesWithAdvance}\n` +
        `Сумма: ${formatNumber(totalAdvanceAmount)} грн\n\n` +
        `После фиксации суммы авансов станут неизменными.\n` +
        `Это действие можно отменить только через функцию отмены.\n\n` +
        `Продолжить фиксацию?`;

    if (!confirm(confirmMessage)) {
        showStatus('reportStatus', 'Фиксация отменена', 'info');
        return;
    }

    showStatus('reportStatus', 'Фиксируем выплату аванса...', 'info');

    try {
        const result = await fetchData(
            `${API_BASE}/fix-advance-payment`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    year: parseInt(year),
                    month: parseInt(month),
                    advanceEndDate,
                    paymentDate
                })
            },
            'reportStatus'
        );

        if (result.success) {
            showStatus('reportStatus',
                `✅ ${result.message}`,
                'success'
            );

            // Обновляем визуальное отображение с учетом увольнений
            tableRows.forEach(row => {
                const advanceCardCell = row.querySelector('.advance-payment-card');
                const advanceCashCell = row.querySelector('.advance-payment-cash');
                
                if (advanceCardCell) {
                    const cardSpan = advanceCardCell.querySelector('.advance-card-content');
                    if (cardSpan) {
                        const currentHTML = cardSpan.innerHTML;
                        // Добавляем замок если его еще нет и сумма > 0
                        if (!currentHTML.includes('🔒')) {
                            // Проверяем на увольнение
                            if (currentHTML.includes('🚪')) {
                                // Для увольнения добавляем замок после иконки двери
                                cardSpan.innerHTML = currentHTML.replace('🚪', '🚪 🔒');
                            } else if (currentHTML.includes('💳') && !currentHTML.includes('>0<')) {
                                cardSpan.innerHTML = currentHTML.replace('💳', '🔒 💳');
                            } else if (!currentHTML.includes('0') && !currentHTML.includes('>0<')) {
                                cardSpan.innerHTML = `🔒 ${currentHTML}`;
                            }
                        }
                    }
                }
                
                if (advanceCashCell) {
                    const cashSpan = advanceCashCell.querySelector('.advance-cash-content');
                    if (cashSpan) {
                        const currentHTML = cashSpan.innerHTML;
                        if (!currentHTML.includes('🔒')) {
                            if (currentHTML.includes('🚪')) {
                                cashSpan.innerHTML = currentHTML.replace('🚪', '🚪 🔒');
                            } else if (currentHTML.includes('💵') && !currentHTML.includes('>0<')) {
                                cashSpan.innerHTML = currentHTML.replace('💵', '🔒 💵');
                            } else if (!currentHTML.includes('0') && !currentHTML.includes('>0<')) {
                                cashSpan.innerHTML = `🔒 ${currentHTML}`;
                            }
                        }
                    }
                }
                
                // ВАЖНО: ПЕРЕСЧИТЫВАЕМ ИТОГОВУЮ СУММУ ДЛЯ КАЖДОЙ СТРОКИ!
                recalculateRow(row);
            });

            // Добавляем информационную панель (проверяем что её еще нет)
            const reportContent = document.getElementById('monthlyReportContent');
            if (reportContent && !document.getElementById('advance-fixed-notice')) {
                const noticeHtml = `
                <div id="advance-fixed-notice" class="status success" style="margin: 15px 0;">
                    <strong>🔒 Аванс зафиксирован!</strong><br>
                    Дата выплаты: ${paymentDate}<br>
                    Сотрудников: ${result.employeesCount}<br>
                    Общая сумма: ${formatNumber(result.totalAmount)} грн
                    <button onclick="cancelAdvancePayment()" class="danger" style="margin-left: 20px; padding: 5px 10px; font-size: 12px;">Отменить фиксацию</button>
                </div>
            `;
                reportContent.insertAdjacentHTML('afterbegin', noticeHtml);
            }
        }
    } catch (error) {
        console.error('Ошибка фиксации аванса:', error);
        if (error.message && error.message.includes('уже зафиксирован')) {
            showStatus('reportStatus',
                '⚠️ Аванс за этот период уже зафиксирован. Необходимо сначала отменить предыдущую фиксацию.',
                'warning'
            );
            setTimeout(() => {
                calculateAdvance15(true);
            }, 500);
        } else {
            showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
        }
    }
}


 // Функция отмены фиксации аванса
async function cancelAdvancePayment() {
    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;

    if (!year || !month) {
        showStatus('reportStatus', 'Сначала выберите период', 'error');
        return;
    }

    // Проверяем, есть ли зафиксированный аванс
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    let hasFixedAdvance = false;
    
    if (tableRows.length === 0) {
        showStatus('reportStatus', 'Сначала сформируйте отчет', 'info');
        return;
    }
    
    tableRows.forEach(row => {
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        if ((advanceCardCell && advanceCardCell.innerHTML.includes('🔒')) || 
            (advanceCashCell && advanceCashCell.innerHTML.includes('🔒'))) {
            hasFixedAdvance = true;
        }
    });

    if (!hasFixedAdvance) {
        showStatus('reportStatus', 'Нет зафиксированного аванса для отмены', 'info');
        return;
    }

    const cancellationReason = prompt(
        'Укажите причину отмены фиксации аванса:\n' +
        '(например: "Ошибка в расчете", "Изменение даты выплаты" и т.д.)'
    );

    if (!cancellationReason) {
        showStatus('reportStatus', 'Отмена не выполнена - не указана причина', 'info');
        return;
    }

    if (!confirm('Вы уверены, что хотите отменить фиксацию аванса?')) {
        return;
    }

    showStatus('reportStatus', 'Отменяем фиксацию аванса...', 'info');

    try {
        const result = await fetchData(
            `${API_BASE}/cancel-advance-payment`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    year: parseInt(year),
                    month: parseInt(month),
                    cancellationReason
                })
            },
            'reportStatus'
        );

        if (result.success) {
            showStatus('reportStatus', result.message, 'success');

            // ВАЖНО: Убираем визуальную индикацию фиксации из таблицы
            tableRows.forEach(row => {
                // Обработка колонки "Аванс (на карту)"
                const advanceCardCell = row.querySelector('.advance-payment-card');
                if (advanceCardCell) {
                    const cardSpan = advanceCardCell.querySelector('.advance-card-content');
                    if (cardSpan) {
                        let currentHTML = cardSpan.innerHTML;
                        // Убираем символ замка и пробелы
                        currentHTML = currentHTML.replace(/🔒\s*/g, '');
                        // Убираем дополнительные пробелы между иконками
                        currentHTML = currentHTML.replace(/\s+/g, ' ').trim();
                        cardSpan.innerHTML = currentHTML;
                    }
                }
                
                // Обработка колонки "Аванс (наличные)"
                const advanceCashCell = row.querySelector('.advance-payment-cash');
                if (advanceCashCell) {
                    const cashSpan = advanceCashCell.querySelector('.advance-cash-content');
                    if (cashSpan) {
                        let currentHTML = cashSpan.innerHTML;
                        // Убираем символ замка и пробелы
                        currentHTML = currentHTML.replace(/🔒\s*/g, '');
                        // Убираем дополнительные пробелы между иконками
                        currentHTML = currentHTML.replace(/\s+/g, ' ').trim();
                        cashSpan.innerHTML = currentHTML;
                    }
                }
                
                // Если есть старые ячейки .advance-payment (для совместимости)
                const oldAdvanceCell = row.querySelector('.advance-payment');
                if (oldAdvanceCell) {
                    let currentHTML = oldAdvanceCell.innerHTML;
                    currentHTML = currentHTML.replace(/🔒\s*/g, '');
                    currentHTML = currentHTML.replace(/<strong[^>]*>/g, '');
                    currentHTML = currentHTML.replace(/<\/strong>/g, '');
                    oldAdvanceCell.innerHTML = currentHTML;
                    oldAdvanceCell.style = '';
                }
            });

            // Убираем уведомление о фиксации
            const notice = document.getElementById('advance-fixed-notice');
            if (notice) {
                notice.remove();
            }

            // Убираем все другие возможные индикаторы фиксации
            const allFixedNotices = document.querySelectorAll('[id*="fixed"], .fixed-notice, .advance-fixed');
            allFixedNotices.forEach(el => el.remove());

            // ВАЖНО: Пересчитываем аванс заново
            setTimeout(() => {
                calculateAdvance15(true); // silent = true
            }, 500);
        }
    } catch (error) {
        console.error('Ошибка отмены фиксации:', error);
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Функция для показа диалога новых сотрудников
async function showNewEmployeesDialog(newEmployees, month, year) {
    // Создаем HTML для диалогового окна
    let dialogHTML = `
        <div id="newEmployeesModal" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        ">
            <div style="
                background: white;
                border-radius: 10px;
                padding: 20px;
                max-width: 800px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            ">
                <h2 style="color: #667eea; margin-bottom: 20px;">
                    ⚠️ Обнаружены сотрудники с малым количеством смен
                </h2>
                <p style="margin-bottom: 20px; color: #666;">
                    Следующие сотрудники отработали от 1 до 5 смен. Примите решение по каждому:
                </p>
                <div id="newEmployeesList">`;
    
    newEmployees.forEach((emp, index) => {
        dialogHTML += `
            <div class="employee-decision-block" data-employee-id="${emp.employee_id}" style="
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
                background: #f9f9f9;
            ">
                <h3 style="margin: 0 0 10px 0; color: #333;">
                    ${index + 1}. ${emp.employee_name} 
                    <span style="
                        background: #fff3cd;
                        color: #856404;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        margin-left: 10px;
                    ">${emp.shifts_count} ${emp.shifts_count === 1 ? 'СМЕНА' : 'СМЕНЫ'}</span>
                </h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
                    <div>💰 Начислено за ${emp.shifts_count} ${emp.shifts_count === 1 ? 'день' : 'дня'}: <strong>${formatNumber(emp.earned_amount)} грн</strong></div>
                    <div>📊 Расчетный аванс (90%): <strong>${formatNumber(Math.min(Math.floor(emp.earned_amount * 0.9 / 100) * 100, 7900))} грн</strong></div>
                </div>
                
                <div style="border-top: 1px solid #dee2e6; margin: 15px 0; padding-top: 15px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; margin-right: 15px;">
                            <input type="radio" name="advance_decision_${emp.employee_id}" value="none" checked>
                            ❌ Не начислять аванс (мало смен)
                        </label>
                        <label style="display: inline-block; margin-right: 15px;">
                            <input type="radio" name="advance_decision_${emp.employee_id}" value="auto">
                            ✅ Начислить автоматически (90%)
                        </label>
                        <label style="display: inline-block;">
                            <input type="radio" name="advance_decision_${emp.employee_id}" value="custom">
                            💰 Указать сумму вручную
                        </label>
                    </div>
                    
                    <div class="advance-inputs" style="display: none; margin-top: 10px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                    💳 На карту:
                                </label>
                                <input type="number" 
                                    class="advance-card-input" 
                                    min="0" 
                                    max="${Math.min(emp.earned_amount, 8600)}"
                                    value="0"
                                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                    💵 Наличными:
                                </label>
                                <input type="number" 
                                    class="advance-cash-input" 
                                    min="0"
                                    value="0"
                                    style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                            </div>
                        </div>
                        <div style="margin-top: 10px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                📝 Причина/комментарий:
                            </label>
                            <input type="text" 
                                class="advance-reason-input"
                                placeholder="Например: первые дни работы, болезнь и т.д."
                                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                        </div>
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <label style="
                            display: inline-flex;
                            align-items: center;
                            background: #e8f5e9;
                            padding: 8px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                        ">
                            <input type="checkbox" class="make-regular-checkbox" style="margin-right: 8px;">
                            🔄 Сделать постоянным сотрудником (больше не спрашивать при 1-5 сменах)
                        </label>
                    </div>
                </div>
            </div>`;
    });
    
    dialogHTML += `
                </div>
                <div style="
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 2px solid #e0e0e0;
                ">
                    <button onclick="cancelNewEmployeesDialog()" style="
                        padding: 10px 20px;
                        background: #6c757d;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">❌ Отмена</button>
                    <button onclick="applyNewEmployeesDecisions(${month}, ${year})" style="
                        padding: 10px 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: 600;
                    ">💾 Применить все решения</button>
                </div>
            </div>
        </div>`;
    
    // Добавляем диалог в DOM
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    
    // Добавляем обработчики для радио-кнопок
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const block = this.closest('.employee-decision-block');
            const advanceInputs = block.querySelector('.advance-inputs');
            if (this.value === 'custom') {
                advanceInputs.style.display = 'block';
            } else {
                advanceInputs.style.display = 'none';
            }
            
            // Если выбрано "автоматически", заполняем поля
            if (this.value === 'auto') {
                const empId = block.dataset.employeeId;
                const emp = newEmployees.find(e => e.employee_id === empId);
                if (emp) {
                    const autoAdvance = Math.min(Math.floor(emp.earned_amount * 0.9 / 100) * 100, 7900);
                    // Сохраняем значение в data-атрибуте для последующей обработки
                    block.dataset.autoAdvance = autoAdvance;
                }
            }
        });
    });
}

// Функция закрытия диалога
function cancelNewEmployeesDialog() {
    const modal = document.getElementById('newEmployeesModal');
    if (modal) modal.remove();
}

// Обновляем функцию применения решений
async function applyNewEmployeesDecisions(month, year) {
    const decisions = [];
    
    document.querySelectorAll('.employee-decision-block').forEach(block => {
        const employeeId = block.dataset.employeeId;
        const decision = block.querySelector(`input[name="advance_decision_${employeeId}"]:checked`).value;
        const makeRegular = block.querySelector('.make-regular-checkbox').checked;
        
        const data = {
            employee_id: employeeId,
            make_regular: makeRegular,
            decision: decision
        };
        
        if (decision === 'custom') {
            data.advance_card = parseFloat(block.querySelector('.advance-card-input').value) || 0;
            data.advance_cash = parseFloat(block.querySelector('.advance-cash-input').value) || 0;
            data.reason = block.querySelector('.advance-reason-input').value || '';
        } else if (decision === 'auto') {
            const emp = newEmployees.find(e => e.employee_id === employeeId);
            if (emp) {
                const autoAdvance = Math.min(Math.floor(emp.earned_amount * 0.9 / 100) * 100, 7900);
                data.advance_card = autoAdvance;
                data.advance_cash = 0;
                data.reason = 'Автоматический расчет 90%';
            }
        } else if (decision === 'none') {
            // Не начисляем аванс
            data.advance_card = 0;
            data.advance_cash = 0;
            data.reason = 'Аванс не начислен (мало смен)';
        }
        
        decisions.push(data);
    });
    
    try {
        const response = await fetch(`${API_BASE}/process-new-employees-advances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ month, year, decisions })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', result.message, 'success');
            
            // Закрываем диалог
            cancelNewEmployeesDialog();
            
            // Обновляем отображение в таблице
            setTimeout(() => {
                // Перезагружаем данные месяца для обновления таблицы
                generateMonthlyReport();
            }, 500);
        } else {
            showStatus('reportStatus', result.error || 'Ошибка применения решений', 'error');
        }
    } catch (error) {
        console.error('Ошибка применения решений:', error);
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}

async function fixManualAdvances() {
    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    
    if (!year || !month) {
        showStatus('reportStatus', 'Сначала выберите период', 'error');
        return;
    }
    
    const paymentDate = prompt('Укажите дату выплаты (ГГГГ-ММ-ДД):', new Date().toISOString().split('T')[0]);
    if (!paymentDate) return;
    
    try {
        const response = await fetch(`${API_BASE}/fix-manual-advances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ year, month, paymentDate })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', result.message, 'success');
            // Перезагружаем отчет для обновления замочков
            setTimeout(() => generateMonthlyReport(), 1000);
        } else {
            showStatus('reportStatus', result.message || 'Нет корректировок для фиксации', 'info');
        }
    } catch (error) {
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
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
        // Сохраняем все корректировки перед расчетом
        const savePromises = [];
        tableRows.forEach(row => savePromises.push(saveAdjustments(row)));
        await Promise.all(savePromises);

        // Отправляем запрос на сервер для финального расчета
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
                    // Обновляем отображение всех полей
                    const totalGrossCell = row.querySelector('.total-gross');
                    if (totalGrossCell) {
                        totalGrossCell.textContent = formatNumber(result.total_gross);
                    }

                    // ВАЖНО: Обновляем остаток на карту
                    const cardRemainderCell = row.querySelector('.card-remainder');
                    if (cardRemainderCell) {
                        cardRemainderCell.textContent = formatNumber(result.card_remainder);
                        // Визуальная индикация если остаток на карту > 0
                        if (result.card_remainder > 0) {
                            cardRemainderCell.style.fontWeight = 'bold';
                            cardRemainderCell.style.color = '#28a745'; // Зеленый цвет
                            cardRemainderCell.title = `Остаток к выплате на карту: ${formatNumber(result.card_remainder)} грн`;
                        } else {
                            cardRemainderCell.style.fontWeight = 'normal';
                            cardRemainderCell.style.color = '';
                            cardRemainderCell.title = '';
                        }
                    }

                    // ВАЖНО: Обновляем зарплату наличными
                    const cashPayoutCell = row.querySelector('.cash-payout');
                    if (cashPayoutCell) {
                        if (result.cash_payout > 0) {
                            cashPayoutCell.innerHTML = `<strong style="color: #007bff;">${formatNumber(result.cash_payout)}</strong>`;
                        } else {
                            cashPayoutCell.innerHTML = `<strong>${formatNumber(result.cash_payout)}</strong>`;
                        }
                    }

                    // ИСПРАВЛЕНИЕ: Итого к выплате = Остаток на карту + Наличные (БЕЗ аванса!)
                    const totalPayoutCell = row.querySelector('.total-payout');
                    if (totalPayoutCell) {
                        const remainingToPay = result.card_remainder + result.cash_payout;
                        totalPayoutCell.innerHTML = `<strong>${formatNumber(remainingToPay)}</strong>`;
                        
                        // Добавляем подсказку для ясности
                        totalPayoutCell.title = `Остаток к выплате: ${formatNumber(remainingToPay)} = ` +
                                              `Остаток на карту: ${formatNumber(result.card_remainder)} + ` +
                                              `Наличные: ${formatNumber(result.cash_payout)}`;
                        
                        // Проверка корректности
                        const expectedTotal = result.total_after_deductions - result.advance_payment;
                        if (Math.abs(remainingToPay - expectedTotal) > 0.01) {
                            console.warn(`Расхождение для ${employeeId}:`);
                            console.warn(`  Ожидалось: ${expectedTotal} (${result.total_after_deductions} - ${result.advance_payment})`);
                            console.warn(`  Получилось: ${remainingToPay} (${result.card_remainder} + ${result.cash_payout})`);
                            
                            const strongEl = totalPayoutCell.querySelector('strong');
                            if (strongEl) {
                                strongEl.style.color = '#ff6b6b';
                                strongEl.title += ' | ВНИМАНИЕ: возможна ошибка в расчете!';
                            }
                        }
                    }

                    // Добавляем data-атрибуты для экспорта
                    row.dataset.finalAdvance = result.advance_payment || 0;
                    row.dataset.finalCardRemainder = result.card_remainder || 0;
                    row.dataset.finalCash = result.cash_payout || 0;
                    row.dataset.finalTotal = result.card_remainder + result.cash_payout;

                    // ВАЖНО: Вызываем пересчет строки для обновления итогов
                    setTimeout(() => {
                        recalculateRow(row);
                    }, 100);
                }
            });

            // Показываем сводную информацию
            const totalEmployees = tableRows.length;
            let totalAdvance = 0;
            let totalCardRemainder = 0;
            let totalCash = 0;
            let totalRemaining = 0;
            let employeesWithCardRemainder = 0;
            let employeesWithCash = 0;

            tableRows.forEach(row => {
                const advance = parseFloat(row.dataset.finalAdvance) || 0;
                const cardRemainder = parseFloat(row.dataset.finalCardRemainder) || 0;
                const cash = parseFloat(row.dataset.finalCash) || 0;

                totalAdvance += advance;
                totalCardRemainder += cardRemainder;
                totalCash += cash;
                totalRemaining += (cardRemainder + cash);

                if (cardRemainder > 0) employeesWithCardRemainder++;
                if (cash > 0) employeesWithCash++;
            });

            const summaryMessage = `✅ Расчет выполнен для ${totalEmployees} сотрудников.\n` +
                `💳 Уже выплачено авансом: ${formatNumber(totalAdvance)} грн\n` +
                `💳 Остаток на карту у ${employeesWithCardRemainder} человек: ${formatNumber(totalCardRemainder)} грн\n` +
                `💵 Зарплата наличными у ${employeesWithCash} человек: ${formatNumber(totalCash)} грн\n` +
                `📊 ИТОГО к доплате: ${formatNumber(totalRemaining)} грн`;

            showStatus('reportStatus', summaryMessage, 'success');
        }
    } catch (error) {
        console.error('Ошибка при окончательном расчете:', error);
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
                        <thead class="monthly-report-head">
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
    if (tableRows.length === 0) { 
        return showStatus('reportStatus', 'Нет данных для печати', 'error'); 
    }
    
    const month = tableRows[0].dataset.month;
    const year = tableRows[0].dataset.year;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", 
                        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    let allPayslipsHTML = '';
    
    tableRows.forEach(row => {
        const employeeName = row.dataset.employeeName;
        const storeAddress = row.dataset.storeAddress;
        const basePay = parseFloat(row.dataset.basePay) || 0;
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        const bonus_reason = row.querySelector('[name="bonus_reason"]')?.value || '';
        const penalty_reason = row.querySelector('[name="penalty_reason"]')?.value || '';
        const totalGross = basePay + manualBonus;
        const totalDeductions = penalty + shortage;
        const totalToPay = totalGross - totalDeductions;
        
        // Получаем авансы раздельно
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        
        const advanceCard = parseFloat(advanceCardCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        const advanceCash = parseFloat(advanceCashCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        
        const cardRemainderAmount = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cashAmount = parseFloat(row.querySelector('.cash-payout')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        
        allPayslipsHTML += `<div class="payslip-compact">
            <h3>РАСЧЕТНЫЙ ЛИСТ</h3>
            <p><strong>Сотрудник:</strong> ${employeeName}</p>
            ${storeAddress !== 'Старший продавец' && storeAddress !== 'Не определен' ? 
                `<p><strong>Магазин:</strong> ${storeAddress}</p>` : ''}
            <p><strong>Период:</strong> ${monthNames[month - 1]} ${year}</p>
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
            
            <h4 style="margin: 10px 0 5px 0;">Начисления:</h4>
            <table>
                <tr><td>База (ставка + бонусы за смены):</td><td align="right">${formatNumber(basePay)} грн</td></tr>
                ${manualBonus > 0 ? `<tr><td>Премирование${bonus_reason ? ` (${bonus_reason})` : ''}:</td><td align="right" style="color: green;">+${formatNumber(manualBonus)} грн</td></tr>` : ''}
                <tr style="font-weight: bold;"><td>ВСЕГО НАЧИСЛЕНО:</td><td align="right">${formatNumber(totalGross)} грн</td></tr>
            </table>
            
            ${totalDeductions > 0 ? `
            <h4 style="margin: 10px 0 5px 0;">Удержания:</h4>
            <table>
                ${penalty > 0 ? `<tr><td>Депремирование${penalty_reason ? ` (${penalty_reason})` : ''}:</td><td align="right" style="color: red;">-${formatNumber(penalty)} грн</td></tr>` : ''}
                ${shortage > 0 ? `<tr><td>Вычет за недостачу:</td><td align="right" style="color: red;">-${formatNumber(shortage)} грн</td></tr>` : ''}
                <tr style="font-weight: bold;"><td>ВСЕГО УДЕРЖАНО:</td><td align="right" style="color: red;">-${formatNumber(totalDeductions)} грн</td></tr>
            </table>
            ` : ''}
            
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
            <table style="font-weight: bold; font-size: 11pt;">
                <tr><td>К ВЫПЛАТЕ ПОСЛЕ ВЫЧЕТОВ:</td><td align="right">${formatNumber(totalToPay)} грн</td></tr>
            </table>
            
            <h4 style="margin: 10px 0 5px 0;">Выплаты:</h4>
            <table>
                ${advanceCard > 0 ? `<tr><td>Аванс (на карту):</td><td align="right">${formatNumber(advanceCard)} грн</td></tr>` : ''}
                ${advanceCash > 0 ? `<tr><td>Аванс (наличными):</td><td align="right">${formatNumber(advanceCash)} грн</td></tr>` : ''}
                ${cardRemainderAmount > 0 ? `<tr><td>Остаток зарплаты (на карту):</td><td align="right">${formatNumber(cardRemainderAmount)} грн</td></tr>` : ''}
                ${cashAmount > 0 ? `<tr><td>Остаток зарплаты (наличными):</td><td align="right">${formatNumber(cashAmount)} грн</td></tr>` : ''}
            </table>
            
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 10px 0;">
            <p style="margin-top: 20px;">С расчетом ознакомлен(а): _________________________</p>
            <p style="font-size: 9pt; margin-top: 5px;">Дата: _______________ Подпись: _______________</p>
        </div>`;
    });
    
    // Создаем окно предпросмотра
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Расчетные листы - ${monthNames[month - 1]} ${year}</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    margin: 0;
                    padding: 10mm;
                }
                .payslip-compact { 
                    font-size: 10pt; 
                    min-height: 90mm;
                    max-height: 95mm;
                    box-sizing: border-box; 
                    padding: 10px;
                    margin-bottom: 10mm; 
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    page-break-inside: avoid; 
                }
                .payslip-compact:nth-child(3n) {
                    page-break-after: always;
                }
                .payslip-compact h3 { 
                    text-align: center; 
                    font-size: 12pt; 
                    margin-bottom: 10px;
                    text-decoration: underline;
                }
                .payslip-compact h4 { 
                    font-size: 10pt; 
                    margin: 10px 0 5px 0;
                    text-decoration: underline;
                }
                .payslip-compact table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin: 5px 0; 
                }
                .payslip-compact td { 
                    padding: 2px 0; 
                    font-size: 10pt;
                }
                @media print {
                    @page { 
                        size: A4; 
                        margin: 10mm; 
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                }
                .no-print {
                    margin: 20px 0;
                    text-align: center;
                    padding: 20px;
                    background: #f0f0f0;
                    border-radius: 10px;
                }
                @media print {
                    .no-print {
                        display: none;
                    }
                }
                button {
                    padding: 10px 20px;
                    font-size: 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border: none;
                    border-radius: 5px;
                    background: #667eea;
                    color: white;
                }
                button:hover {
                    background: #5a6edc;
                }
                button.close {
                    background: #dc3545;
                }
                button.close:hover {
                    background: #c82333;
                }
            </style>
        </head>
        <body>
            <div class="no-print">
                <h2>Предварительный просмотр расчетных листов</h2>
                <p>Всего листов: ${tableRows.length}</p>
                <button onclick="window.print()">🖨️ Печать</button>
                <button class="close" onclick="window.close()">❌ Закрыть</button>
            </div>
            <div id="print-area">${allPayslipsHTML}</div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ========== ФУНКЦИИ ДЛЯ ВКЛАДКИ "ФОНД ОПЛАТЫ ТРУДА" ==========

async function generateFotReport() {
    const yearEl = document.getElementById('fotReportYear');
    const monthEl = document.getElementById('fotReportMonth');
    const endDateEl = document.getElementById('fotReportEndDate');
    
    if (!yearEl || !monthEl || !endDateEl) {
        showStatus('fotReportStatus', 'Ошибка: не найдены элементы управления', 'error');
        return;
    }
    
    const year = yearEl.value;
    const month = monthEl.value;
    const reportEndDate = endDateEl.value;
    
    if (!year || !month || !reportEndDate) {
        showStatus('fotReportStatus', 'Пожалуйста, выберите месяц, год и дату расчета', 'error');
        return;
    }
    
    showStatus('fotReportStatus', 'Формирование отчета ФОТ...', 'info');
    
    const loader = document.getElementById('fotLoader');
    if (loader) loader.style.display = 'block';
    
    try {
        const response = await fetch(`${API_BASE}/get-fot-report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ year: parseInt(year), month: parseInt(month), reportEndDate })
        });
        
        const result = await response.json();
        
        if (result.success) {
            hideStatus('fotReportStatus');
            displayFotReport(result.rows);
            
            // Кэшируем данные для экспорта
            fotReportDataCache = result.rows;
        } else {
            showStatus('fotReportStatus', result.error || 'Ошибка формирования отчета', 'error');
        }
    } catch (error) {
        console.error('Ошибка при формировании отчета ФОТ:', error);
        showStatus('fotReportStatus', `Ошибка: ${error.message}`, 'error');
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function displayFotReport(rows) {
    const fotReportContent = document.getElementById('fotReportContent');
    if (!fotReportContent) return;
    
    // Показываем панели
    const summaryPanel = fotReportContent.querySelector('.summary-panel');
    const byStorePanel = document.getElementById('fotByStorePanel');
    
    if (summaryPanel) summaryPanel.style.display = 'block';
    if (byStorePanel) byStorePanel.style.display = 'block';
    
    // Считаем итоги
    let totalRevenue = 0;
    let totalFund = 0;
    
    rows.forEach(row => {
        totalRevenue += row.total_revenue || 0;
        totalFund += row.total_payout_with_tax || 0;
    });
    
    const fotPercentage = totalRevenue > 0 ? (totalFund / totalRevenue) * 100 : 0;
    
    // Обновляем итоговые суммы
    const totalRevenueEl = document.getElementById('fotTotalRevenue');
    const totalFundEl = document.getElementById('fotTotalFund');
    const percentageEl = document.getElementById('fotPercentage');
    
    if (totalRevenueEl) totalRevenueEl.textContent = formatNumber(totalRevenue) + ' грн';
    if (totalFundEl) totalFundEl.textContent = formatNumber(totalFund) + ' грн';
    if (percentageEl) percentageEl.textContent = fotPercentage.toFixed(2) + ' %';
    
    // Заполняем таблицу по магазинам
    const tbody = document.getElementById('fotByStoreTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Нет данных для отображения</td></tr>';
        return;
    }
    
    // Сортируем по адресу магазина
    rows.sort((a, b) => (a.store_address || '').localeCompare(b.store_address || ''));
    
    rows.forEach(row => {
        const tr = document.createElement('tr');
        
        // Определяем цвет для процента ФОТ
        let percentageClass = '';
        if (row.fot_percentage > 15) {
            percentageClass = 'style="color: #dc3545; font-weight: bold;"'; // Красный если > 15%
        } else if (row.fot_percentage > 12) {
            percentageClass = 'style="color: #ffc107; font-weight: bold;"'; // Желтый если > 12%
        } else {
            percentageClass = 'style="color: #28a745;"'; // Зеленый если <= 12%
        }
        
        tr.innerHTML = `
            <td>${row.store_address || 'Не указан'}</td>
            <td style="text-align: right;">${formatNumber(row.total_revenue || 0)} грн</td>
            <td style="text-align: right;">${formatNumber(row.total_payout_with_tax || 0)} грн</td>
            <td style="text-align: center;" ${percentageClass}>${(row.fot_percentage || 0).toFixed(2)}%</td>
        `;
        tbody.appendChild(tr);
    });
    
    // Добавляем итоговую строку
    tbody.innerHTML += `
        <tr class="summary-row" style="background-color: #f0f2f5; font-weight: bold;">
            <td>ИТОГО:</td>
            <td style="text-align: right;">${formatNumber(totalRevenue)} грн</td>
            <td style="text-align: right;">${formatNumber(totalFund)} грн</td>
            <td style="text-align: center; color: ${fotPercentage > 15 ? '#dc3545' : fotPercentage > 12 ? '#ffc107' : '#28a745'};">
                ${fotPercentage.toFixed(2)}%
            </td>
        </tr>
    `;
}

async function exportFotReportToExcel() {
    // Проверяем наличие данных
    if (!fotReportDataCache || fotReportDataCache.length === 0) {
        showStatus('fotReportStatus', 'Сначала сформируйте отчет', 'error');
        return;
    }
    
    const yearEl = document.getElementById('fotReportYear');
    const monthEl = document.getElementById('fotReportMonth');
    const year = yearEl ? yearEl.value : '';
    const month = monthEl ? monthEl.value : '';
    
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    // Подготавливаем данные для экспорта
    const exportData = fotReportDataCache.map(row => ({
        'Адрес магазина': row.store_address || 'Не указан',
        'Выручка магазина': row.total_revenue || 0,
        'Фонд оплаты труда (с налогами)': row.total_payout_with_tax || 0,
        'ФОТ %': (row.fot_percentage || 0).toFixed(2)
    }));
    
    // Считаем итоги
    let totalRevenue = 0;
    let totalFund = 0;
    
    fotReportDataCache.forEach(row => {
        totalRevenue += row.total_revenue || 0;
        totalFund += row.total_payout_with_tax || 0;
    });
    
    const fotPercentage = totalRevenue > 0 ? (totalFund / totalRevenue) * 100 : 0;
    
    // Добавляем итоговую строку
    exportData.push({
        'Адрес магазина': 'ИТОГО',
        'Выручка магазина': totalRevenue,
        'Фонд оплаты труда (с налогами)': totalFund,
        'ФОТ %': fotPercentage.toFixed(2)
    });
    
    // Создаем Excel файл
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Настраиваем ширину колонок
    ws['!cols'] = [
        { wch: 30 }, // Адрес магазина
        { wch: 20 }, // Выручка
        { wch: 25 }, // ФОТ
        { wch: 10 }  // Процент
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "ФОТ по магазинам");
    
    // Добавляем второй лист со сводкой
    const summaryData = [
        { 'Показатель': 'Период', 'Значение': `${monthNames[month - 1]} ${year}` },
        { 'Показатель': 'Общая выручка', 'Значение': formatNumber(totalRevenue) + ' грн' },
        { 'Показатель': 'Общий ФОТ (с налогами)', 'Значение': formatNumber(totalFund) + ' грн' },
        { 'Показатель': 'ФОТ % от выручки', 'Значение': fotPercentage.toFixed(2) + '%' },
        { 'Показатель': '', 'Значение': '' },
        { 'Показатель': 'Целевой показатель ФОТ', 'Значение': '12%' },
        { 'Показатель': 'Отклонение от цели', 'Значение': (fotPercentage - 12).toFixed(2) + '%' }
    ];
    
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    ws2['!cols'] = [{ wch: 25 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Сводка");
    
    // Сохраняем файл
    const fileName = `ФОТ_${monthNames[month - 1]}_${year}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showStatus('fotReportStatus', `✅ Экспорт выполнен: ${fileName}`, 'success');
}

// Функция очистки базы данных (для админов)
async function clearDatabase() {
    if (!confirm('ВНИМАНИЕ! Это действие удалит ВСЕ транзакционные данные (смены, расчеты, выручку). Продолжить?')) {
        return;
    }
    
    const confirmText = prompt('Введите "УДАЛИТЬ ВСЕ" для подтверждения:');
    if (confirmText !== 'УДАЛИТЬ ВСЕ') {
        showStatus('reportStatus', 'Операция отменена', 'info');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/clear-transactional-data`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', result.message, 'success');
            alert('Все транзакционные данные были удалены. Рекомендуется перезагрузить страницу.');
            setTimeout(() => location.reload(), 2000);
        } else {
            showStatus('reportStatus', result.error || 'Ошибка при очистке данных', 'error');
        }
    } catch (error) {
        console.error('Ошибка очистки БД:', error);
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}