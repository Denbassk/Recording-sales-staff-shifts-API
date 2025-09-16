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

    // Проверяем статус фиксации аванса
    let advanceFixedInfo = '';
    const advanceNotice = document.getElementById('advance-fixed-notice');
    if (advanceNotice) {
        const noticeText = advanceNotice.textContent;
        const dateMatch = noticeText.match(/Дата выплаты: ([\d-]+)/);
        const countMatch = noticeText.match(/Сотрудников: (\d+)/);
        const sumMatch = noticeText.match(/Общая сумма: ([\d\s,]+)/);
        
        if (dateMatch) {
            advanceFixedInfo = `АВАНС ЗАФИКСИРОВАН! Дата выплаты: ${dateMatch[1]}`;
            if (countMatch) advanceFixedInfo += `, Сотрудников: ${countMatch[1]}`;
            if (sumMatch) advanceFixedInfo += `, Сумма: ${sumMatch[1]}`;
        }
    }

    // Собираем данные из таблицы с ПРАВИЛЬНЫМИ РАСЧЕТАМИ
    const exportData = [];
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", 
                       "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    tableRows.forEach(row => {
        if (row.classList.contains('summary-row')) return;
        
        // Получаем все значения
        const basePay = parseFloat(row.dataset.basePay) || 0;
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        
        // Расчеты
        const totalGross = basePay + manualBonus; // Всего начислено
        const totalAfterDeductions = totalGross - penalty - shortage; // После вычетов
        
        // Проверяем фиксацию аванса
        const advanceCell = row.querySelector('.advance-payment');
        const isAdvanceFixed = advanceCell && advanceCell.innerHTML.includes('🔒');
        const advanceAmount = parseFloat(advanceCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        
        // Остаток на карту и наличные
        const cardRemainder = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cashAmount = parseFloat(row.querySelector('.cash-payout strong')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        
        // Общая сумма на карту
        const totalCardPayment = advanceAmount + cardRemainder;
        
        const rowData = {
            'Сотрудник': row.dataset.employeeName || '',
            'Магазин': row.dataset.storeAddress || '',
            'Месяц': `${monthNames[month - 1]} ${year}`,
            'База начислений': basePay,
            'Премирование': manualBonus,
            'Причина премии': row.querySelector('[name="bonus_reason"]')?.value || '',
            'Всего начислено': totalGross,
            'Депремирование': penalty,
            'Причина депремирования': row.querySelector('[name="penalty_reason"]')?.value || '',
            'Вычет за недостачу': shortage,
            'Всего вычетов': penalty + shortage,
            'К выплате после вычетов': totalAfterDeductions,
            'Аванс (на карту)': advanceAmount,
            'Статус аванса': isAdvanceFixed ? '🔒 ЗАФИКСИРОВАН' : 'Расчетный',
            'Остаток (на карту)': cardRemainder,
            'ИТОГО на карту': totalCardPayment,
            'Зарплата (наличными)': cashAmount,
            'ИТОГО к выплате': totalAfterDeductions,
            'Проверка расчета': (totalCardPayment + cashAmount === totalAfterDeductions) ? '✓' : '❌ ОШИБКА',
            'Рабочие дни': JSON.parse(row.dataset.shifts || '[]').join(', ')
        };
        
        exportData.push(rowData);
    });

    // Создаем рабочую книгу
    const wb = XLSX.utils.book_new();
    
    // ЛИСТ 1: Детальный отчет
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Настраиваем ширину колонок
    ws['!cols'] = [
        { wch: 25 }, // Сотрудник
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
        { wch: 14 }, // Аванс
        { wch: 18 }, // Статус аванса
        { wch: 14 }, // Остаток на карту
        { wch: 14 }, // ИТОГО на карту
        { wch: 15 }, // Наличными
        { wch: 15 }, // ИТОГО к выплате
        { wch: 15 }, // Проверка
        { wch: 20 }  // Рабочие дни
    ];
    
    // Добавляем условное форматирование для выделения важных колонок
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        // Выделяем колонку "Остаток на карту" если > 0
        const cardRemainderCell = XLSX.utils.encode_cell({r: R, c: 14});
        if (ws[cardRemainderCell] && ws[cardRemainderCell].v > 0) {
            if (!ws[cardRemainderCell].s) ws[cardRemainderCell].s = {};
            ws[cardRemainderCell].s.font = { bold: true, color: { rgb: "008000" } };
            ws[cardRemainderCell].s.fill = { fgColor: { rgb: "E8F5E9" } };
        }
        
        // Выделяем колонку "ИТОГО на карту" если = 8600
        const totalCardCell = XLSX.utils.encode_cell({r: R, c: 15});
        if (ws[totalCardCell] && ws[totalCardCell].v >= 8600) {
            if (!ws[totalCardCell].s) ws[totalCardCell].s = {};
            ws[totalCardCell].s.font = { bold: true, color: { rgb: "FF6600" } };
            ws[totalCardCell].s.fill = { fgColor: { rgb: "FFF3E0" } };
        }
    }
    
    XLSX.utils.book_append_sheet(wb, ws, "Детальный отчет");
    
    // ЛИСТ 2: Сводка по выплатам
    const paymentSummary = [];
    let totalAdvance = 0;
    let totalCardRemainder = 0;
    let totalCash = 0;
    let totalCardPayments = 0;
    let employeesWithMaxCard = 0;
    let employeesWithCardRemainder = 0;
    
    exportData.forEach(row => {
        totalAdvance += row['Аванс (на карту)'];
        totalCardRemainder += row['Остаток (на карту)'];
        totalCash += row['Зарплата (наличными)'];
        totalCardPayments += row['ИТОГО на карту'];
        
        if (row['ИТОГО на карту'] >= 8600) employeesWithMaxCard++;
        if (row['Остаток (на карту)'] > 0) employeesWithCardRemainder++;
    });
    
    paymentSummary.push(
        { 'Показатель': 'Период', 'Значение': `${monthNames[month - 1]} ${year}` },
        { 'Показатель': 'Всего сотрудников', 'Значение': exportData.length },
        { 'Показатель': '═══════════════════════', 'Значение': '═══════════════════════' },
        { 'Показатель': 'АВАНСОВЫЕ ВЫПЛАТЫ', 'Значение': '' },
        { 'Показатель': 'Статус авансов', 'Значение': advanceFixedInfo ? '🔒 ЗАФИКСИРОВАНЫ' : 'Расчетные' },
        { 'Показатель': 'Общая сумма авансов', 'Значение': totalAdvance.toFixed(2) + ' грн' },
        { 'Показатель': 'Средний аванс', 'Значение': (totalAdvance / exportData.length).toFixed(2) + ' грн' },
        { 'Показатель': '═══════════════════════', 'Значение': '═══════════════════════' },
        { 'Показатель': 'ОСТАТОК НА КАРТУ', 'Значение': '' },
        { 'Показатель': 'Сотрудников с остатком на карту', 'Значение': employeesWithCardRemainder },
        { 'Показатель': 'Общая сумма остатков на карту', 'Значение': totalCardRemainder.toFixed(2) + ' грн' },
        { 'Показатель': '═══════════════════════', 'Значение': '═══════════════════════' },
        { 'Показатель': 'ИТОГОВЫЕ ВЫПЛАТЫ', 'Значение': '' },
        { 'Показатель': 'Всего на карты (аванс + остаток)', 'Значение': totalCardPayments.toFixed(2) + ' грн' },
        { 'Показатель': 'Сотрудников с максимальной картой (8600)', 'Значение': employeesWithMaxCard },
        { 'Показатель': 'Всего наличными', 'Значение': totalCash.toFixed(2) + ' грн' },
        { 'Показатель': 'ИТОГО ВСЕ ВЫПЛАТЫ', 'Значение': (totalCardPayments + totalCash).toFixed(2) + ' грн' }
    );
    
    const ws2 = XLSX.utils.json_to_sheet(paymentSummary);
    ws2['!cols'] = [{ wch: 40 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Сводка по выплатам");
    
    // ЛИСТ 3: Проверочный лист (для бухгалтерии)
    const verificationData = exportData.map(row => ({
        'Сотрудник': row['Сотрудник'],
        'Начислено': row['Всего начислено'],
        'Вычеты': row['Всего вычетов'],
        'К выплате': row['К выплате после вычетов'],
        'На карту': row['ИТОГО на карту'],
        'Наличными': row['Зарплата (наличными)'],
        'Сумма сходится': row['Проверка расчета'],
        'Карта = лимит?': row['ИТОГО на карту'] >= 8600 ? 'ДА (8600)' : `НЕТ (${row['ИТОГО на карту']})`
    }));
    
    const ws3 = XLSX.utils.json_to_sheet(verificationData);
    ws3['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws3, "Проверка расчетов");
    
    // Сохраняем файл
    const fileName = `Отчет_${monthNames[month - 1]}_${year}_полный${advanceFixedInfo ? '_аванс_зафиксирован' : ''}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    showStatus('reportStatus', `✅ Экспорт выполнен: ${fileName}`, 'success');
}


function exportFotReportToExcel() {
    const monthEl = document.getElementById('fotReportMonth');
    const yearEl = document.getElementById('fotReportYear');
    const month = monthEl ? monthEl.value : '';
    const year = yearEl ? yearEl.value : '';
    
    if (!month || !year) {
        showStatus('fotReportStatus', 'Сначала сформируйте отчет', 'error');
        return;
    }

    const tbody = document.getElementById('fotByStoreTableBody');
    if (!tbody || tbody.children.length === 0 || fotReportDataCache.length === 0) {
        showStatus('fotReportStatus', 'Нет данных для экспорта', 'error');
        return;
    }

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", 
                       "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    // Основные данные по магазинам
    const exportData = fotReportDataCache.map(data => ({
        'Магазин': data.store_address,
        'Месяц': `${monthNames[month - 1]} ${year}`,
        'Выручка магазина': data.total_revenue,
        'Фонд оплаты труда (с налогом 22%)': data.total_payout_with_tax,
        'ФОТ %': data.fot_percentage
    }));

    // Считаем итоги
    const totals = fotReportDataCache.reduce((acc, data) => {
        acc.revenue += data.total_revenue;
        acc.fot += data.total_payout_with_tax;
        return acc;
    }, { revenue: 0, fot: 0 });
    
    const totalFotPercentage = totals.revenue > 0 ? (totals.fot / totals.revenue) * 100 : 0;

    // Добавляем итоговую строку
    exportData.push({
        'Магазин': 'ИТОГО ПО ВСЕМ МАГАЗИНАМ:',
        'Месяц': '',
        'Выручка магазина': totals.revenue,
        'Фонд оплаты труда (с налогом 22%)': totals.fot,
        'ФОТ %': totalFotPercentage
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    ws['!cols'] = [
        { wch: 30 }, // Магазин
        { wch: 15 }, // Месяц
        { wch: 20 }, // Выручка
        { wch: 25 }, // ФОТ
        { wch: 10 }  // ФОТ %
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "ФОТ по магазинам");
    
    // Добавляем лист с детальной информацией
    const detailSheet = [
        ['Отчет по фонду оплаты труда'],
        [''],
        ['Период:', `${monthNames[month - 1]} ${year}`],
        ['Дата формирования:', new Date().toLocaleDateString('ru-RU')],
        [''],
        ['Общая выручка:', `${formatNumber(totals.revenue)} грн`],
        ['Общий ФОТ (с налогом 22%):', `${formatNumber(totals.fot)} грн`],
        ['ФОТ % от выручки:', `${formatNumber(totalFotPercentage)}%`],
        [''],
        ['Налоговая ставка:', '22%'],
        ['Лимит выплат на карту:', '8600 грн']
    ];
    
    const ws2 = XLSX.utils.aoa_to_sheet(detailSheet);
    ws2['!cols'] = [{ wch: 30 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Сводная информация");
    
    const fileName = `ФОТ_${monthNames[month - 1]}_${year}.xlsx`;
    XLSX.writeFile(wb, fileName);
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
    
    // НОВОЕ: Создаем мапу финальных расчетов
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
                    <th rowspan="2" style="vertical-align: middle;">Остаток<br/>(на карту)</th>
                    <th rowspan="2" style="vertical-align: middle;">Зарплата<br/>(наличными)</th>
                    <th rowspan="2" style="vertical-align: middle;">Итого<br/>к выплате</th>
                    <th rowspan="2" style="vertical-align: middle;">Рабочие<br/>дни</th>
                </tr>
                <tr><th>Сумма</th><th>Причина</th><th>Сумма</th><th>Причина</th></tr>
            </thead>
            <tbody>`;
    
    if (sortedEmployees.length === 0) {
        tableHtml += '<tr><td colspan="13" style="text-align: center; padding: 20px;">Нет данных для отображения за выбранный период.</td></tr>';
    } else {
        for (const [id, data] of sortedEmployees) {
            const adj = adjustmentsMap.get(id) || { manual_bonus: 0, penalty: 0, shortage: 0, bonus_reason: '', penalty_reason: '' };
            
            // НОВОЕ: Получаем финальный расчет если он есть
            const finalCalc = finalCalcMap.get(id);
            
            // Расчет итоговой суммы
            const totalGross = data.totalPay + (adj.manual_bonus || 0);
            const totalDeductions = (adj.penalty || 0) + (adj.shortage || 0);
            const totalToPay = totalGross - totalDeductions;
            
            // НОВОЕ: Используем сохраненные данные из финального расчета, если они есть
            let advancePayment = 0;
            let cardRemainder = 0;
            let cashPayout = 0;
            
            if (finalCalc) {
                // Если есть финальный расчет, берем данные из него
                advancePayment = finalCalc.advance_payment || 0;
                cardRemainder = finalCalc.card_remainder || 0;
                cashPayout = finalCalc.cash_payout || 0;
                
                console.log(`Для ${data.name} загружены финальные данные: аванс=${advancePayment}, остаток=${cardRemainder}, наличные=${cashPayout}`);
            }
            
            // Добавляем класс для выделения если есть финальный расчет
            const rowClass = finalCalc ? 'has-final-calc' : '';
            
            tableHtml += `<tr class="${rowClass}" data-employee-id="${id}" data-employee-name="${data.name}" data-store-address="${data.primaryStore}" data-month="${month}" data-year="${year}" data-base-pay="${data.totalPay}" data-shifts='${JSON.stringify(data.shifts)}'>
                <td style="padding: 5px;">${data.name}</td>
                <td style="padding: 5px; font-size: 10px;">${data.primaryStore}</td>
                <td class="total-gross" style="padding: 5px;">${formatNumber(totalGross)}</td>
                <td style="padding: 5px;"><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus || 0}" style="width: 70px;"></td>
                <td style="padding: 5px;"><input type="text" class="adjustment-input" name="bonus_reason" value="${adj.bonus_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
                <td style="padding: 5px;"><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty || 0}" style="width: 70px;"></td>
                <td style="padding: 5px;"><input type="text" class="adjustment-input" name="penalty_reason" value="${adj.penalty_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
                <td style="padding: 5px;"><input type="number" class="adjustment-input" name="shortage" value="${adj.shortage || 0}" style="width: 70px;"></td>
                <td class="advance-payment" style="padding: 5px; ${advancePayment > 0 ? 'font-weight: bold;' : ''}">${formatNumber(advancePayment)}</td>
                <td class="card-remainder" style="padding: 5px; ${cardRemainder > 0 ? 'color: #28a745; font-weight: bold;' : ''}">${formatNumber(cardRemainder)}</td>
                <td class="cash-payout" style="padding: 5px;"><strong style="${cashPayout > 0 ? 'color: #007bff;' : ''}">${formatNumber(cashPayout)}</strong></td>
                <td class="total-payout" style="padding: 5px;"><strong>${formatNumber(totalToPay)}</strong></td>
                <td style="padding: 5px; font-size: 10px;">${data.shifts.sort((a, b) => a - b).join(', ')}</td>
            </tr>`;
        }
    }
    
    tableHtml += `</tbody></table></div>`;
    
    // Добавляем информационную панель если есть финальные расчеты
    if (finalCalcMap.size > 0) {
        const totalAdvance = Array.from(finalCalcMap.values()).reduce((sum, calc) => sum + (calc.advance_payment || 0), 0);
        const totalCardRemainder = Array.from(finalCalcMap.values()).reduce((sum, calc) => sum + (calc.card_remainder || 0), 0);
        const totalCash = Array.from(finalCalcMap.values()).reduce((sum, calc) => sum + (calc.cash_payout || 0), 0);
        
        tableHtml = `
            <div class="status info" style="margin-bottom: 15px;">
                <strong>ℹ️ Загружены финальные расчеты</strong><br>
                Аванс: ${formatNumber(totalAdvance)} грн | 
                Остаток на карту: ${formatNumber(totalCardRemainder)} грн | 
                Наличные: ${formatNumber(totalCash)} грн
            </div>
        ` + tableHtml;
    }
    
    reportContentEl.innerHTML = tableHtml;
    
    // Привязываем обработчики событий
    document.querySelectorAll('.adjustment-input').forEach(input => {
        input.addEventListener('input', handleAdjustmentInput);
    });
    
    // Если есть сотрудники и нет финальных расчетов, пробуем рассчитать аванс
    if (sortedEmployees.length > 0 && finalCalcMap.size === 0) {
        console.log('Финальных расчетов нет, выполняем расчет аванса...');
        calculateAdvance15(true);
    } else if (finalCalcMap.size > 0) {
        console.log('Финальные расчеты загружены, пропускаем автоматический расчет аванса');
        
        // Проверяем и отображаем информацию о зафиксированных авансах
        const hasFixedAdvances = Array.from(finalCalcMap.values()).some(calc => calc.advance_payment > 0);
        if (hasFixedAdvances) {
            // Обновляем визуальное отображение зафиксированных авансов
            document.querySelectorAll('#monthlyReportTable tbody tr').forEach(row => {
                const employeeId = row.dataset.employeeId;
                const finalCalc = finalCalcMap.get(employeeId);
                if (finalCalc && finalCalc.advance_payment > 0) {
                    const advanceCell = row.querySelector('.advance-payment');
                    if (advanceCell) {
                        // Проверяем, зафиксирован ли аванс (можно добавить дополнительное поле в БД)
                        // Пока просто показываем, что аванс есть
                        advanceCell.innerHTML = `<strong>${formatNumber(finalCalc.advance_payment)}</strong>`;
                    }
                }
            });
        }
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
            
            tableRows.forEach(row => {
                const employeeId = row.dataset.employeeId;
                const result = data.results[employeeId];
                const advanceCell = row.querySelector('.advance-payment');
                
                if (advanceCell && result) {
                    // Сначала устанавливаем значение
                    advanceCell.textContent = formatNumber(result.advance_payment);
                    
                    // Затем добавляем визуальную индикацию, если аванс зафиксирован
                    if (result.is_fixed) {
                        advanceCell.innerHTML = `<strong style="color: #f5576c;">🔒 ${formatNumber(result.advance_payment)}</strong>`;
                        hasFixedAdvances = true;
                    } else {
                        // Убираем стили если аванс не зафиксирован
                        advanceCell.style = '';
                        advanceCell.innerHTML = formatNumber(result.advance_payment);
                    }
                } else if (advanceCell) {
                    // Если нет результата, очищаем ячейку
                    advanceCell.textContent = formatNumber(0);
                    advanceCell.innerHTML = formatNumber(0);
                    advanceCell.style = '';
                }
            });

            // Показываем соответствующее сообщение
            if (hasFixedAdvances || data.hasFixedAdvances) {
                if (!silent) {
                    showStatus('reportStatus', '✅ Аванс рассчитан. Используются зафиксированные выплаты.', 'success');
                }
                
                // Если есть зафиксированные авансы и нет панели - добавляем её
                const reportContent = document.getElementById('monthlyReportContent');
                if (reportContent && !document.getElementById('advance-fixed-notice') && hasFixedAdvances) {
                    // Считаем общую сумму зафиксированных авансов
                    let totalFixedAmount = 0;
                    let fixedCount = 0;
                    tableRows.forEach(row => {
                        const advanceCell = row.querySelector('.advance-payment');
                        if (advanceCell && advanceCell.innerHTML.includes('🔒')) {
                            const amount = parseFloat(advanceCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
                            totalFixedAmount += amount;
                            fixedCount++;
                        }
                    });
                    
                    const noticeHtml = `
                        <div id="advance-fixed-notice" class="status success" style="margin: 15px 0;">
                            <strong>🔒 Аванс зафиксирован!</strong><br>
                            Сотрудников: ${fixedCount}<br>
                            Общая сумма: ${formatNumber(totalFixedAmount)} грн
                            <button onclick="cancelAdvancePayment()" class="danger" style="margin-left: 20px; padding: 5px 10px; font-size: 12px;">Отменить фиксацию</button>
                        </div>
                    `;
                    reportContent.insertAdjacentHTML('afterbegin', noticeHtml);
                }
            } else if (!silent) {
                showStatus('reportStatus', '✅ Аванс успешно рассчитан. ⚠️ Не забудьте зафиксировать выплату!', 'warning');
            }
        }
    } catch (error) {
        console.error('Ошибка расчета аванса:', error);
        if (!silent) {
            showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
        }
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

    // НОВОЕ: Проверяем, не зафиксирован ли уже аванс
    let alreadyFixed = false;
    tableRows.forEach(row => {
        const advanceCell = row.querySelector('.advance-payment');
        if (advanceCell && advanceCell.innerHTML.includes('🔒')) {
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
        const advanceCell = row.querySelector('.advance-payment');
        if (advanceCell) {
            const advanceText = advanceCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
            const advanceAmount = parseFloat(advanceText) || 0;
            if (advanceAmount > 0) {
                hasAdvance = true;
                totalAdvanceAmount += advanceAmount;
                employeesWithAdvance++;
            }
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
            
            // Обновляем визуальное отображение
            tableRows.forEach(row => {
                const advanceCell = row.querySelector('.advance-payment');
                if (advanceCell) {
                    const currentValue = advanceCell.textContent;
                    const amount = parseFloat(currentValue.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
                    if (amount > 0) {
                        advanceCell.innerHTML = `<strong style="color: #f5576c;">🔒 ${currentValue}</strong>`;
                    }
                }
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
        // Если ошибка о дубликате
        if (error.message && error.message.includes('уже зафиксирован')) {
            showStatus('reportStatus', 
                '⚠️ Аванс за этот период уже зафиксирован. Необходимо сначала отменить предыдущую фиксацию.', 
                'warning'
            );
            // Обновляем визуальное отображение чтобы показать что аванс зафиксирован
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
        showStatus('reportStatus', 'Не указан период', 'error');
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
            const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
            tableRows.forEach(row => {
                const advanceCell = row.querySelector('.advance-payment');
                if (advanceCell) {
                    // Получаем числовое значение без символов
                    const amount = advanceCell.textContent.replace(/[^0-9,]/g, '');
                    // Убираем стили и символ блокировки
                    advanceCell.innerHTML = amount;
                    advanceCell.style = ''; // Сбрасываем все стили
                }
            });
            
            // Убираем уведомление о фиксации
            const notice = document.getElementById('advance-fixed-notice');
            if (notice) {
                notice.remove();
            }
            
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
                    
                    const advanceCell = row.querySelector('.advance-payment');
                    if (advanceCell) {
                        advanceCell.textContent = formatNumber(result.advance_payment);
                        // Сохраняем индикацию фиксации если была
                        if (advanceCell.innerHTML.includes('🔒')) {
                            advanceCell.innerHTML = `<strong style="color: #f5576c;">🔒 ${formatNumber(result.advance_payment)}</strong>`;
                        }
                    }
                    
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
                    
                    const cashPayoutCell = row.querySelector('.cash-payout strong');
                    if (cashPayoutCell) {
                        cashPayoutCell.textContent = formatNumber(result.cash_payout);
                        // Подсветка если есть наличные к выплате
                        if (result.cash_payout > 0) {
                            cashPayoutCell.style.color = '#007bff'; // Синий цвет
                        }
                    }

                    // Правильный расчет итоговой суммы к выплате
                    const totalPayoutCell = row.querySelector('.total-payout strong');
                    if (totalPayoutCell) {
                        // Используем total_after_deductions если есть, иначе считаем сами
                        let totalToPay = 0;
                        if (result.total_after_deductions !== undefined) {
                            totalToPay = result.total_after_deductions;
                        } else {
                            // Fallback расчет на случай если сервер не вернул это поле
                            const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
                            const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
                            totalToPay = result.total_gross - penalty - shortage;
                        }
                        totalPayoutCell.textContent = formatNumber(totalToPay);
                        
                        // Проверка корректности расчета
                        const calculatedTotal = result.advance_payment + result.card_remainder + result.cash_payout;
                        const difference = Math.abs(calculatedTotal - totalToPay);
                        
                        if (difference > 0.01) { // Допускаем погрешность в 1 копейку
                            console.warn(`Расхождение в расчете для ${employeeId}: итого ${totalToPay}, сумма частей ${calculatedTotal}`);
                            totalPayoutCell.style.color = '#ff6b6b'; // Красный если есть расхождение
                            totalPayoutCell.title = `Внимание: возможна ошибка в расчете! Проверьте суммы.`;
                        } else {
                            totalPayoutCell.style.color = '';
                            totalPayoutCell.title = '';
                        }
                    }
                    
                    // Добавляем data-атрибуты для экспорта
                    row.dataset.finalAdvance = result.advance_payment || 0;
                    row.dataset.finalCardRemainder = result.card_remainder || 0;
                    row.dataset.finalCash = result.cash_payout || 0;
                    row.dataset.finalTotal = result.total_after_deductions || 0;
                }
            });
            
            // Показываем сводную информацию
            const totalEmployees = tableRows.length;
            let totalAdvance = 0;
            let totalCardRemainder = 0;
            let totalCash = 0;
            let employeesWithCardRemainder = 0;
            
            tableRows.forEach(row => {
                const advance = parseFloat(row.dataset.finalAdvance) || 0;
                const cardRemainder = parseFloat(row.dataset.finalCardRemainder) || 0;
                const cash = parseFloat(row.dataset.finalCash) || 0;
                
                totalAdvance += advance;
                totalCardRemainder += cardRemainder;
                totalCash += cash;
                
                if (cardRemainder > 0) employeesWithCardRemainder++;
            });
            
            const summaryMessage = `✅ Расчет выполнен для ${totalEmployees} сотрудников.\n` +
                `💳 Остаток на карту у ${employeesWithCardRemainder} человек на сумму ${formatNumber(totalCardRemainder)} грн\n` +
                `💵 Наличными: ${formatNumber(totalCash)} грн`;
            
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
        .payslip-compact { font-size: 9pt; height: 30%; box-sizing: border-box; padding-bottom: 5mm; margin-bottom: 5mm; border-bottom: 2px dashed #999; page-break-inside: avoid; }
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
    
    const summaryPanel = contentEl.querySelector('.summary-panel');
    const storePanel = document.getElementById('fotByStorePanel');
    if (summaryPanel) summaryPanel.style.display = 'none';
    if (storePanel) storePanel.style.display = 'none';

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
            fotReportDataCache = result.rows;
            const reportData = result.rows;

            const fotByStoreBody = document.getElementById('fotByStoreTableBody');
            if (fotByStoreBody) fotByStoreBody.innerHTML = ''; 
            
            if (reportData.length === 0) {
                if (fotByStoreBody) fotByStoreBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Нет данных для расчета за выбранный период.</td></tr>';
                if (summaryPanel) summaryPanel.style.display = 'none';
                if (storePanel) storePanel.style.display = 'block';
                return;
            } 
            
            if (summaryPanel) summaryPanel.style.display = 'block';
            if (storePanel) storePanel.style.display = 'block';
            
            let grandTotalRevenue = 0;
            let grandTotalFotFund = 0;

            reportData.sort((a, b) => a.store_address.localeCompare(b.store_address)).forEach(data => {
                const row = `
                    <tr>
                        <td>${data.store_address}</td>
                        <td>${formatNumber(data.total_revenue)} грн</td>
                        <td>${formatNumber(data.total_payout_with_tax)} грн</td>
                        <td><strong>${formatNumber(data.fot_percentage)} %</strong></td>
                    </tr>
                `;
                if (fotByStoreBody) fotByStoreBody.innerHTML += row;
                grandTotalRevenue += data.total_revenue;
                grandTotalFotFund += data.total_payout_with_tax;
            });
            
            const grandTotalFotPercentage = grandTotalRevenue > 0 ? (grandTotalFotFund / grandTotalRevenue) * 100 : 0;
            document.getElementById('fotTotalRevenue').textContent = `${formatNumber(grandTotalRevenue)} грн`;
            document.getElementById('fotTotalFund').textContent = `${formatNumber(grandTotalFotFund)} грн`;
            document.getElementById('fotPercentage').textContent = `${formatNumber(grandTotalFotPercentage)} %`;
        }
    } catch (error) {
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

async function clearDatabase() {
  const firstConfirm = confirm("ВНИМАНИЕ!\nВы собираетесь удалить все данные о сменах, расчетах зарплаты и выручке. Эта операция необратима.\n\nВы уверены, что хотите продолжить?");
  if (!firstConfirm) {
    showStatus('reportStatus', 'Очистка данных отменена.', 'info');
    return;
  }
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
      document.getElementById('monthlyReportContent').innerHTML = '';
    }
  } catch (error) {
  }
}