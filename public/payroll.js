// API URL Configuration
window.API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://shifts-api.fly.dev';
const API_BASE = window.API_BASE;

// --- Глобальная переменная для кэширования данных отчета ФОТ ---
let fotReportDataCache = [];

// --- КОНСТАНТЫ (лимиты теперь загружаются динамически из API) ---
const FIXED_CARD_PAYMENT = 8700;      // Дефолтный лимит на карту (используется как fallback)
const ADVANCE_PERCENTAGE = 0.9;       // 90% для расчета аванса
// MAX_ADVANCE убран - теперь используются динамические лимиты из API
const ADVANCE_PERIOD_DAYS = 15;       // Период для аванса
const ASSUMED_WORK_DAYS_IN_FIRST_HALF = 12;

// --- КЭШ ЛИМИТОВ СОТРУДНИКОВ ---
const employeeLimitsCache = new Map();

// --- ФУНКЦИЯ ПОЛУЧЕНИЯ ДИНАМИЧЕСКИХ ЛИМИТОВ СОТРУДНИКА ---
async function getEmployeeLimits(employeeId) {
    // Проверяем кэш
    if (employeeLimitsCache.has(employeeId)) {
        return employeeLimitsCache.get(employeeId);
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/get-employee-card-limit/${employeeId}`, {
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success && result.limits) {
            employeeLimitsCache.set(employeeId, result.limits);
            return result.limits;
        }
    } catch (error) {
        console.error(`Ошибка получения лимитов для ${employeeId}:`, error);
    }
    
    // Fallback - стандартный лимит
    const defaultLimits = { 
        cardLimit: 8700, 
        maxAdvance: 7900, 
        advancePercentage: 0.9, 
        limitName: 'Обычная карта',
        limitTypeId: 1
    };
    employeeLimitsCache.set(employeeId, defaultLimits);
    return defaultLimits;
}

// --- Функция очистки кэша лимитов ---
function clearLimitsCache() {
    employeeLimitsCache.clear();
    console.log('Кэш лимитов очищен');
}

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

        // ИСПРАВЛЕНИЕ: Убрали дублирование
        if (data.success && data.user) {
            const isAdmin = data.user.role === 'admin';
            const isAccountant = data.user.role === 'accountant';

            // ФОТ - только для админа
            const fotTabButton = document.getElementById('fot-tab-button');
            if (fotTabButton) {
                fotTabButton.style.display = isAdmin ? 'block' : 'none';
            }

            // Админская секция - только для админа
            const adminSection = document.getElementById('adminSection');
            if (adminSection) {
                adminSection.style.display = isAdmin ? 'block' : 'none';
            }
            
            // Лимиты карты - для админа и бухгалтера
            const cardLimitsTabButton = document.querySelector('button[onclick*="cardLimits"]');
            if (cardLimitsTabButton) {
                cardLimitsTabButton.style.display = (isAdmin || isAccountant) ? 'block' : 'none';
            }

            // Детализация расчетов - для админа, бухгалтера и кураторов
            const detailsTabButton = document.getElementById('details-tab-button');
            if (detailsTabButton) {
                const canViewDetails = isAdmin || isAccountant || data.user.role === 'curator';
                detailsTabButton.style.display = canViewDetails ? 'block' : 'none';
            }

            // СПЕЦИАЛЬНО ДЛЯ КУРАТОРОВ: показываем ТОЛЬКО вкладку детализации
            if (data.user.role === 'curator') {
                // Скрываем все вкладки кроме детализации
                document.querySelectorAll('.tab-button').forEach(btn => {
                    if (btn.id !== 'details-tab-button') {
                        btn.style.display = 'none';
                    }
                });
                
                // Автоматически открываем вкладку детализации
                setTimeout(() => {
                    switchTab('details', detailsTabButton);
                    initDetailsTab(); // Инициализируем список сотрудников
                }, 100);
            }
        } else {
            // Если нет данных пользователя - выбрасываем на вход
            window.location.href = '/index.html';
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

            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const lastDay = new Date(year, month, 0).getDate();
            const lastDayOfMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

            if (new Date() < new Date(year, month - 1, lastDay)) {
                endDateInput.value = todayStr;
            } else {
                endDateInput.value = lastDayOfMonthStr;
            }
        }

        monthSelects.forEach(s => {
            if (s) s.addEventListener('change', updateEndDateDefault);
        });
        yearInputs.forEach(i => {
            if (i) i.addEventListener('change', updateEndDateDefault);
        });

// Привязываем события к кнопкам
        const uploadBtn = document.getElementById('uploadRevenueBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', uploadRevenueFile);
        }
        
        // Инициализация вкладки детализации
        const detailsButton = document.getElementById('details-tab-button');
        if (detailsButton) {
            detailsButton.addEventListener('click', function() {
                initDetailsTab();
            });
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
    
    // Скрываем панель настроек лимитов если переключились не на вкладку лимитов
    const settingsPanel = document.getElementById('limitTypesSettings');
    if (settingsPanel && tabName !== 'cardLimits') {
        settingsPanel.style.display = 'none';
    }
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
    // Старый способ для обратной совместимости
    const statusEl = document.getElementById(elementId);
    if (statusEl) {
        statusEl.className = `status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'flex';
    }
    
    // Новое модальное уведомление в центре экрана
    showModalNotification(message, type);
}

// Новая функция для модальных уведомлений
function showModalNotification(message, type = 'info', duration = 3000) {
    // Удаляем предыдущее уведомление если есть
    const existingNotification = document.getElementById('modal-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Определяем иконку и цвет по типу
    let icon = '';
    let bgColor = '#d1ecf1';
    let textColor = '#0c5460';
    let borderColor = '#bee5eb';
    
    switch(type) {
        case 'success':
            icon = '';
            bgColor = '#d4edda';
            textColor = '#155724';
            borderColor = '#c3e6cb';
            break;
        case 'error':
            icon = '';
            bgColor = '#f8d7da';
            textColor = '#721c24';
            borderColor = '#f5c6cb';
            break;
        case 'warning':
            icon = '';
            bgColor = '#fff3cd';
            textColor = '#856404';
            borderColor = '#ffeaa7';
            break;
    }
    
    // Создаем HTML уведомления
    const notificationHTML = `
        <div id="modal-notification" style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${bgColor};
            color: ${textColor};
            border: 2px solid ${borderColor};
            border-radius: 10px;
            padding: 20px 30px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 100000;
            min-width: 300px;
            max-width: 500px;
            text-align: center;
            font-size: 16px;
            font-weight: 500;
            animation: slideIn 0.3s ease;
        ">
            <div style="display: flex; align-items: center; gap: 15px; justify-content: center;">
                <span style="font-size: 24px;">${icon}</span>
                <span>${message}</span>
            </div>
        </div>
    `;
    
    // Добавляем в body
    document.body.insertAdjacentHTML('beforeend', notificationHTML);
    
    // Автоматически скрываем через duration миллисекунд
    if (duration > 0) {
        setTimeout(() => {
            const notification = document.getElementById('modal-notification');
            if (notification) {
                notification.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }
    
    // Закрытие по клику
    document.getElementById('modal-notification').addEventListener('click', function() {
        this.remove();
    });
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

async function exportMonthlyReportToExcel() {
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

    // Функция для получения деталей недостач
    async function getShortageDetails(employeeId, month, year) {
        try {
            const response = await fetch(
                `${API_BASE}/get-shortages?employee_id=${employeeId}&year=${year}&month=${month}`,
                { credentials: 'include' }
            );
            const result = await response.json();
            
            if (result.shortages && result.shortages.length > 0) {
                return result.shortages
                    .map(s => `${s.description || 'Недостача'} (${formatNumber(s.amount)} грн)`)
                    .join('; ');
            }
            return '';
        } catch (error) {
            console.error('Ошибка получения деталей недостач:', error);
            return '';
        }
    }

    // Собираем данные из таблицы
    for (const row of tableRows) {
        if (row.classList.contains('summary-row')) continue;
        
        // Получаем все значения из строки таблицы
        const basePay = parseFloat(row.dataset.basePay) || 0;
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        
        // Получаем детали недостач
        const shortageDetails = await getShortageDetails(row.dataset.employeeId, month, year);
        
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
        let isTermination = false;
        
        // Аванс на карту
        if (advanceCardCell) {
            const cardText = advanceCardCell.textContent;
            const cardHTML = advanceCardCell.innerHTML;
            advanceCardAmount = parseFloat(cardText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            if (cardHTML.includes('<i class="ti ti-pencil"></i>')) {
                isManualAdjustment = true;
            }
            if (cardHTML.includes('<i class="ti ti-door-exit"></i>')) {
                isTermination = true;
            }
        }
        
        // Аванс наличными
        if (advanceCashCell) {
            const cashText = advanceCashCell.textContent;
            const cashHTML = advanceCashCell.innerHTML;
            advanceCashAmount = parseFloat(cashText.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
            if (cashHTML.includes('<i class="ti ti-pencil"></i>')) {
                isManualAdjustment = true;
            }
            if (cashHTML.includes('<i class="ti ti-door-exit"></i>')) {
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
        
        // Определяем статус сотрудника
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
            'Статус': employeeStatus,
            'Магазин': row.dataset.storeAddress || '',
            'Месяц': `${monthNames[month - 1]} ${year}`,
            'База начислений': basePay,
            'Премирование': manualBonus,
            'Причина премии': row.querySelector('[name="bonus_reason"]')?.value || '',
            'Всего начислено': totalGross,
            'Депремирование': penalty,
            'Причина депремирования': row.querySelector('[name="penalty_reason"]')?.value || '',
            'Вычет за недостачу': shortage,
            'Детали недостачи': shortageDetails, // НОВОЕ ПОЛЕ
            'Всего вычетов': totalDeductions,
            'К выплате после вычетов': totalAfterDeductions,
            'Тип выплаты': paymentType,
            'Аванс (на карту)': advanceCardAmount,
            'Аванс (наличные)': advanceCashAmount,
            'Способ выплаты аванса': advancePaymentMethod === 'cash' ? 'Наличные' : advancePaymentMethod === 'mixed' ? 'Карта + Наличные' : 'Карта',
            'Ручная корректировка': isManualAdjustment ? 'Да' : 'Нет',
            'Увольнение': isTermination ? 'ДА' : 'Нет',
            'Остаток (на карту)': cardRemainder,
            'Зарплата (наличными)': cashAmount,
            'ИТОГО к выплате': totalAfterDeductions,
            'Рабочие дни': JSON.parse(row.dataset.shifts || '[]').join(', ')
        };
        
        exportData.push(rowData);
    }

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
        { wch: 10 }, // Статус
        { wch: 20 }, // Магазин
        { wch: 15 }, // Месяц
        { wch: 12 }, // База
        { wch: 12 }, // Премирование
        { wch: 20 }, // Причина премии
        { wch: 14 }, // Всего начислено
        { wch: 14 }, // Депремирование
        { wch: 20 }, // Причина депремирования
        { wch: 14 }, // Вычет за недостачу
        { wch: 30 }, // Детали недостачи (НОВОЕ)
        { wch: 12 }, // Всего вычетов
        { wch: 18 }, // К выплате после вычетов
        { wch: 25 }, // Тип выплаты
        { wch: 14 }, // Аванс на карту
        { wch: 14 }, // Аванс наличные
        { wch: 18 }, // Способ выплаты
        { wch: 14 }, // Ручная корректировка
        { wch: 10 }, // Увольнение
        { wch: 14 }, // Остаток на карту
        { wch: 15 }, // Наличными
        { wch: 15 }, // ИТОГО к выплате
        { wch: 20 }  // Рабочие дни
    ];
    
    // Применяем условное форматирование для уволенных
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const statusCell = ws[XLSX.utils.encode_cell({r: R, c: 1})];
        if (statusCell && statusCell.v === 'УВОЛЕН') {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = XLSX.utils.encode_cell({r: R, c: C});
                if (ws[cell_address]) {
                    ws[cell_address].s = {
                        fill: { fgColor: { rgb: "FFE6E6" } },
                        font: { bold: true }
                    };
                }
            }
        }
    }
    
    XLSX.utils.book_append_sheet(wb, ws, "Детальный отчет");
    
    // ЛИСТ 2: Сводка по выплатам
    const paymentSummary = [];
    let totalAdvanceCard = 0;
    let totalAdvanceCash = 0;
    let totalCardRemainder = 0;
    let totalCash = 0;
    let totalCardPayments = 0;
    let terminatedCount = 0;
    let terminatedAmount = 0;
    
    exportData.forEach(row => {
        totalAdvanceCard += row['Аванс (на карту)'];
        totalAdvanceCash += row['Аванс (наличные)'];
        totalCardRemainder += row['Остаток (на карту)'];
        totalCash += row['Зарплата (наличными)'];
        totalCardPayments = totalAdvanceCard + totalCardRemainder;
        
        if (row['Увольнение'] === 'ДА') {
            terminatedCount++;
            terminatedAmount += row['ИТОГО к выплате'];
        }
    });
    
    const totalAdvance = totalAdvanceCard + totalAdvanceCash;
    
    paymentSummary.push(
        { 'Показатель': 'Период', 'Значение': `${monthNames[month - 1]} ${year}` },
        { 'Показатель': 'Всего сотрудников', 'Значение': exportData.length },
        { 'Показатель': 'Из них УВОЛЕНО', 'Значение': terminatedCount },
        { 'Показатель': 'Сумма выплат уволенным', 'Значение': terminatedAmount.toFixed(2) + ' грн' },
        { 'Показатель': '═══════════════════════', 'Значение': '═══════════════════════' },
        { 'Показатель': 'Аванс на карту (всего)', 'Значение': totalAdvanceCard.toFixed(2) + ' грн' },
        { 'Показатель': 'Аванс наличными (всего)', 'Значение': totalAdvanceCash.toFixed(2) + ' грн' },
        { 'Показатель': 'Остаток на карту (всего)', 'Значение': totalCardRemainder.toFixed(2) + ' грн' },
        { 'Показатель': 'Зарплата наличными (всего)', 'Значение': totalCash.toFixed(2) + ' грн' },
        { 'Показатель': '═══════════════════════', 'Значение': '═══════════════════════' },
        { 'Показатель': 'ИТОГО на карты', 'Значение': totalCardPayments.toFixed(2) + ' грн' },
        { 'Показатель': 'ИТОГО наличными', 'Значение': (totalAdvanceCash + totalCash).toFixed(2) + ' грн' }
    );
    
    const ws2 = XLSX.utils.json_to_sheet(paymentSummary);
    ws2['!cols'] = [{ wch: 45 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Сводка по выплатам");
    
    // ЛИСТ 3: Отдельный список уволенных
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
    
    showStatus('reportStatus', `Экспорт выполнен: ${fileName}`, 'success');
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
        <tr class="summary-row" style="font-weight: bold; background-color: var(--surface-2);">
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

async function fetchData(url, options, statusId) {
    try {
        // Добавляем таймаут 30 секунд для предотвращения ERR_CONNECTION_RESET
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

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
        if (error.name === 'AbortError') {
            console.error('Превышено время ожидания запроса (30 сек)');
            showStatus(statusId, '⏱Превышено время ожидания. Попробуйте еще раз или выберите меньший период.', 'warning');
        } else {
            console.error(`Ошибка при запросе к ${url}:`, error);
            showStatus(statusId, `Ошибка: ${error.message}`, 'error');
        }
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
                tbody.innerHTML += `<tr class="summary-row" style="background-color: var(--surface-2);"><td colspan="8" style="font-weight: bold;">Магазин: ${storeName}</td></tr>`;
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
                tbody.innerHTML += `<tr class="summary-row" style="background-color: var(--surface-2);"><td colspan="7" style="font-weight: bold; text-align: right;">Итого по магазину:</td><td style="font-weight: bold;"><strong>${formatNumber(storeTotalPay)} грн</strong></td></tr>`;
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

// --- ФАЗА 2: блокировка/разблокировка зафиксированных строк ---
function toggleReasons(btn) {
    const tbl = document.getElementById('monthlyReportTable');
    if (!tbl) return;
    const collapsed = tbl.classList.toggle('reasons-collapsed');
    document.querySelectorAll('.grp-prem-head, .grp-deprem-head').forEach(th => { th.colSpan = collapsed ? 1 : 2; });
    if (btn) btn.innerHTML = collapsed ? '<i class="ti ti-eye"></i> Показать причины' : '<i class="ti ti-eye-off"></i> Скрыть причины';
}

function _pmCell(el) {
    if (!el) return 0;
    var s = String(el.textContent || '').replace(/[^0-9,.-]/g, '').replace(',', '.');
    return parseFloat(s) || 0;
}

function ensureChecksPanel() {
    var p = document.getElementById('reportChecksPanel');
    if (!p) {
        var cont = document.getElementById('monthlyReportContent');
        if (!cont) return null;
        p = document.createElement('div');
        p.id = 'reportChecksPanel';
        cont.insertBefore(p, cont.firstChild);
    }
    return p;
}

function runReportChecks() {
    var tbl = document.getElementById('monthlyReportTable');
    var p = ensureChecksPanel();
    if (!tbl) { if (p) p.innerHTML = ''; return { errors: 0, warnings: 0 }; }
    var rows = Array.prototype.slice.call(tbl.querySelectorAll('tbody tr')).filter(function (r) { return r.dataset.employeeId; });
    var fixedCount = rows.filter(function (r) { return r.dataset.isFixed === '1'; }).length;
    var issues = [];
    rows.forEach(function (r) {
        r.classList.remove('row-chk-err', 'row-chk-warn');
        var name = r.dataset.employeeName || '';
        var basePay = parseFloat(r.dataset.basePay) || 0;
        var cardLimit = parseFloat(r.dataset.cardLimit) || 8700;
        var mb = parseFloat((r.querySelector('[name="manual_bonus"]') || {}).value) || 0;
        var pen = parseFloat((r.querySelector('[name="penalty"]') || {}).value) || 0;
        var sh = parseFloat((r.querySelector('[name="shortage"]') || {}).value) || 0;
        var penReason = ((r.querySelector('[name="penalty_reason"]') || {}).value || '').trim();
        var advCard = _pmCell(r.querySelector('.advance-payment-card'));
        var advCash = _pmCell(r.querySelector('.advance-payment-cash'));
        var cardRem = _pmCell(r.querySelector('.card-remainder'));
        var cashPay = _pmCell(r.querySelector('.cash-payout'));
        var isFixed = r.dataset.isFixed === '1';
        var afterDed = basePay + mb - pen - sh;
        var advance = advCard + advCash;
        var expected = Math.max(0, afterDed - advance);
        var actual = cardRem + cashPay;
        var sev = null;
        if (cardRem < -0.5 || cashPay < -0.5) { issues.push({ s: 'err', n: name, m: 'отрицательный остаток к выплате', a: 'пересчитайте строку' }); sev = 'err'; }
        else if (Math.abs(actual - expected) > 1) { issues.push({ s: 'err', n: name, m: 'карта+наличные (' + formatNumber(actual) + ') не сходятся с суммой к выплате (' + formatNumber(expected) + ')', a: 'проверьте распределение остатка' }); sev = 'err'; }
        if (!isFixed && advCard + cardRem > cardLimit + 1) { issues.push({ s: 'err', n: name, m: 'на карту уходит ' + formatNumber(advCard + cardRem) + ' — больше лимита ' + formatNumber(cardLimit), a: 'перенесите излишек в наличные (или увеличьте лимит карты)' }); sev = 'err'; }
        if (afterDed < -0.5) { issues.push({ s: 'warn', n: name, m: 'вычеты больше начисления, итог в минус (' + formatNumber(afterDed) + ')', a: 'уменьшите вычет или перенесите на след. месяц' }); if (sev !== 'err') sev = 'warn'; }
        if ((pen > 0 || sh > 0) && !penReason) { issues.push({ s: 'info', n: name, m: 'вычет без указанной причины', a: 'впишите причину' }); }
        if (!isFixed && rows.length >= 4 && (fixedCount / rows.length) > 0.7) { issues.push({ s: 'warn', n: name, m: 'строка не зафиксирована, а остальные зафиксированы', a: 'зафиксируйте или проверьте' }); if (sev !== 'err') sev = 'warn'; }
        if (sev === 'err') r.classList.add('row-chk-err');
        else if (sev === 'warn') r.classList.add('row-chk-warn');
    });
    var errs = issues.filter(function (i) { return i.s === 'err'; }).length;
    var warns = issues.filter(function (i) { return i.s === 'warn'; }).length;
    var infos = issues.filter(function (i) { return i.s === 'info'; }).length;
    if (p) {
        if (issues.length === 0) {
            p.innerHTML = '<div class="chk-ok"><i class="ti ti-circle-check"></i> Проверка пройдена — расхождений и ошибок нет.</div>';
        } else {
            var icn = { err: 'ti-alert-triangle', warn: 'ti-alert-circle', info: 'ti-info-circle' };
            var items = issues.map(function (i) { return '<div class="chk-i ' + i.s + '"><i class="ti ' + icn[i.s] + '"></i><div><span class="who">' + i.n + '</span> — ' + i.m + '.<span class="chk-a">Что сделать: ' + i.a + '.</span></div></div>'; }).join('');
            var chip = function (cls, ci, n, w) { return n ? '<span class="chk-b ' + cls + '"><i class="ti ' + ci + '"></i> ' + n + ' ' + w + '</span>' : ''; };
            p.innerHTML = '<div class="chk-body"><div class="chk-hd"><i class="ti ti-clipboard-check"></i> Проверка расчёта</div><div class="chk-sub">' + chip('e', 'ti-alert-triangle', errs, errs === 1 ? 'ошибка' : 'ошибок') + chip('w', 'ti-alert-circle', warns, 'предупр.') + chip('i', 'ti-info-circle', infos, 'подсказ.') + (errs ? ' — исправьте ошибки перед фиксацией выплаты.' : '') + '</div>' + items + '</div>';
        }
    }
    return { errors: errs, warnings: warns, infos: infos };
}

function applyRowLockStates() {
    document.querySelectorAll('#monthlyReportContent tbody tr').forEach(function(row) {
        var locked = row.dataset.isFixed === '1';
        row.querySelectorAll('.adjustment-input').forEach(function(inp) {
            inp.disabled = locked;
            inp.title = locked ? 'Строка зафиксирована — нажмите «Разблокировать для правки»' : '';
            inp.style.background = '';
        });
        var nameCell = row.querySelector('td');
        if (!nameCell) return;
        var box = nameCell.querySelector('.lock-box');
        if (locked) {
            if (!box) {
                box = document.createElement('span');
                box.className = 'lock-box';
                box.style.cssText = 'display:inline-flex;gap:6px;align-items:center;margin-left:8px;';
                box.innerHTML = '<span class="row-status locked"><i class="ti ti-lock"></i> Зафиксировано</span><button type="button" class="unlock-btn" onclick="unlockFinalRow(this)"><i class="ti ti-lock-open"></i> Разблокировать</button>';
                nameCell.appendChild(box);
            }
        } else if (box) {
            box.remove();
        }
    });
}

async function calculatePayrollExtras() {
    const month = document.getElementById('reportMonth')?.value;
    const year = document.getElementById('reportYear')?.value;
    const endDate = document.getElementById('reportEndDate')?.value;
    if (!month || !year || !endDate) { showStatus('reportStatus', 'Выберите месяц, год и дату расчёта', 'error'); return; }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    showStatus('reportStatus', 'Пересчёт бонусов (процент, пакеты, кофе, кулинария)…', 'info');
    try {
        const res = await fetch(`${API_BASE}/calculate-payroll-extras`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ startDate, endDate })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Ошибка пересчёта');
        let msg = `Бонусы пересчитаны. Обновлено строк: ${data.updated || 0}.`;
        if (data.skippedNoBase) msg += ` Без ставки (пропущено): ${data.skippedNoBase}.`;
        if (data.warnings && data.warnings.length) msg += ` Расхождений: ${data.warnings.length}.`;
        showStatus('reportStatus', msg, (data.warnings && data.warnings.length) ? 'warning' : 'success');
        if (typeof generateMonthlyReport === 'function') generateMonthlyReport();
    } catch (e) { showStatus('reportStatus', 'Ошибка пересчёта бонусов: ' + e.message, 'error'); }
}

async function unlockFinalRow(btn) {
    var row = btn.closest('tr');
    if (!row) return;
    var employeeId = row.dataset.employeeId, employeeName = row.dataset.employeeName;
    var month = row.dataset.month, year = row.dataset.year;
    if (!confirm('Разблокировать строку «' + employeeName + '» для правки?\n\nБудет сделан бэкап, строка станет редактируемой. После правок зафиксируйте её заново.')) return;
    try {
        var res = await fetch(`${API_BASE}/unlock-final-row`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ employee_id: employeeId, year: parseInt(year), month: parseInt(month) })
        });
        var data = await res.json();
        if (!data.success) throw new Error(data.error || 'Не удалось разблокировать');
        row.dataset.isFixed = '0';
        applyRowLockStates();
        runReportChecks();
        showStatus('reportStatus', 'Строка «' + employeeName + '» разблокирована. Внесите правки и зафиксируйте заново.', 'success');
    } catch (e) {
        showStatus('reportStatus', 'Ошибка разблокировки: ' + e.message, 'error');
    }
}

function handleAdjustmentInput(e) {
    clearTimeout(adjustmentDebounceTimer);
    const row = e.target.closest('tr');
    recalculateRow(row);
    if (row) row.style.boxShadow = 'inset 4px 0 0 #f0a500';
    if (typeof runReportChecks === 'function') runReportChecks();
    adjustmentDebounceTimer = setTimeout(() => {
        saveAdjustments(row);
    }, 800);
}

// (дубликат recalculateRow удалён — активна версия ниже)

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
        if (row) { row.style.boxShadow = 'inset 4px 0 0 #2e9e4f'; setTimeout(function(){ if (row) row.style.boxShadow = ''; }, 1200); }
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

    // НОВОЕ: Очищаем кэш лимитов при генерации нового отчета
    clearLimitsCache();

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
    <h3><i class="ti ti-users"></i> Детализация по сотрудникам за ${monthNames[month - 1]} ${year}:</h3>
    <p style="margin: 10px 0; color: #666;">Общая сумма начислений (база): <strong>${formatNumber(totalBasePay)} грн</strong></p>
    <div class="table-container">
    <table id="monthlyReportTable" class="reasons-collapsed" style="font-size: 11px; white-space: nowrap;">
        <thead class="monthly-report-head">
            <tr>
                <th rowspan="2" style="vertical-align: middle;">Сотрудник</th>
                <th rowspan="2" style="vertical-align: middle;">Магазин</th>
                <th rowspan="2" style="vertical-align: middle;">Всего начислено<br/>(база)</th>
                <th colspan="1" class="grp-prem-head">Премирование</th>
                <th colspan="1" class="grp-deprem-head">Депремирование</th>
                <th rowspan="2" style="vertical-align: middle;">Вычет за<br/>недостачу</th>
                <th rowspan="2" style="vertical-align: middle;">Аванс<br/>(на карту)</th>
                <th rowspan="2" style="vertical-align: middle;">Аванс<br/>(наличные)</th>
                <th rowspan="2" style="vertical-align: middle;">Остаток<br/>(на карту)</th>
                <th rowspan="2" style="vertical-align: middle;">Зарплата<br/>(наличными)</th>
                <th rowspan="2" style="vertical-align: middle;">Итого<br/>к выплате</th>
                <th rowspan="2" style="vertical-align: middle;">Действия</th>
            </tr>
            <tr><th>Сумма</th><th class="col-reason">Причина</th><th>Сумма</th><th class="col-reason">Причина</th></tr>
        </thead>
        <tbody>`;

    if (sortedEmployees.length === 0) {
        tableHtml += '<tr><td colspan="14" style="text-align: center; padding: 20px;">Нет данных для отображения за выбранный период.</td></tr>';
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
            
            if (finalCalc) {
                // Если есть финальный расчет (зафиксирован ИЛИ нет)
                hasCompleteCalculation = true;
                
                if (finalCalc.is_fixed) {
                    // Зафиксированный аванс - берём сохранённые значения
                    remainingToPay = cardRemainder + cashPayout;
                } else {
                    // Не зафиксирован - рассчитываем остаток
                    remainingToPay = totalAfterDeductions - advancePayment;
                    
                    // Если остаток не был рассчитан, распределяем его
                    if (remainingToPay > 0 && cardRemainder === 0 && cashPayout === 0) {
                        const maxCardTotal = finalCalc.card_limit || 16000;
                        const remainingCardCapacity = Math.max(0, maxCardTotal - advanceCard);
                        cardRemainder = Math.min(remainingCardCapacity, remainingToPay);
                        cashPayout = Math.max(0, remainingToPay - cardRemainder);
                    }
                }
            } else {
                // Нет финального расчета - предварительный расчет
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
                        <i class="ti ti-credit-card"></i> <i class="ti ti-door-exit"></i> ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        <i class="ti ti-cash"></i> <i class="ti ti-door-exit"></i> ${formatNumber(advanceCash)}
                    </span>`;
                } else if (advanceCash > 0) {
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        <i class="ti ti-cash"></i> <i class="ti ti-door-exit"></i> ${formatNumber(advanceCash)}
                    </span>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Увольнение: ${manualAdvanceReason}">
                        <i class="ti ti-credit-card"></i> <i class="ti ti-door-exit"></i> ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = '0';
                }
            } else if (isManualAdvance) {
                // Ручная корректировка
                if (advanceCash > 0 && advanceCard > 0) {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        <i class="ti ti-credit-card"></i> <i class="ti ti-pencil"></i> ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        <i class="ti ti-cash"></i> <i class="ti ti-pencil"></i> ${formatNumber(advanceCash)}
                    </span>`;
                } else if (advanceCash > 0) {
                    advanceCashContent = `
                    <span style="color: #28a745; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        <i class="ti ti-cash"></i> <i class="ti ti-pencil"></i> ${formatNumber(advanceCash)}
                    </span>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `
                    <span style="color: #ff6b6b; font-weight: bold;" 
                          title="Ручная корректировка: ${manualAdvanceReason}">
                        <i class="ti ti-credit-card"></i> <i class="ti ti-pencil"></i> ${formatNumber(advanceCard)}
                    </span>`;
                    advanceCashContent = '0';
                }
            } else if (finalCalc && finalCalc.is_fixed) {
                // Зафиксированный аванс
                if (advanceCash > 0) {
                    advanceCashContent = `
                    <strong style="color: #28a745;" title="Аванс зафиксирован (наличные)">
                        <i class="ti ti-lock"></i> <i class="ti ti-cash"></i> ${formatNumber(advanceCash)}
                    </strong>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `
                    <strong style="color: #f5576c;" title="Аванс зафиксирован (карта)">
                        <i class="ti ti-lock"></i> <i class="ti ti-credit-card"></i> ${formatNumber(advanceCard)}
                    </strong>`;
                    advanceCashContent = '0';
                }
            } else if (finalCalc) {
                // Есть финальный расчет, но аванс не помечен как зафиксированный
                if (advanceCash > 0) {
                    advanceCashContent = `<strong style="color: #28a745;"><i class="ti ti-cash"></i> ${formatNumber(advanceCash)}</strong>`;
                    advanceCardContent = '0';
                } else {
                    advanceCardContent = `<strong><i class="ti ti-credit-card"></i> ${formatNumber(advanceCard)}</strong>`;
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
            data-card-limit="${finalCalc?.card_limit || 8700}" data-is-fixed="${finalCalc && finalCalc.is_fixed ? '1' : '0'}"
data-shifts='${JSON.stringify(data.shifts)}'>
            <td style="padding: 5px;">
    ${data.name}
    ${finalCalc?.card_limit_type_id === 2 ?
                '<span style="margin-left:5px;font-size:10px;padding:2px 7px;border-radius:20px;background:var(--brand-ghost);color:var(--brand);border:.5px solid var(--brand);font-weight:500;">VIP</span>' 
        : ''}
</td>
            <td style="padding: 5px; font-size: 10px;">${data.primaryStore}</td>
            <td class="total-gross" style="padding: 5px;">${formatNumber(totalGross)}</td>
            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="manual_bonus" value="${adj.manual_bonus || 0}" style="width: 70px;"></td>
            <td class="col-reason" style="padding: 5px;"><input type="text" class="adjustment-input" name="bonus_reason" value="${adj.bonus_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
            <td style="padding: 5px;"><input type="number" class="adjustment-input" name="penalty" value="${adj.penalty || 0}" style="width: 70px;"></td>
            <td class="col-reason" style="padding: 5px;"><input type="text" class="adjustment-input" name="penalty_reason" value="${adj.penalty_reason || ''}" placeholder="Причина" style="width: 100px;"></td>
            <td style="padding: 5px;">
    <input type="number" class="adjustment-input" name="shortage" value="${adj.shortage || 0}" style="width: 70px;">
    <button onclick="manageShortages('${id}', '${data.name}')" style="margin-left: 5px; padding: 2px 6px; font-size: 10px;" title="Управление недостачами"><i class="ti ti-clipboard-list"></i></button>
</td>
            <td class="advance-payment-card" style="padding: 5px;">
                <span class="advance-card-content" data-employee-id="${id}" data-employee-name="${data.name}">${advanceCardContent}</span>
            </td>
            <td class="advance-payment-cash" style="padding: 5px;">
                <span class="advance-cash-content" data-employee-id="${id}" data-employee-name="${data.name}">${advanceCashContent}</span>
            </td>
            <td class="card-remainder" style="padding: 5px; ${!hasCompleteCalculation ? 'color: #ccc;' : (cardRemainder > 0 ? 'color: #28a745; font-weight: bold;' : '')}">
    ${hasCompleteCalculation ? formatNumber(cardRemainder) : '—'}
    ${hasCompleteCalculation ? `<button onclick="adjustCardRemainder('${id}', '${data.name}')" style="margin-left: 5px; padding: 2px 6px; font-size: 10px;" title="Корректировать остаток"><i class="ti ti-pencil"></i></button>` : ''}
</td>
            <td class="cash-payout" style="padding: 5px; ${!hasCompleteCalculation ? 'color: #ccc;' : ''}">
                ${hasCompleteCalculation ? (cashPayout > 0 ? `<strong style="color: #007bff;">${formatNumber(cashPayout)}</strong>` : formatNumber(cashPayout)) : '—'}
            </td>
            <td class="total-payout" style="padding: 5px;">
                <strong title="${hasCompleteCalculation ? 'Итоговый расчет выполнен' : 'Предварительный расчет'}">${formatNumber(remainingToPay)}</strong>
            </td>
            <td style="padding: 5px;">
                <button onclick="ucModal.open('${id}', '${data.name}', ${month}, ${year})" class="secondary" style="padding:5px 10px;font-size:12px" title="Окно корректировок"><i class="ti ti-adjustments-alt"></i> Все корректировки</button>
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
            <strong>Загружены финальные расчеты</strong><br>
            Аванс на карту: ${formatNumber(totalAdvanceCard)} грн | 
            Аванс наличными: ${formatNumber(totalAdvanceCash)} грн<br>
            Остаток на карту: ${formatNumber(totalCardRemainder)} грн | 
            Зарплата наличными: ${formatNumber(totalCash)} грн
        `;
        
        if (manualAdjustmentsCount > 0) {
            infoMessage += `<br><span style="color: #ff6b6b;"><i class="ti ti-pencil"></i> Ручных корректировок аванса: ${manualAdjustmentsCount}</span>`;
        }
        if (cashAdvanceCount > 0) {
            infoMessage += `<br><span style="color: #28a745;"><i class="ti ti-cash"></i> Авансов наличными: ${cashAdvanceCount}</span>`;
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
    applyRowLockStates();
    runReportChecks();

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
    
    // Добавляем обработчик blur для гарантированного пересчета при потере фокуса
    input.addEventListener('blur', function(e) {
        const row = e.target.closest('tr');
        if (row) {
            // Форсируем пересчет всех сумм
            recalculateRow(row);
            // Сохраняем изменения
            saveAdjustments(row);
        }
    });
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
                        button.innerHTML = '<i class="ti ti-pencil"></i>';
                        button.style.cssText = 'padding: 3px 7px; font-size: 11px; cursor: pointer; background: var(--surface); border: .5px solid var(--border-strong); border-radius: 6px; margin-left: 5px; color: var(--text-2);';
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
    const totalDeductions = penalty + shortage;
    const totalAfterDeductions = totalGross - totalDeductions;

    // Получаем текущий аванс из обеих колонок
    const advanceCardCell = row.querySelector('.advance-payment-card');
    const advanceCashCell = row.querySelector('.advance-payment-cash');
    
    let advanceCard = 0;
    let advanceCash = 0;
    
    if (advanceCardCell) {
        const cardText = advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
        advanceCard = parseFloat(cardText) || 0;
    }
    if (advanceCashCell) {
        const cashText = advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
        advanceCash = parseFloat(cashText) || 0;
    }
    
    const totalAdvance = advanceCard + advanceCash;

    // ИЗМЕНЕНИЕ 1: НЕ используем Math.max(0, ...) сразу
    const remainingToPay = totalAfterDeductions - totalAdvance;
    
    // ИЗМЕНЕНИЕ 2: Правильный расчет распределения
    let newCardRemainder = 0;
    let newCashPayout = 0;
    
if (remainingToPay > 0) {
        // Есть остаток к выплате - используем ДИНАМИЧЕСКИЙ лимит из data-атрибута
        const maxCardTotal = parseFloat(row.dataset.cardLimit) || 8700;
        const remainingCardCapacity = Math.max(0, maxCardTotal - advanceCard);
        
        newCardRemainder = Math.min(remainingCardCapacity, remainingToPay);
        newCashPayout = remainingToPay - newCardRemainder;
    } else {
        // Аванс покрывает все или переплата - остатки должны быть 0
        newCardRemainder = 0;
        newCashPayout = 0;
        
        // ИЗМЕНЕНИЕ 3: Добавляем предупреждение о переплате
        if (remainingToPay < 0) {
            console.warn(`Переплата для ${row.dataset.employeeName}: аванс ${totalAdvance} > начислений ${totalAfterDeductions}`);
        }
    }
    // 1. Обновляем "Всего начислено"
    const totalGrossCell = row.querySelector('.total-gross');
    if (totalGrossCell) {
        totalGrossCell.textContent = formatNumber(totalGross);
    }

    // 2. Обновляем остаток на карту
    const cardRemainderCell = row.querySelector('.card-remainder');
    if (cardRemainderCell) {
        const hasButton = cardRemainderCell.innerHTML.includes('button');
        cardRemainderCell.textContent = formatNumber(newCardRemainder);
        
        if (newCardRemainder > 0) {
            cardRemainderCell.style.color = '#28a745';
            cardRemainderCell.style.fontWeight = 'bold';
        } else {
            cardRemainderCell.style.color = '';
            cardRemainderCell.style.fontWeight = 'normal';
        }
        
        // Восстанавливаем кнопку если она была
        if (hasButton) {
            const button = document.createElement('button');
            button.onclick = () => adjustCardRemainder(row.dataset.employeeId, row.dataset.employeeName);
            button.style.cssText = 'margin-left: 5px; padding: 2px 6px; font-size: 10px;';
            button.title = 'Корректировать остаток';
            button.innerHTML = '<i class="ti ti-pencil"></i>';
            cardRemainderCell.appendChild(button);
        }
    }

    // 3. Обновляем зарплату наличными
    const cashPayoutCell = row.querySelector('.cash-payout');
    if (cashPayoutCell) {
        if (newCashPayout > 0) {
            cashPayoutCell.innerHTML = `<strong style="color: #007bff;">${formatNumber(newCashPayout)}</strong>`;
        } else {
            // ИЗМЕНЕНИЕ 4: Убрал <strong> для нулевых значений
            cashPayoutCell.innerHTML = formatNumber(newCashPayout);
        }
    }

    // 4. Обновляем итоговую сумму к выплате
    const totalPayoutCell = row.querySelector('.total-payout');
    if (totalPayoutCell) {
        // ИЗМЕНЕНИЕ 5: Используем Math.max(0, ...) только для отображения
        totalPayoutCell.innerHTML = `<strong title="Остаток к выплате">${formatNumber(Math.max(0, remainingToPay))}</strong>`;
    }
    
    // ИЗМЕНЕНИЕ 6: Улучшенное логирование
    console.log(`Пересчет для ${row.dataset.employeeName}:
        Начислено: ${totalAfterDeductions} (база: ${basePay}, бонус: ${manualBonus}, вычеты: ${totalDeductions})
        Аванс: ${totalAdvance} (карта: ${advanceCard}, нал: ${advanceCash})
        Остаток: ${remainingToPay} → Карта: ${newCardRemainder}, Нал: ${newCashPayout}`);
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

    // НОВАЯ ФУНКЦИЯ: Создание снимка состояния таблицы
async function captureCurrentTableState() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    const stateData = [];
    
    tableRows.forEach(row => {
        if (row.classList.contains('summary-row')) return;
        
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        
        let advanceCard = 0;
        let advanceCash = 0;
        
        if (advanceCardCell) {
            advanceCard = parseFloat(advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        }
        if (advanceCashCell) {
            advanceCash = parseFloat(advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        }
        
        stateData.push({
            employee_id: row.dataset.employeeId,
            employee_name: row.dataset.employeeName,
            advance_card: advanceCard,
            advance_cash: advanceCash,
            card_remainder: parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            cash_payout: parseFloat(row.querySelector('.cash-payout')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            manual_bonus: parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0,
            penalty: parseFloat(row.querySelector('[name="penalty"]')?.value) || 0,
            shortage: parseFloat(row.querySelector('[name="shortage"]')?.value) || 0
        });
    });
    
    // Сохраняем в localStorage как резервную копию
    localStorage.setItem('payroll_backup_' + new Date().getTime(), JSON.stringify({
        date: new Date().toISOString(),
        month: document.getElementById('reportMonth')?.value,
        year: document.getElementById('reportYear')?.value,
        data: stateData
    }));
    
    return stateData;
}

// НОВАЯ ФУНКЦИЯ: Восстановление из localStorage
async function restoreFromLocalBackup() {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('payroll_backup_')) {
            backups.push({
                key: key,
                data: JSON.parse(localStorage.getItem(key))
            });
        }
    }
    
    if (backups.length === 0) {
        showStatus('reportStatus', 'Нет локальных резервных копий', 'warning');
        return;
    }
    
    // Сортируем по дате
    backups.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
    
    // Показываем диалог выбора
    let backupList = 'Выберите резервную копию для восстановления:\n\n';
    backups.forEach((backup, index) => {
        backupList += `${index + 1}. ${backup.data.date} (${backup.data.data.length} записей)\n`;
    });
    
    const choice = prompt(backupList + '\nВведите номер:');
    if (!choice) return;
    
    const selectedBackup = backups[parseInt(choice) - 1];
    if (!selectedBackup) {
        showStatus('reportStatus', 'Неверный выбор', 'error');
        return;
    }
    
    // Восстанавливаем данные
    const confirmed = confirm(`Восстановить данные от ${selectedBackup.data.date}?`);
    if (!confirmed) return;
    
    // Здесь код восстановления...
    showStatus('reportStatus', 'Данные восстановлены из локальной копии', 'success');
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
                            cashContent = `<span style="color: #28a745; font-weight: bold;" title="${result.reason || 'Ручная корректировка'}"><i class="ti ti-cash"></i> <i class="ti ti-pencil"></i> ${formatNumber(result.advance_payment)}</span>`;
                        } else if (result.is_fixed) {
                            hasFixedAdvances = true;
                            cashContent = `<strong style="color: #28a745;" title="Аванс зафиксирован"><i class="ti ti-lock"></i> <i class="ti ti-cash"></i> ${formatNumber(result.advance_payment)}</strong>`;
                        } else {
                            cashContent = `<span style="color: #28a745;"><i class="ti ti-cash"></i> ${formatNumber(result.advance_payment)}</span>`;
                        }
                    } else {
                        // По умолчанию на карту
                        cardContent = formatNumber(result.advance_payment);
                        if (result.is_manual) {
                            hasManualAdjustments = true;
                            cardContent = `<span style="color: #ff6b6b; font-weight: bold;" title="${result.reason || 'Ручная корректировка'}"><i class="ti ti-credit-card"></i> <i class="ti ti-pencil"></i> ${formatNumber(result.advance_payment)}</span>`;
                        } else if (result.is_fixed) {
                            hasFixedAdvances = true;
                            cardContent = `<strong style="color: #f5576c;" title="Аванс зафиксирован"><i class="ti ti-lock"></i> <i class="ti ti-credit-card"></i> ${formatNumber(result.advance_payment)}</strong>`;
                        } else {
                            cardContent = `<span><i class="ti ti-credit-card"></i> ${formatNumber(result.advance_payment)}</span>`;
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
                        button.innerHTML = '<i class="ti ti-pencil"></i>';
                        button.style.cssText = 'padding: 3px 7px; font-size: 11px; cursor: pointer; background: var(--surface); border: .5px solid var(--border-strong); border-radius: 6px; margin-left: 5px; color: var(--text-2);';
                        button.title = 'Корректировать аванс';
                        button.onclick = () => adjustAdvanceManually(employeeId, employeeName);
                        cell.appendChild(button);
                    }
                });
            }

            // Показываем соответствующее сообщение
            if (!silent) {
                if (hasManualAdjustments) {
                    showStatus('reportStatus', 'Аванс рассчитан. Есть ручные корректировки авансов.', 'success');
                } else if (hasFixedAdvances || data.hasFixedAdvances) {
                    showStatus('reportStatus', 'Аванс рассчитан. Используются зафиксированные выплаты.', 'success');
                } else {
                    showStatus('reportStatus', 'Аванс успешно рассчитан. Не забудьте зафиксировать выплату!', 'warning');
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
    
    // НОВОЕ: Получаем динамические лимиты сотрудника
    const limits = await getEmployeeLimits(employeeId);
    
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
    
    // ИЗМЕНЕНО: Используем динамический лимит вместо константы
    const maxAdvanceAmount = limits.maxAdvance;
    
    // НОВОЕ: Спрашиваем тип операции
    const operationType = prompt(
        `Выберите тип операции для ${employeeName}:\n\n` +
        `1 - Обычная корректировка аванса (макс ${formatNumber(maxAdvanceAmount)} грн)\n` +
        `2 - УВОЛЬНЕНИЕ (полная выплата ${formatNumber(totalToPay)} грн)\n\n` +
        `Лимит карты: ${limits.limitName} (${formatNumber(limits.cardLimit)} грн)\n` +
        `Текущие начисления: ${formatNumber(totalToPay)} грн\n` +
        `Текущий аванс: ${formatNumber(currentAdvanceTotal)} грн\n\n` +
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
            `РЕЖИМ УВОЛЬНЕНИЯ\n\n` +
            `Сотрудник: ${employeeName}\n` +
            `К выплате: ${formatNumber(totalToPay)} грн\n\n` +
            `Будет выплачена ВСЯ сумма начислений.\n` +
            `Лимиты аванса НЕ применяются.\n\n` +
            `Продолжить?`
        );
        
        if (!confirmTermination) return;
        
    } else {
        // Обычная корректировка с лимитами
        const totalAdvanceStr = prompt(
            `Корректировка аванса для ${employeeName}\n\n` +
            `Лимит карты: ${limits.limitName}\n\n` +
            `Текущий аванс:\n` +
            `• На карту: ${formatNumber(currentAdvanceCard)} грн\n` +
            `• Наличными: ${formatNumber(currentAdvanceCash)} грн\n` +
            `• Всего: ${formatNumber(currentAdvanceTotal)} грн\n\n` +
            `К выплате всего: ${formatNumber(totalToPay)} грн\n` +
            `Максимум аванса: ${formatNumber(maxAmount)} грн\n\n` +
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
            showStatus('reportStatus', `Аванс не может превышать ${formatNumber(maxAmount)} грн (лимит: ${limits.limitName})`, 'error');
            return;
        }
    }
    
    let advanceCard = 0;
    let advanceCash = 0;
    
    if (totalAdvance > 0) {
        // Выбор способа выплаты
        const paymentChoice = prompt(
            `Как выплатить ${formatNumber(totalAdvance)} грн?\n\n` +
            `1 - Всё на карту (безнал)\n` +
            `2 - Всё наличными\n` +
            `3 - Разделить между картой и наличными\n\n` +
            `Лимит карты: ${formatNumber(limits.cardLimit)} грн\n\n` +
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
            // Разделение суммы - используем динамический лимит
            let defaultCardAmount = Math.min(totalAdvance, limits.cardLimit);
            if (isTermination) {
                // При увольнении предлагаем разумное разделение
                defaultCardAmount = Math.min(totalAdvance, 6000);
            }
            
            const cardAmountStr = prompt(
                `Разделение суммы ${formatNumber(totalAdvance)} грн\n\n` +
                `Сколько выплатить НА КАРТУ?\n` +
                `(остальное будет выплачено наличными)\n\n` +
                `Лимит карты: ${limits.limitName}\n` +
                `Максимум на карту: ${formatNumber(Math.min(totalAdvance, limits.cardLimit))} грн\n` +
                `Остаток наличными: ${formatNumber(totalAdvance - Math.min(totalAdvance, limits.cardLimit))} грн\n\n` +
                `Введите сумму для карты:`,
                defaultCardAmount
            );
            
            if (cardAmountStr === null) return;
            
            advanceCard = parseFloat(cardAmountStr) || 0;
            if (isNaN(advanceCard) || advanceCard < 0 || advanceCard > totalAdvance) {
                showStatus('reportStatus', 'Некорректная сумма для карты', 'error');
                return;
            }
            
            // Проверяем динамический лимит карты
            if (advanceCard > limits.cardLimit) {
                showStatus('reportStatus', `На карту нельзя выплатить больше ${formatNumber(limits.cardLimit)} грн (лимит: ${limits.limitName})`, 'error');
                return;
            }
            
            advanceCash = totalAdvance - advanceCard;
            
            // Подтверждение разделения
            const confirmSplit = confirm(
                `${isTermination ? 'УВОЛЬНЕНИЕ\n' : ''}` +
                `Подтвердите разделение выплаты:\n\n` +
                `<i class="ti ti-credit-card"></i> На карту: ${formatNumber(advanceCard)} грн\n` +
                `<i class="ti ti-cash"></i> Наличными: ${formatNumber(advanceCash)} грн\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `ИТОГО: ${formatNumber(totalAdvance)} грн\n` +
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
                is_termination: isTermination
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', result.message, 'success');
            
            // Обновляем отображение в таблице
            const updateCellContent = (cell, amount, isCard = true) => {
                if (amount > 0) {
                    const icon = isCard ? '<i class="ti ti-credit-card"></i>' : '<i class="ti ti-cash"></i>';
                    const color = isCard ? '#ff6b6b' : '#28a745';
                    const terminationIcon = isTermination ? '<i class="ti ti-door-exit"></i>' : '<i class="ti ti-pencil"></i>';
                    
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
                    background: var(--surface);
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    max-width: 900px;
                    max-height: 600px;
                    overflow-y: auto;
                    z-index: 10000;
                " id="history-modal">
                    <h3 style="margin-bottom: 20px;">История корректировок за ${month}/${year}</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--anthra); color: white;">
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
                        <td style="padding: 10px; border-bottom: 1px solid var(--border);">${adj.employee_name}</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid var(--border);">${formatNumber(adj.advance_amount)} грн</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid var(--border);">${method}</td>
                        <td style="padding: 10px; border-bottom: 1px solid var(--border);">${adj.reason}</td>
                        <td style="padding: 10px; border-bottom: 1px solid var(--border);">${adj.adjusted_by}</td>
                        <td style="padding: 10px; border-bottom: 1px solid var(--border);">${date}</td>
                    </tr>`;
            });
            
            historyHTML += `
                        </tbody>
                    </table>
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="document.getElementById('history-modal').remove(); document.getElementById('history-overlay').remove();" 
                                style="padding: 10px 30px; background: var(--anthra); color: white; border: none; border-radius: 5px; cursor: pointer;">
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

  // Функция проверки целостности данных перед фиксацией
async function validateDataBeforeFixing() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    const errors = [];
    let validCount = 0;
    
    tableRows.forEach(row => {
        if (row.classList.contains('summary-row')) return;
        
        const employeeName = row.dataset.employeeName;
        const employeeId = row.dataset.employeeId;
        
        // Проверяем наличие авансов
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        
        let advanceCard = 0;
        let advanceCash = 0;
        
        if (advanceCardCell) {
            const cardText = advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
            advanceCard = parseFloat(cardText) || 0;
        }
        
        if (advanceCashCell) {
            const cashText = advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.');
            advanceCash = parseFloat(cashText) || 0;
        }
        
        const totalAdvance = advanceCard + advanceCash;
        
        // Проверяем базовые начисления
        const basePay = parseFloat(row.dataset.basePay) || 0;
        
        if (basePay > 0 && totalAdvance === 0) {
            errors.push(`${employeeName}: есть начисления ${basePay} грн, но нет аванса`);
        } else if (totalAdvance > 0) {
            validCount++;
        }
    });
    
    if (errors.length > 0) {
        const errorMessage = `ОБНАРУЖЕНЫ ПРОБЛЕМЫ:\n\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... и еще ${errors.length - 5} ошибок` : ''}\n\nПродолжить фиксацию?`;
        
        return confirm(errorMessage);
    }
    
    console.log(`Проверка пройдена: ${validCount} записей готовы к фиксации`);
    return true;
}

// Добавьте эту функцию в payroll.js
async function validatePayrollCalculations() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    const errors = [];
    
    tableRows.forEach(row => {
        if (row.classList.contains('summary-row')) return;
        
        const employeeId = row.dataset.employeeId;
        const employeeName = row.dataset.employeeName;
        
        // Получаем все значения
        const basePay = parseFloat(row.dataset.basePay) || 0;
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        
        const totalAfterDeductions = basePay + manualBonus - penalty - shortage;
        
        // Получаем авансы
        const advanceCard = parseFloat(row.querySelector('.advance-payment-card')?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        const advanceCash = parseFloat(row.querySelector('.advance-payment-cash')?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        const totalAdvance = advanceCard + advanceCash;
        
        // Получаем остатки
        const cardRemainder = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cashPayout = parseFloat(row.querySelector('.cash-payout')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        
        // Проверяем математику
        const calculatedRemainder = totalAfterDeductions - totalAdvance;
        const actualRemainder = cardRemainder + cashPayout;
        
        if (Math.abs(calculatedRemainder - actualRemainder) > 0.01) {
            errors.push({
                employee: employeeName,
                totalAfterDeductions,
                totalAdvance,
                shouldBe: calculatedRemainder,
                actualIs: actualRemainder,
                difference: actualRemainder - calculatedRemainder
            });
        }
        
        // Проверяем лимит карты
        const totalOnCard = advanceCard + cardRemainder;
        if (totalOnCard > 8700) {
            errors.push({
                employee: employeeName,
                error: `Превышен лимит карты: ${totalOnCard} > 8700`
            });
        }
    });
    
    if (errors.length > 0) {
        console.error('Найдены ошибки в расчетах:', errors);
        alert(`Обнаружено ${errors.length} ошибок в расчетах. См. консоль.`);
    } else {
        console.log('Все расчеты корректны');
        showStatus('reportStatus', 'Проверка пройдена: все расчеты корректны', 'success');
    }
    
    return errors;
}

// Функция для исправления всех расчетов
async function fixAllCalculations() {
    if (!confirm('Это пересчитает все остатки. Продолжить?')) return;
    
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    let fixedCount = 0;
    
    tableRows.forEach(row => {
        if (row.classList.contains('summary-row')) return;
        
        recalculateRow(row);
        fixedCount++;
    });
    
    showStatus('reportStatus', `Пересчитано ${fixedCount} строк`, 'success');
    
    // Сохраняем исправленные данные
    setTimeout(async () => {
        await calculateFinalPayroll();
    }, 1000);
}

async function fixAdvancePayment() {
    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    const advanceEndDate = document.getElementById('reportEndDate')?.value;

    if (!year || !month || !advanceEndDate) {
        showStatus('reportStatus', 'Сначала выберите период и дату расчета', 'error');
        return;
    }

    var _chk = runReportChecks();
    if (_chk.errors > 0) {
        showStatus('reportStatus', 'Нельзя зафиксировать: ' + _chk.errors + ' ошибок в расчёте — исправьте подсвеченные строки.', 'error');
        return;
    }
    
    // НОВОЕ: Создаем локальную резервную копию
    const backupData = await captureCurrentTableState();
    console.log(`Создана резервная копия: ${backupData.length} записей`);
    
    // НОВОЕ: Сохраняем на сервер
    try {
        await fetch(`${API_BASE}/create-backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                year: parseInt(year),
                month: parseInt(month),
                reason: 'before_fix_advance'
            })
        });
    } catch (error) {
        console.error('Ошибка создания резервной копии на сервере:', error);
    }
    
    // Проверка данных
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
        if ((advanceCardCell && advanceCardCell.innerHTML.includes('<i class="ti ti-lock"></i>')) || 
            (advanceCashCell && advanceCashCell.innerHTML.includes('<i class="ti ti-lock"></i>'))) {
            alreadyFixed = true;
        }
    });

    if (alreadyFixed) {
        showStatus('reportStatus', 'Аванс уже зафиксирован!', 'warning');
        return;
    }

    // Сохраняем все корректировки
    showStatus('reportStatus', 'Сохраняем все корректировки перед фиксацией...', 'info');
    
    const savePromises = [];
    tableRows.forEach(row => {
        if (!row.classList.contains('summary-row')) {
            savePromises.push(saveAdjustments(row));
        }
    });
    
    try {
        await Promise.all(savePromises);
        console.log('Все корректировки сохранены перед фиксацией');
    } catch (error) {
        console.error('Ошибка сохранения корректировок:', error);
        if (!confirm('Не все корректировки удалось сохранить. Продолжить фиксацию?')) {
            return;
        }
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
            cardAmount = parseFloat(advanceCardCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        }
        
        if (advanceCashCell) {
            cashAmount = parseFloat(advanceCashCell.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
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
        `Укажите дату фактической выплаты аванса:\n\n` +
        `Будет зафиксировано:\n` +
        `• Сотрудников: ${employeesWithAdvance}\n` +
        `• Общая сумма: ${formatNumber(totalAdvanceAmount)} грн\n\n` +
        `ВНИМАНИЕ! После фиксации изменения будут сохранены.`,
        today
    );

    if (!paymentDate) {
        showStatus('reportStatus', 'Фиксация отменена', 'info');
        return;
    }

    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

    const confirmMessage = `ПОДТВЕРЖДЕНИЕ ФИКСАЦИИ АВАНСА\n\n` +
        `Период: ${monthNames[month - 1]} ${year}\n` +
        `Дата выплаты: ${paymentDate}\n` +
        `Сотрудников: ${employeesWithAdvance}\n` +
        `Сумма: ${formatNumber(totalAdvanceAmount)} грн\n\n` +
        `Продолжить?`;

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
            showStatus('reportStatus', `${result.message}`, 'success');

            // Обновляем визуальное отображение
            tableRows.forEach(row => {
                const advanceCardCell = row.querySelector('.advance-payment-card');
                const advanceCashCell = row.querySelector('.advance-payment-cash');
                
                if (advanceCardCell) {
                    const cardSpan = advanceCardCell.querySelector('.advance-card-content');
                    if (cardSpan) {
                        const currentHTML = cardSpan.innerHTML;
                        if (!currentHTML.includes('<i class="ti ti-lock"></i>') && !currentHTML.includes('>0<')) {
                            cardSpan.innerHTML = currentHTML.replace('<i class="ti ti-credit-card"></i>', '<i class="ti ti-lock"></i> <i class="ti ti-credit-card"></i>');
                        }
                    }
                }
                
                if (advanceCashCell) {
                    const cashSpan = advanceCashCell.querySelector('.advance-cash-content');
                    if (cashSpan) {
                        const currentHTML = cashSpan.innerHTML;
                        if (!currentHTML.includes('<i class="ti ti-lock"></i>') && !currentHTML.includes('>0<')) {
                            cashSpan.innerHTML = currentHTML.replace('<i class="ti ti-cash"></i>', '<i class="ti ti-lock"></i> <i class="ti ti-cash"></i>');
                        }
                    }
                }
                
                recalculateRow(row);
            });
        }
    } catch (error) {
        console.error('Ошибка фиксации аванса:', error);
        
        // НОВОЕ: Предлагаем восстановить из резервной копии
        if (confirm('Произошла ошибка. Восстановить данные из резервной копии?')) {
            await restoreFromLocalBackup();
        }
        
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}


// Новая функция для обновления отображения
function updateAdvanceDisplay(tableRows, isFixed) {
    tableRows.forEach(row => {
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        
        if (isFixed) {
            // Добавляем замки
            [advanceCardCell, advanceCashCell].forEach(cell => {
                if (cell && !cell.innerHTML.includes('<i class="ti ti-lock"></i>')) {
                    const amount = parseFloat(cell.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
                    if (amount > 0) {
                        if (cell.innerHTML.includes('<i class="ti ti-credit-card"></i>')) cell.innerHTML = cell.innerHTML.replace('<i class="ti ti-credit-card"></i>', '<i class="ti ti-credit-card"></i> <i class="ti ti-lock"></i>');
                        else cell.innerHTML = cell.innerHTML.replace('<i class="ti ti-cash"></i>', '<i class="ti ti-cash"></i> <i class="ti ti-lock"></i>');
                    }
                }
            });
        } else {
            // Убираем замки
            [advanceCardCell, advanceCashCell].forEach(cell => {
                if (cell) {
                    cell.innerHTML = cell.innerHTML.replaceAll('<i class="ti ti-lock"></i> ', '').replaceAll('<i class="ti ti-lock"></i>', '');
                }
            });
        }
    });
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
        if ((advanceCardCell && advanceCardCell.innerHTML.includes('<i class="ti ti-lock"></i>')) || 
            (advanceCashCell && advanceCashCell.innerHTML.includes('<i class="ti ti-lock"></i>'))) {
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
                        currentHTML = currentHTML.replaceAll('<i class="ti ti-lock"></i> ', '').replaceAll('<i class="ti ti-lock"></i>', '');
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
                        currentHTML = currentHTML.replaceAll('<i class="ti ti-lock"></i> ', '').replaceAll('<i class="ti ti-lock"></i>', '');
                        // Убираем дополнительные пробелы между иконками
                        currentHTML = currentHTML.replace(/\s+/g, ' ').trim();
                        cashSpan.innerHTML = currentHTML;
                    }
                }
                
                // Если есть старые ячейки .advance-payment (для совместимости)
                const oldAdvanceCell = row.querySelector('.advance-payment');
                if (oldAdvanceCell) {
                    let currentHTML = oldAdvanceCell.innerHTML;
                    currentHTML = currentHTML.replaceAll('<i class="ti ti-lock"></i> ', '').replaceAll('<i class="ti ti-lock"></i>', '');
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
                background: var(--surface);
                border-radius: 10px;
                padding: 20px;
                max-width: 800px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            ">
                <h2 style="color: var(--brand); margin-bottom: 20px;">
                    Обнаружены сотрудники с малым количеством смен
                </h2>
                <p style="margin-bottom: 20px; color: #666;">
                    Следующие сотрудники отработали от 1 до 5 смен. Примите решение по каждому:
                </p>
                <div id="newEmployeesList">`;
    
    newEmployees.forEach((emp, index) => {
        // ИЗМЕНЕНО: Убран хардкод 7900 - теперь просто 90% без ограничения (лимит применяется на сервере)
        const calculatedAdvance = Math.floor(emp.earned_amount * 0.9 / 100) * 100;
        
        dialogHTML += `
            <div class="employee-decision-block" data-employee-id="${emp.employee_id}" style="
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 15px;
                background: #f9f9f9;
            ">
                <h3 style="margin: 0 0 10px 0; color: #333;">
                    ${index + 1}. ${emp.employee_name} 
                    <span style="
                        background: var(--warn-bg);
                        color: #856404;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        margin-left: 10px;
                    ">${emp.shifts_count} ${emp.shifts_count === 1 ? 'СМЕНА' : 'СМЕНЫ'}</span>
                </h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
                    <div>Начислено за ${emp.shifts_count} ${emp.shifts_count === 1 ? 'день' : 'дня'}: <strong>${formatNumber(emp.earned_amount)} грн</strong></div>
                    <div>Расчетный аванс (90%): <strong>${formatNumber(calculatedAdvance)} грн</strong></div>
                </div>
                
                <div style="border-top: 1px solid #dee2e6; margin: 15px 0; padding-top: 15px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: inline-block; margin-right: 15px;">
                            <input type="radio" name="advance_decision_${emp.employee_id}" value="none" checked>
                            Не начислять аванс (мало смен)
                        </label>
                        <label style="display: inline-block; margin-right: 15px;">
                            <input type="radio" name="advance_decision_${emp.employee_id}" value="auto">
                            Начислить автоматически (90%)
                        </label>
                        <label style="display: inline-block;">
                            <input type="radio" name="advance_decision_${emp.employee_id}" value="custom">
                            Указать сумму вручную
                        </label>
                    </div>
                    
                    <div class="advance-inputs" style="display: none; margin-top: 10px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                    <i class="ti ti-credit-card"></i> На карту:
                                </label>
                                <input type="number" 
                                    class="advance-card-input" 
                                    min="0" 
                                    max="${emp.earned_amount}"
                                    value="0"
                                    style="width: 100%; padding: 8px; border: 1px solid var(--border-strong); border-radius: 4px;">
                            </div>
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                    <i class="ti ti-cash"></i> Наличными:
                                </label>
                                <input type="number" 
                                    class="advance-cash-input" 
                                    min="0"
                                    value="0"
                                    style="width: 100%; padding: 8px; border: 1px solid var(--border-strong); border-radius: 4px;">
                            </div>
                        </div>
                        <div style="margin-top: 10px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                Причина/комментарий:
                            </label>
                            <input type="text" 
                                class="advance-reason-input"
                                placeholder="Например: первые дни работы, болезнь и т.д."
                                style="width: 100%; padding: 8px; border: 1px solid var(--border-strong); border-radius: 4px;">
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
                            Сделать постоянным сотрудником (больше не спрашивать при 1-5 сменах)
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
                    border-top: 2px solid var(--border);
                ">
                    <button onclick="cancelNewEmployeesDialog()" style="
                        padding: 10px 20px;
                        background: #6c757d;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">Отмена</button>
                    <button onclick="applyNewEmployeesDecisions(${month}, ${year})" style="
                        padding: 10px 20px;
                        background: var(--anthra);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Применить все решения</button>
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
                    // ИЗМЕНЕНО: Убран хардкод 7900 - лимит применяется на сервере
                    const autoAdvance = Math.floor(emp.earned_amount * 0.9 / 100) * 100;
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
                // ИЗМЕНЕНО: Убран хардкод 7900 - лимит применяется на сервере
                const autoAdvance = Math.floor(emp.earned_amount * 0.9 / 100) * 100;
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
    
    // НОВОЕ: Предупреждение о ручных корректировках
    const hasManualAdjustments = Array.from(tableRows).some(row => {
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        return (advanceCardCell && advanceCardCell.innerHTML.includes('<i class="ti ti-pencil"></i>')) || 
               (advanceCashCell && advanceCashCell.innerHTML.includes('<i class="ti ti-pencil"></i>')) ||
               (advanceCardCell && advanceCardCell.innerHTML.includes('<i class="ti ti-door-exit"></i>')) || 
               (advanceCashCell && advanceCashCell.innerHTML.includes('<i class="ti ti-door-exit"></i>'));
    });
    
    if (hasManualAdjustments) {
        const confirmed = confirm(
            'ВНИМАНИЕ!\n\n' +
            'Обнаружены ручные корректировки авансов или увольнения.\n' +
            'Итоговый расчет СОХРАНИТ все ручные корректировки.\n\n' +
            'Продолжить?'
        );
        if (!confirmed) return;
    }
    
    showStatus('reportStatus', 'Выполняем окончательный расчет с сохранением корректировок...', 'info');

    const year = document.getElementById('reportYear')?.value;
    const month = document.getElementById('reportMonth')?.value;
    const reportEndDate = document.getElementById('reportEndDate')?.value;
    if (!year || !month || !reportEndDate) return;

    try {
        // Сохраняем все корректировки перед расчетом
        const savePromises = [];
        tableRows.forEach(row => {
            if (!row.classList.contains('summary-row')) {
                savePromises.push(saveAdjustments(row));
            }
        });
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
            // Подсчет сохраненных корректировок
            let preservedCount = 0;
            
            tableRows.forEach(row => {
                const employeeId = row.dataset.employeeId;
                const result = data.results[employeeId];

                if (result) {
                    // Проверяем были ли сохранены ручные корректировки
                    const advanceCardCell = row.querySelector('.advance-payment-card');
                    const advanceCashCell = row.querySelector('.advance-payment-cash');
                    
                    if ((advanceCardCell && advanceCardCell.innerHTML.includes('<i class="ti ti-pencil"></i>')) || 
                        (advanceCashCell && advanceCashCell.innerHTML.includes('<i class="ti ti-pencil"></i>')) ||
                        (advanceCardCell && advanceCardCell.innerHTML.includes('<i class="ti ti-door-exit"></i>')) || 
                        (advanceCashCell && advanceCashCell.innerHTML.includes('<i class="ti ti-door-exit"></i>'))) {
                        preservedCount++;
                    }
                    
                    // Обновляем отображение всех полей
                    const totalGrossCell = row.querySelector('.total-gross');
                    if (totalGrossCell) {
                        totalGrossCell.textContent = formatNumber(result.total_gross);
                    }

                    // ВАЖНО: Обновляем остаток на карту
                    const cardRemainderCell = row.querySelector('.card-remainder');
                    if (cardRemainderCell) {
                        // ИЗМЕНЕНИЕ 1: Сохраняем кнопку если она есть
                        const hasButton = cardRemainderCell.innerHTML.includes('button');
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
                        
                        // ИЗМЕНЕНИЕ 2: Восстанавливаем кнопку корректировки если была
                        if (hasButton) {
                            const button = document.createElement('button');
                            button.onclick = () => adjustCardRemainder(employeeId, row.dataset.employeeName);
                            button.style.cssText = 'margin-left: 5px; padding: 2px 6px; font-size: 10px;';
                            button.title = 'Корректировать остаток';
                            button.innerHTML = '<i class="ti ti-pencil"></i>';
                            cardRemainderCell.appendChild(button);
                        }
                    }

                    // ВАЖНО: Обновляем зарплату наличными
                    const cashPayoutCell = row.querySelector('.cash-payout');
                    if (cashPayoutCell) {
                        if (result.cash_payout > 0) {
                            cashPayoutCell.innerHTML = `<strong style="color: #007bff;">${formatNumber(result.cash_payout)}</strong>`;
                        } else {
                            // ИЗМЕНЕНИЕ 3: Убираем <strong> для нулевых значений
                            cashPayoutCell.innerHTML = formatNumber(result.cash_payout);
                        }
                    }

                    // ИЗМЕНЕНИЕ 4: Улучшенный расчет итого к выплате
                    const totalPayoutCell = row.querySelector('.total-payout');
                    if (totalPayoutCell) {
                        const remainingToPay = result.card_remainder + result.cash_payout;
                        totalPayoutCell.innerHTML = `<strong>${formatNumber(remainingToPay)}</strong>`;
                        
                        // Добавляем подсказку для ясности
                        totalPayoutCell.title = `Остаток к выплате: ${formatNumber(remainingToPay)} = ` +
                                              `Остаток на карту: ${formatNumber(result.card_remainder)} + ` +
                                              `Наличные: ${formatNumber(result.cash_payout)}`;
                        
                        // ИЗМЕНЕНИЕ 5: Улучшенная проверка корректности с учетом погрешности
                        const expectedTotal = result.total_after_deductions - result.advance_payment;
                        const discrepancy = Math.abs(remainingToPay - expectedTotal);
                        
                        if (discrepancy > 0.01) {
                            // ИЗМЕНЕНИЕ 6: Более подробное логирование для отладки
                            console.warn(`Расхождение для ${row.dataset.employeeName} (${employeeId}):`);
                            console.warn(`  Начислено после вычетов: ${result.total_after_deductions}`);
                            console.warn(`  Аванс: ${result.advance_payment}`);
                            console.warn(`  Ожидаемый остаток: ${expectedTotal}`);
                            console.warn(`  Фактический остаток: ${remainingToPay}`);
                            console.warn(`  Расхождение: ${discrepancy.toFixed(2)}`);
                            
                            const strongEl = totalPayoutCell.querySelector('strong');
                            if (strongEl) {
                                strongEl.style.color = '#ff6b6b';
                                strongEl.title += ` | Расхождение: ${discrepancy.toFixed(2)} грн`;
                            }
                        }
                    }

                    // Добавляем data-атрибуты для экспорта
                    row.dataset.finalAdvance = result.advance_payment || 0;
                    row.dataset.finalCardRemainder = result.card_remainder || 0;
                    row.dataset.finalCash = result.cash_payout || 0;
                    row.dataset.finalTotal = result.card_remainder + result.cash_payout;
                    
                    // ИЗМЕНЕНИЕ 7: Добавляем атрибуты для отслеживания состояния
                    row.dataset.hasDiscrepancy = Math.abs((result.card_remainder + result.cash_payout) - (result.total_after_deductions - result.advance_payment)) > 0.01 ? 'true' : 'false';

                    // ВАЖНО: Вызываем пересчет строки для обновления итогов
                    setTimeout(() => {
                        recalculateRow(row);
                    }, 100);
                }
            });

            // ИЗМЕНЕНИЕ 8: Улучшенный подсчет итогов
            let totalAdvance = 0;
            let totalCardRemainder = 0;
            let totalCash = 0;
            let totalRemaining = 0;
            let employeesWithCardRemainder = 0;
            let employeesWithCash = 0;
            let employeesWithDiscrepancy = 0;

            tableRows.forEach(row => {
                if (!row.classList.contains('summary-row')) {
                    const advance = parseFloat(row.dataset.finalAdvance) || 0;
                    const cardRemainder = parseFloat(row.dataset.finalCardRemainder) || 0;
                    const cash = parseFloat(row.dataset.finalCash) || 0;

                    totalAdvance += advance;
                    totalCardRemainder += cardRemainder;
                    totalCash += cash;
                    totalRemaining += (cardRemainder + cash);

                    if (cardRemainder > 0) employeesWithCardRemainder++;
                    if (cash > 0) employeesWithCash++;
                    
                    // ИЗМЕНЕНИЕ 9: Считаем сотрудников с расхождениями
                    if (row.dataset.hasDiscrepancy === 'true') {
                        employeesWithDiscrepancy++;
                    }
                }
            });

            // ИЗМЕНЕНИЕ 10: Улучшенное сообщение с информацией о проблемах
            let summaryMessage = `Расчет выполнен для ${tableRows.length - document.querySelectorAll('.summary-row').length} сотрудников.\n`;
            
            if (preservedCount > 0) {
                summaryMessage += `Сохранено ручных корректировок: ${preservedCount}\n`;
            }
            
            if (employeesWithDiscrepancy > 0) {
                summaryMessage += `Обнаружены расхождения у ${employeesWithDiscrepancy} сотрудников (см. консоль)\n`;
            }
            
            summaryMessage += `\n<i class="ti ti-credit-card"></i> Уже выплачено авансом: ${formatNumber(totalAdvance)} грн\n` +
                `<i class="ti ti-credit-card"></i> Остаток на карту у ${employeesWithCardRemainder} чел.: ${formatNumber(totalCardRemainder)} грн\n` +
                `<i class="ti ti-cash"></i> Зарплата наличными у ${employeesWithCash} чел.: ${formatNumber(totalCash)} грн\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `ИТОГО к доплате: ${formatNumber(totalRemaining)} грн`;
            
            // Если есть сообщение от сервера о сохраненных корректировках
            if (data.message) {
                summaryMessage += `\n\n${data.message}`;
            }

            showStatus('reportStatus', summaryMessage, 'success');
            
            // НОВОЕ: Показываем модальное уведомление о сохраненных корректировках
            if (preservedCount > 0) {
                showModalNotification(
                    `Итоговый расчет выполнен. Все ${preservedCount} ручных корректировок сохранены!`,
                    'success',
                    5000
                );
            }
            
            // ИЗМЕНЕНИЕ 11: Предупреждение если есть расхождения
            if (employeesWithDiscrepancy > 0) {
                setTimeout(() => {
                    showModalNotification(
                        `Внимание! Обнаружены расхождения в расчетах у ${employeesWithDiscrepancy} сотрудников. Проверьте консоль для деталей.`,
                        'warning',
                        7000
                    );
                }, 2000);
            }
        }
    } catch (error) {
        console.error('Ошибка при окончательном расчете:', error);
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
        
        // НОВОЕ: Предложение восстановить из резервной копии при ошибке
        if (confirm('Произошла ошибка при расчете. Восстановить предыдущее состояние?')) {
            await restoreFromLocalBackup();
        }
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

async function printAllPayslips() {
    const tableRows = document.querySelectorAll('#monthlyReportTable tbody tr');
    if (tableRows.length === 0) { 
        return showStatus('reportStatus', 'Нет данных для печати', 'error'); 
    }
    
    const month = tableRows[0].dataset.month;
    const year = tableRows[0].dataset.year;
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", 
                        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    async function getShortageDetailsForPrint(employeeId, month, year) {
        try {
            const response = await fetch(
                `${API_BASE}/get-shortages?employee_id=${employeeId}&year=${year}&month=${month}`,
                { credentials: 'include' }
            );
            const result = await response.json();
            return result.shortages || [];
        } catch (error) {
            return [];
        }
    }
    
    let allPayslipsHTML = '<div class="page-container">';
    let payslipCount = 0;
    
    for (const row of tableRows) {
        if (row.classList.contains('summary-row')) continue;

        const employeeId    = row.dataset.employeeId;
        const employeeName  = row.dataset.employeeName;
        const storeAddress  = row.dataset.storeAddress;
        const basePay       = parseFloat(row.dataset.basePay) || 0;
        const manualBonus   = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty       = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage      = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        const bonusReason   = row.querySelector('[name="bonus_reason"]')?.value || '';
        const penaltyReason = row.querySelector('[name="penalty_reason"]')?.value || '';
        
        const shortagesList = await getShortageDetailsForPrint(employeeId, month, year);
        
        const totalGross      = basePay + manualBonus;
        const totalDeductions = penalty + shortage;
        const totalToPay      = totalGross - totalDeductions;
        
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        const advanceCard   = parseFloat(advanceCardCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        const advanceCash   = parseFloat(advanceCashCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
        const cardRemainder = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
        const cashAmount    = parseFloat(row.querySelector('.cash-payout')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;

        if (payslipCount > 0 && payslipCount % 4 === 0) {
            allPayslipsHTML += '</div><div class="page-container">';
        }

        // Считаем количество строк контента для определения размера шрифта
        let contentLines = 6; // базовые строки всегда есть
        if (manualBonus > 0) contentLines += 1;
        if (bonusReason)     contentLines += 1;
        if (penalty > 0)     contentLines += 1;
        if (penaltyReason)   contentLines += 1;
        if (shortage > 0) {
            contentLines += shortagesList.length > 0 
                ? shortagesList.length * 2  // каждая недостача + причина
                : 1;
        }
        if (advanceCard > 0)   contentLines += 1;
        if (advanceCash > 0)   contentLines += 1;
        if (cardRemainder > 0) contentLines += 1;
        if (cashAmount > 0)    contentLines += 1;

        // Адаптивный размер шрифта
        let fontSize, reasonSize, titleSize;
        if (contentLines <= 10) {
            titleSize  = '12pt';
            fontSize   = '10pt';
            reasonSize = '9.5pt';
        } else if (contentLines <= 14) {
            titleSize  = '11pt';
            fontSize   = '9.5pt';
            reasonSize = '9pt';
        } else {
            titleSize  = '10.5pt';
            fontSize   = '9pt';
            reasonSize = '8.5pt';
        }

        // БЛОК ПРЕМИИ
        let bonusHTML = '';
        if (manualBonus > 0) {
            bonusHTML = `
                <tr>
                    <td class="desc">Премия:</td>
                    <td class="amt positive">+${formatNumber(manualBonus)} грн</td>
                </tr>
                ${bonusReason ? `
                <tr>
                    <td colspan="2" class="reason-cell">
                        <span class="reason-label">Причина:</span> ${bonusReason}
                    </td>
                </tr>` : ''}
            `;
        }

        // БЛОК ВЫЧЕТОВ
        let deductionsHTML = '';
        if (totalDeductions > 0) {
            let deductionRows = '';

            if (penalty > 0) {
                deductionRows += `
                    <tr>
                        <td class="desc">Депремирование:</td>
                        <td class="amt negative">−${formatNumber(penalty)} грн</td>
                    </tr>
                    ${penaltyReason ? `
                    <tr>
                        <td colspan="2" class="reason-cell">
                            <span class="reason-label">Причина:</span> ${penaltyReason}
                        </td>
                    </tr>` : ''}
                `;
            }

            if (shortage > 0) {
                if (shortagesList.length > 0) {
                    shortagesList.forEach(s => {
                        deductionRows += `
                            <tr>
                                <td class="desc">Недостача:</td>
                                <td class="amt negative">−${formatNumber(s.amount)} грн</td>
                            </tr>
                            ${s.description ? `
                            <tr>
                                <td colspan="2" class="reason-cell">
                                    <span class="reason-label">Причина:</span> ${s.description}
                                </td>
                            </tr>` : ''}
                        `;
                    });
                } else {
                    deductionRows += `
                        <tr>
                            <td class="desc">Вычет за недостачу:</td>
                            <td class="amt negative">−${formatNumber(shortage)} грн</td>
                        </tr>
                    `;
                }
            }

            deductionsHTML = `
                <div class="section">
                    <div class="section-title">Удержания:</div>
                    <table class="pay-table">
                        ${deductionRows}
                        <tr class="total-row">
                            <td class="desc"><strong>ВСЕГО УДЕРЖАНО:</strong></td>
                            <td class="amt negative"><strong>−${formatNumber(totalDeductions)} грн</strong></td>
                        </tr>
                    </table>
                </div>
            `;
        }

        // БЛОК ВЫПЛАТ
        let paymentsHTML = '';
        if (advanceCard > 0) {
            paymentsHTML += `
                <tr>
                    <td class="desc">Аванс (на карту):</td>
                    <td class="amt">${formatNumber(advanceCard)} грн</td>
                </tr>`;
        }
        if (advanceCash > 0) {
            paymentsHTML += `
                <tr class="cash-row">
                    <td class="desc"><strong>Аванс (НАЛИЧНЫМИ):</strong></td>
                    <td class="amt cash-amt"><strong>${formatNumber(advanceCash)} грн</strong></td>
                </tr>`;
        }
        if (cardRemainder > 0) {
            paymentsHTML += `
                <tr>
                    <td class="desc">Остаток зарплаты (на карту):</td>
                    <td class="amt">${formatNumber(cardRemainder)} грн</td>
                </tr>`;
        }
        if (cashAmount > 0) {
            paymentsHTML += `
                <tr class="cash-row">
                    <td class="desc"><strong>Зарплата (НАЛИЧНЫМИ):</strong></td>
                    <td class="amt cash-amt"><strong>${formatNumber(cashAmount)} грн</strong></td>
                </tr>`;
        }

        allPayslipsHTML += `
        <div class="payslip" style="font-size: ${fontSize};">
            <div class="payslip-inner">

                <div class="ps-title" style="font-size: ${titleSize};">РАСЧЕТНЫЙ ЛИСТ</div>

                <div class="ps-info">
                    <p><strong>Сотрудник:</strong> ${employeeName}</p>
                    <p><strong>Магазин:</strong> ${storeAddress !== 'Старший продавец' ? storeAddress : 'Астрономічна 44Г'}</p>
                    <p><strong>Период:</strong> ${monthNames[month - 1]} ${year}</p>
                </div>

                <div class="section">
                    <div class="section-title">Начисления:</div>
                    <table class="pay-table">
                        <tr>
                            <td class="desc">База (ставка + бонусы за смены):</td>
                            <td class="amt">${formatNumber(basePay)} грн</td>
                        </tr>
                        ${bonusHTML}
                        <tr class="total-row">
                            <td class="desc"><strong>ВСЕГО НАЧИСЛЕНО:</strong></td>
                            <td class="amt"><strong>${formatNumber(totalGross)} грн</strong></td>
                        </tr>
                    </table>
                </div>

                ${deductionsHTML}

                <div class="section highlight-section">
                    <table class="pay-table">
                        <tr>
                            <td class="desc"><strong>К ВЫПЛАТЕ ПОСЛЕ ВЫЧЕТОВ:</strong></td>
                            <td class="amt"><strong>${formatNumber(totalToPay)} грн</strong></td>
                        </tr>
                    </table>
                </div>

                ${paymentsHTML ? `
                <div class="section">
                    <div class="section-title">Выплаты:</div>
                    <table class="pay-table">
                        ${paymentsHTML}
                    </table>
                </div>` : ''}

                <div class="signature-section">
                    <p>С расчетом ознакомлен(а): _________________________</p>
                    <div class="sig-line">
                        <span>Дата: ___________</span>
                        <span>Подпись: ___________</span>
                    </div>
                </div>

            </div>
        </div>`;

        payslipCount++;
    }

    allPayslipsHTML += '</div>';

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Расчетные листы — ${monthNames[month - 1]} ${year}</title>
            <style>
                @page {
                    size: A4 portrait;
                    margin: 5mm;
                }

                * { margin: 0; padding: 0; box-sizing: border-box; }

                body {
                    font-family: Arial, sans-serif;
                    background: var(--surface);
                }

                .page-container {
                    width: 200mm;
                    height: 287mm;
                    margin: 0 auto;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    grid-template-rows: 1fr 1fr;
                    gap: 4mm;
                    page-break-after: always;
                }

                .payslip {
                    border: 1.5px solid #333;
                    overflow: hidden;
                    background: var(--surface);
                    /* Ключевое: фиксированная высота ячейки грида */
                    min-height: 0;
                }

                .payslip-inner {
                    padding: 3.5mm;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 2mm;
                    overflow: hidden;
                }

                .ps-title {
                    text-align: center;
                    font-weight: bold;
                    text-decoration: underline;
                    letter-spacing: 0.5px;
                    flex-shrink: 0;
                }

                .ps-info {
                    flex-shrink: 0;
                }

                .ps-info p {
                    line-height: 1.4;
                }

                .section {
                    border-top: 1px solid var(--border-strong);
                    padding-top: 1.5mm;
                    flex-shrink: 0;
                }

                .section-title {
                    font-weight: bold;
                    text-decoration: underline;
                    margin-bottom: 1mm;
                }

                .pay-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .pay-table td {
                    padding: 0.8mm 0;
                    vertical-align: top;
                    line-height: 1.35;
                }

                .pay-table .desc {
                    width: 68%;
                    padding-right: 2mm;
                }

                .pay-table .amt {
                    width: 32%;
                    text-align: right;
                    white-space: nowrap;
                    font-weight: 600;
                }

                .reason-cell {
                    padding: 0.3mm 0 1mm 3mm !important;
                    color: #444;
                    line-height: 1.3;
                }

                .reason-label {
                    font-weight: bold;
                    color: #222;
                }

                .total-row td {
                    border-top: 1px solid #999;
                    padding-top: 1mm !important;
                }

                .highlight-section {
                    background: var(--surface-2);
                    padding: 2mm;
                    border-radius: 2px;
                    border-top: none !important;
                }

                .positive { color: #1a7a1a; }
                .negative { color: #cc0000; }

                .cash-row td {
                    background: var(--warn-bg);
                    padding: 1mm 1mm !important;
                }

                .cash-amt {
                    color: #c05000 !important;
                    text-decoration: underline;
                }

                /* Подпись всегда прижата к низу */
                .signature-section {
                    margin-top: auto;
                    border-top: 1px solid #aaa;
                    padding-top: 1.5mm;
                    flex-shrink: 0;
                }

                .sig-line {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 1.5mm;
                }

                .no-print {
                    margin: 15px;
                    text-align: center;
                    padding: 15px;
                    background: var(--surface-2);
                    border-radius: 8px;
                    font-family: Arial, sans-serif;
                }

                .no-print button {
                    padding: 10px 25px;
                    font-size: 15px;
                    margin: 0 8px;
                    cursor: pointer;
                    border: none;
                    border-radius: 5px;
                    background: var(--brand);
                    color: white;
                }

                .no-print button.close-btn { background: #dc3545; }

                @media print {
                    .no-print { display: none !important; }
                    .page-container:last-child { page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            <div class="no-print">
                <strong>Предварительный просмотр расчетных листов</strong><br>
                <small>Всего листов: ${payslipCount} · Страниц A4: ${Math.ceil(payslipCount / 4)}</small><br><br>
                <button onclick="window.print()">Печать</button>
                <button class="close-btn" onclick="window.close()">✕ Закрыть</button>
            </div>
            ${allPayslipsHTML}
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
        <tr class="summary-row" style="background-color: var(--surface-2); font-weight: bold;">
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
    
    showStatus('fotReportStatus', `Экспорт выполнен: ${fileName}`, 'success');
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

// ========== НОВЫЕ ФУНКЦИИ ДЛЯ КОРРЕКТИРОВКИ ОСТАТКОВ И НЕДОСТАЧ ==========

// Функция корректировки остатка на карту
async function adjustCardRemainder(employeeId, employeeName) {
    const row = document.querySelector(`tr[data-employee-id="${employeeId}"]`);
    if (!row) return;
    
    const year = row.dataset.year;
    const month = row.dataset.month;
    
    // Получаем текущие значения
    const basePay = parseFloat(row.dataset.basePay) || 0;
    const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
    const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
    const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
    
    const totalGross = basePay + manualBonus;
    const totalDeductions = penalty + shortage;
    const totalAfterDeductions = totalGross - totalDeductions;
    
    // Получаем аванс
    const advanceCardCell = row.querySelector('.advance-payment-card');
    const advanceCashCell = row.querySelector('.advance-payment-cash');
    const advanceCard = parseFloat(advanceCardCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
    const advanceCash = parseFloat(advanceCashCell?.textContent.replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
    const totalAdvance = advanceCard + advanceCash;
    
    // Остаток к выплате
    const remainingToPay = totalAfterDeductions - totalAdvance;
    
    // Текущие значения остатков
    const currentCardRemainder = parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
    const currentCashPayout = parseFloat(row.querySelector('.cash-payout')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0;
    
    // Максимум на карту (лимит минус аванс)
    const maxCard = Math.max(0, 8700 - advanceCard);
    
    // Создаем диалоговое окно
    const dialogHTML = `
        <div id="adjustmentModal" style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--surface);
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 10000;
            min-width: 400px;
        ">
            <h3 style="margin-bottom: 20px; color: var(--brand);">
                Корректировка остатка выплат
            </h3>
            <p><strong>Сотрудник:</strong> ${employeeName}</p>
            <hr style="margin: 15px 0;">
            
            <div style="background: var(--surface-2); padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                <p style="margin: 5px 0;"><strong>К выплате после вычетов:</strong> ${formatNumber(totalAfterDeductions)} грн</p>
                <p style="margin: 5px 0;"><strong>Уже выплачен аванс:</strong> ${formatNumber(totalAdvance)} грн</p>
                <p style="margin: 5px 0; font-size: 18px; color: var(--brand);">
                    <strong>Остается выплатить:</strong> ${formatNumber(remainingToPay)} грн
                </p>
            </div>
            
            <div style="margin: 20px 0;">
                <label style="display: block; margin-bottom: 10px; font-weight: 600;">
                    <i class="ti ti-credit-card"></i> Остаток на карту (макс. ${formatNumber(maxCard)} грн):
                </label>
                <input type="number" id="newCardRemainder" 
                    value="${currentCardRemainder}" 
                    min="0" 
                    max="${Math.min(remainingToPay, maxCard)}"
                    style="width: 100%; padding: 10px; border: 2px solid var(--border); border-radius: 5px; font-size: 16px;">
                
                <label style="display: block; margin: 15px 0 10px 0; font-weight: 600;">
                    <i class="ti ti-cash"></i> Зарплата наличными (автоматически):
                </label>
                <input type="text" id="newCashPayout" 
                    value="${formatNumber(currentCashPayout)}" 
                    readonly
                    style="width: 100%; padding: 10px; border: 2px solid var(--border); border-radius: 5px; font-size: 16px; background: var(--surface-2);">
                
                <div style="margin-top: 10px; padding: 10px; background: var(--warn-bg); border-radius: 5px;">
                    <small>Лимит на карту за месяц: 8700 грн<br>
                    Уже на карте (аванс): ${formatNumber(advanceCard)} грн<br>
                    Доступно для остатка: ${formatNumber(maxCard)} грн</small>
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button onclick="saveCardRemainderAdjustment('${employeeId}')" style="
                    flex: 1;
                    padding: 12px;
                    background: var(--anthra);
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: 600;
                ">Сохранить</button>
                <button onclick="closeAdjustmentModal()" style="
                    flex: 1;
                    padding: 12px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                ">Отмена</button>
            </div>
        </div>
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        " onclick="closeAdjustmentModal()"></div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    
    // Автоматический пересчет наличных при изменении карты
    document.getElementById('newCardRemainder').addEventListener('input', function() {
        const cardValue = parseFloat(this.value) || 0;
        const cashValue = Math.max(0, remainingToPay - cardValue);
        document.getElementById('newCashPayout').value = formatNumber(cashValue);
        
        // Проверка лимитов
        if (cardValue > maxCard) {
            this.style.borderColor = '#dc3545';
            this.setCustomValidity(`Превышен лимит карты. Максимум: ${maxCard} грн`);
        } else {
            this.style.borderColor = '#28a745';
            this.setCustomValidity('');
        }
    });
}

// Сохранение корректировки остатка
async function saveCardRemainderAdjustment(employeeId) {
    const row = document.querySelector(`tr[data-employee-id="${employeeId}"]`);
    const year = row.dataset.year;
    const month = row.dataset.month;
    
    const newCardRemainder = parseFloat(document.getElementById('newCardRemainder').value) || 0;
    const newCashPayout = parseFloat(document.getElementById('newCashPayout').value.replace(/\s/g, '').replace(',', '.')) || 0;
    
    try {
        const response = await fetch(`${API_BASE}/adjust-final-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                employee_id: employeeId,
                year: parseInt(year),
                month: parseInt(month),
                card_remainder: newCardRemainder,
                cash_payout: newCashPayout
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Обновляем отображение в таблице
            const cardRemainderCell = row.querySelector('.card-remainder');
            const cashPayoutCell = row.querySelector('.cash-payout');
            
            if (cardRemainderCell) {
                cardRemainderCell.textContent = formatNumber(newCardRemainder);
                if (newCardRemainder > 0) {
                    cardRemainderCell.style.color = '#28a745';
                    cardRemainderCell.style.fontWeight = 'bold';
                }
            }
            
            if (cashPayoutCell) {
                if (newCashPayout > 0) {
                    cashPayoutCell.innerHTML = `<strong style="color: #007bff;">${formatNumber(newCashPayout)}</strong>`;
                } else {
                    cashPayoutCell.innerHTML = formatNumber(newCashPayout);
                }
            }
            
            showStatus('reportStatus', 'Корректировка остатков сохранена', 'success');
            closeAdjustmentModal();
        } else {
            showStatus('reportStatus', result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        showStatus('reportStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Закрытие модального окна
function closeAdjustmentModal() {
    const modal = document.getElementById('adjustmentModal');
    if (modal) modal.remove();
    const overlay = modal?.nextElementSibling;
    if (overlay) overlay.remove();
}

// ========== ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ НЕДОСТАЧАМИ ==========

// Открытие диалога недостач
async function manageShortages(employeeId, employeeName) {
    const row = document.querySelector(`tr[data-employee-id="${employeeId}"]`);
    if (!row) return;
    
    const year = row.dataset.year;
    const month = row.dataset.month;
    
    // Получаем историю недостач
    try {
        const response = await fetch(`${API_BASE}/get-shortages?employee_id=${employeeId}&year=${year}&month=${month}`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        const shortages = result.shortages || [];
        
        let shortagesHTML = '';
        let totalShortage = 0;
        
        shortages.forEach((shortage, index) => {
            totalShortage += shortage.amount;
            shortagesHTML += `
                <div style="border: 1px solid #dee2e6; border-radius: 5px; padding: 10px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <strong>Недостача #${index + 1}</strong><br>
                            <small>Дата: ${new Date(shortage.created_at).toLocaleDateString('ru-RU')}</small><br>
                            <small>Сумма: ${formatNumber(shortage.amount)} грн</small><br>
                            <small>Описание: ${shortage.description || 'Не указано'}</small><br>
                            <small>Вычет из: ${shortage.deduction_from || 'Не указано'}</small>
                        </div>
                        <button onclick="removeShortage('${shortage.id}')" style="
                            padding: 5px 10px;
                            background: #dc3545;
                            color: white;
                            border: none;
                            border-radius: 3px;
                            cursor: pointer;
                        "></button>
                    </div>
                </div>
            `;
        });
        
        const dialogHTML = `
            <div id="shortagesModal" style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--surface);
                padding: 25px;
                border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                z-index: 10000;
                min-width: 500px;
                max-height: 80vh;
                overflow-y: auto;
            ">
                <h3 style="margin-bottom: 20px; color: var(--brand);">
                    Управление недостачами
                </h3>
                <p><strong>Сотрудник:</strong> ${employeeName}</p>
                <p><strong>Период:</strong> ${month}/${year}</p>
                <hr style="margin: 15px 0;">
                
                <div style="background: var(--surface-2); padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                    <h4>Текущие недостачи:</h4>
                    ${shortagesHTML || '<p>Нет зарегистрированных недостач</p>'}
                    <hr>
                    <strong>Общая сумма недостач: ${formatNumber(totalShortage)} грн</strong>
                </div>
                
                <h4>Добавить новую недостачу:</h4>
                <div style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 5px;">Сумма недостачи (грн):</label>
                    <input type="number" id="shortageAmount" style="width: 100%; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;">
                    
                    <label style="display: block; margin: 10px 0 5px;">Описание (накладная, период, причина):</label>
                    <textarea id="shortageDescription" rows="3" style="width: 100%; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;"></textarea>
                    
                    <label style="display: block; margin: 10px 0 5px;">Вычесть из:</label>
                    <select id="shortageDeduction" style="width: 100%; padding: 8px; border: 1px solid #dee2e6; border-radius: 5px;">
                        <option value="advance">Аванс (15 число)</option>
                        <option value="salary">Зарплата (конец месяца)</option>
                        <option value="both">Разделить 50/50</option>
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="addShortage('${employeeId}')" style="
                        flex: 1;
                        padding: 12px;
                        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: 600;
                    ">Добавить недостачу</button>
                    <button onclick="closeShortagesModal()" style="
                        flex: 1;
                        padding: 12px;
                        background: #6c757d;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">Закрыть</button>
                </div>
            </div>
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            " onclick="closeShortagesModal()"></div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        
    } catch (error) {
        showStatus('reportStatus', `Ошибка загрузки недостач: ${error.message}`, 'error');
    }
}

// Добавление недостачи
async function addShortage(employeeId) {
    const amount = parseFloat(document.getElementById('shortageAmount').value) || 0;
    const description = document.getElementById('shortageDescription').value;
    const deductionFrom = document.getElementById('shortageDeduction').value;
    
    if (amount <= 0) {
        alert('Введите корректную сумму недостачи');
        return;
    }
    
    const row = document.querySelector(`tr[data-employee-id="${employeeId}"]`);
    const year = row.dataset.year;
    const month = row.dataset.month;
    
    try {
        const response = await fetch(`${API_BASE}/add-shortage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                employee_id: employeeId,
                year: parseInt(year),
                month: parseInt(month),
                amount: amount,
                description: description,
                deduction_from: deductionFrom
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', 'Недостача добавлена', 'success');
            closeShortagesModal();
            
            // Обновляем значение в таблице
            const shortageInput = row.querySelector('[name="shortage"]');
            if (shortageInput) {
                const currentShortage = parseFloat(shortageInput.value) || 0;
                shortageInput.value = currentShortage + amount;
                shortageInput.dispatchEvent(new Event('input'));
            }
            
            // Перезагружаем модальное окно
            setTimeout(() => manageShortages(employeeId, row.dataset.employeeName), 500);
        } else {
            alert(result.error || 'Ошибка добавления недостачи');
        }
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

// Удаление недостачи
async function removeShortage(shortageId) {
    if (!confirm('Удалить эту недостачу?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/remove-shortage/${shortageId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('reportStatus', 'Недостача удалена', 'success');
            location.reload(); // Перезагружаем для обновления данных
        }
    } catch (error) {
        alert(`Ошибка: ${error.message}`);
    }
}

function closeShortagesModal() {
    // Удаляем модальное окно
    const modal = document.getElementById('shortagesModal');
    if (modal) modal.remove();
    
    // Удаляем ВСЕ оверлеи (затемнения) - на случай если их несколько
    const overlays = document.querySelectorAll('div[style*="position: fixed"][style*="z-index: 9999"]');
    overlays.forEach(overlay => overlay.remove());
    
    // Дополнительная проверка - удаляем любые затемняющие элементы
    const allOverlays = document.querySelectorAll('div[onclick*="closeShortagesModal"]');
    allOverlays.forEach(overlay => overlay.remove());
}

// Универсальная функция для безопасного закрытия модальных окон
function closeModalSafely(modalId) {
    // Удаляем конкретное модальное окно
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
    
    // Удаляем все оверлеи/затемнения
    const overlays = document.querySelectorAll(`
        div[style*="position: fixed"][style*="background: rgba"],
        div[style*="position: fixed"][style*="z-index: 9999"],
        .modal-overlay,
        .modal-backdrop
    `);
    overlays.forEach(overlay => {
        // Проверяем что это действительно оверлей (не содержит контент)
        if (!overlay.querySelector('button, input, table, h1, h2, h3')) {
            overlay.remove();
        }
    });
}

// Обновляем все функции закрытия
function closeShortagesModal() {
    closeModalSafely('shortagesModal');
}

function closeAdjustmentModal() {
    closeModalSafely('adjustmentModal');
}

function cancelNewEmployeesDialog() {
    closeModalSafely('newEmployeesModal');
}

// Функция для получения деталей недостач
async function getShortageDetails(employeeId, month, year) {
    try {
        const response = await fetch(
            `${API_BASE}/get-shortages?employee_id=${employeeId}&year=${year}&month=${month}`,
            { credentials: 'include' }
        );
        const result = await response.json();
        
        if (result.shortages && result.shortages.length > 0) {
            // Форматируем все недостачи в одну строку
            return result.shortages
                .map(s => `${s.description || 'Недостача'} (${formatNumber(s.amount)} грн)`)
                .join('; ');
        }
        return '';
    } catch (error) {
        console.error('Ошибка получения деталей недостач:', error);
        return '';
    }
}

// ================================================
// JAVASCRIPT для вкладки "Детализация расчетов"
// ================================================
// Добавить в payroll.js в конец файла

// Инициализация вкладки детализации при загрузке страницы
async function initDetailsTab() {
    // Загружаем список сотрудников для выбора
    try {
        const response = await fetch(`${API_BASE}/api/get-employees-list`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success && result.employees) {
            const select = document.getElementById('detailsEmployeeSelect');
            if (select) {
                select.innerHTML = '<option value="">-- Выберите сотрудника --</option>';
                select.innerHTML += '<option value="all">ВСЕ СОТРУДНИКИ</option>';
                
                result.employees.forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp.id;
                    option.textContent = emp.fullname;
                    select.appendChild(option);
                });
            }
        }
        
        // Устанавливаем текущий месяц и год
        const today = new Date();
        const monthSelect = document.getElementById('detailsMonth');
        const yearInput = document.getElementById('detailsYear');
        
        if (monthSelect) monthSelect.value = today.getMonth() + 1;
        if (yearInput) yearInput.value = today.getFullYear();
        
    } catch (error) {
        console.error('Ошибка инициализации вкладки детализации:', error);
    }
}

// Загрузка детализации расчетов
async function loadCalculationDetails() {    const employeeId = document.getElementById('detailsEmployeeSelect')?.value;
    const month = document.getElementById('detailsMonth')?.value;
    const year = document.getElementById('detailsYear')?.value;
    
    if (!employeeId) {
        showStatus('detailsStatus', 'Выберите сотрудника', 'error');
        return;
    }
    
    if (!month || !year) {
        showStatus('detailsStatus', 'Укажите период', 'error');
        return;
    }
    
    showStatus('detailsStatus', 'Загрузка детализации...', 'info');
    
    try {
        const response = await fetch(`${API_BASE}/api/get-calculation-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                employee_id: employeeId, 
                year: parseInt(year), 
                month: parseInt(month) 
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            hideStatus('detailsStatus');
            displayCalculationDetails(result);
        } else {
            showStatus('detailsStatus', result.error || 'Ошибка загрузки', 'error');
        }
    } catch (error) {
        console.error('Ошибка загрузки детализации:', error);
        showStatus('detailsStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Отображение детализации
function displayCalculationDetails(data) {
    const container = document.getElementById('calculationDetailsContent');
    if (!container) return;
    
    const { employee, details, summary, store_stats, adjustments } = data;
    
    if (!details || details.length === 0) {
        container.innerHTML = `
            <div class="status info">
                <p>Нет данных о расчетах за выбранный период для сотрудника <strong>${employee.fullname}</strong></p>
            </div>
        `;
        container.style.display = 'block';
        return;
    }
    
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const month = document.getElementById('detailsMonth')?.value;
    const year = document.getElementById('detailsYear')?.value;
    
    // Получаем данные о корректировках
    const manualBonus = summary.manual_bonus || 0;
    const penalty = summary.penalty || 0;
    const shortage = summary.shortage || 0;
    const totalDeductions = penalty + shortage;
    const totalWithAdjustments = summary.total_with_adjustments || (summary.total_earned + manualBonus - totalDeductions);
    
    let html = `
        <div class="details-summary-panel">
            <h3 style="margin: 0 0 15px 0;">
                ${employee.fullname} 
                ${employee.role === 'seller' ? '(Продавец)' : '(Старший продавец)'}
            </h3>
            <p style="margin: 0; opacity: 0.9;">
                Период: ${monthNames[parseInt(month) - 1]} ${year}
            </p>
            
            <div class="details-summary-grid">
                <div class="details-summary-item">
                    <div class="label">Отработано дней</div>
                    <div class="value">${summary.total_days}</div>
                </div>
                <div class="details-summary-item">
                    <div class="label"><i class="ti ti-cash"></i> Ставка (всего)</div>
                    <div class="value">${formatNumber(summary.total_base)} грн</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">Бонусы за выручку</div>
                    <div class="value">${formatNumber(summary.total_bonus)} грн</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">База (ставка + бонусы)</div>
                    <div class="value">${formatNumber(summary.total_earned)} грн</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">Средняя за день</div>
                    <div class="value">${formatNumber(summary.avg_per_day)} грн</div>
                </div>
            </div>
    `;
    
    // НОВОЕ: Блок корректировок
    if (manualBonus > 0 || totalDeductions > 0) {
        html += `
            <div style="margin-top: 15px; padding: 15px; background: var(--surface-2); border-radius: 8px; border-left: 4px solid var(--brand);">
                <h4 style="margin: 0 0 10px 0; color: var(--brand);">Корректировки:</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
        `;
        
        if (manualBonus > 0) {
            html += `
                <div style="padding: 8px; background: #d4edda; border-radius: 4px;">
                    <strong style="color: #155724;">Премия:</strong> ${formatNumber(manualBonus)} грн
                    ${summary.bonus_reason ? `<br><small style="color: #666;">Причина: ${summary.bonus_reason}</small>` : ''}
                </div>
            `;
        }
        
        if (penalty > 0) {
            html += `
                <div style="padding: 8px; background: #f8d7da; border-radius: 4px;">
                    <strong style="color: #721c24;">Штраф:</strong> ${formatNumber(penalty)} грн
                    ${summary.penalty_reason ? `<br><small style="color: #666;">Причина: ${summary.penalty_reason}</small>` : ''}
                </div>
            `;
        }
        
        if (shortage > 0) {
            html += `
                <div style="padding: 8px; background: var(--warn-bg); border-radius: 4px;">
                    <strong style="color: #856404;">Недостача:</strong> ${formatNumber(shortage)} грн
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
    }
    
    // НОВОЕ: Итоговая сумма с учётом корректировок
    html += `
            <div style="margin-top: 15px; padding: 15px; background: var(--anthra); border-radius: 10px; color: #eceef1;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 16px;">ИТОГО К ВЫПЛАТЕ:</span>
                    <span style="font-size: 24px; font-weight: bold;">${formatNumber(totalWithAdjustments)} грн</span>
                </div>
                ${manualBonus > 0 || totalDeductions > 0 ? `
                <div style="margin-top: 8px; font-size: 12px; opacity: 0.9;">
                    База ${formatNumber(summary.total_earned)} 
                    ${manualBonus > 0 ? `+ премия ${formatNumber(manualBonus)}` : ''} 
                    ${totalDeductions > 0 ? `- вычеты ${formatNumber(totalDeductions)}` : ''}
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Статистика по магазинам
    if (store_stats && Object.keys(store_stats).length > 0) {
        html += `
            <div class="store-stats-panel">
                <h4 style="margin: 0 0 10px 0; color: var(--brand);">Статистика по магазинам:</h4>
        `;
        
        Object.entries(store_stats).forEach(([store, stats]) => {
            html += `
                <div class="store-stat-row">
                    <span><strong>${store}</strong></span>
                    <span>${stats.days} дн. · ${formatNumber(stats.total_earned)} грн</span>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Таблица детализации по дням
    html += `
        <h4 style="margin: 20px 0 10px 0; color: var(--brand);">Детализация по дням:</h4>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 7%;">Дата</th>
                        <th style="width: 13%;">Магазин</th>
                        <th style="width: 11%;">Касса магазина</th>
                        <th style="width: 7%;">Продавцов</th>
                        <th style="width: 9%;">Ставка</th>
                        <th style="width: 9%;">Бонус</th>
                        <th style="width: 34%;">Расшифровка бонуса</th>
                        <th style="width: 10%;">ИТОГО</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    details.forEach((day, index) => {
        const date = new Date(day.date);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const rowClass = day.is_senior ? 'day-row-senior' : (isWeekend ? 'day-row-weekend' : '');
        
        html += `
            <tr class="${rowClass}">
                <td>${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</td>
                <td style="font-size: 11px;">${day.store_address}</td>
                <td style="text-align: right;">${formatNumber(day.revenue)} грн</td>
                <td style="text-align: center;">${day.num_sellers}</td>
                <td style="text-align: right;">${formatNumber(day.base_rate)} грн</td>
                <td style="text-align: right;">${formatNumber(day.bonus)} грн</td>
                <td class="bonus-breakdown">${day.bonus_details}</td>
                <td style="text-align: right;"><strong>${formatNumber(day.total_pay)} грн</strong></td>
            </tr>
        `;
    });
    
    // Итоговая строка таблицы
    html += `
                    <tr class="summary-row" style="background: var(--surface-2); font-weight: bold;">
                        <td colspan="4" style="text-align: right;">ИТОГО (база):</td>
                        <td style="text-align: right;">${formatNumber(summary.total_base)} грн</td>
                        <td style="text-align: right;">${formatNumber(summary.total_bonus)} грн</td>
                        <td></td>
                        <td style="text-align: right;"><strong>${formatNumber(summary.total_earned)} грн</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Кнопки экспорта
    html += `
        <div class="export-buttons">
            <button onclick="exportDetailsToExcel()" class="secondary">
                Экспорт в Excel
            </button>
            <button onclick="printDetails()" class="secondary">
                Печать
            </button>
        </div>
    `;
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// Экспорт детализации в Excel с форматированием
async function exportDetailsToExcel() {
    const employeeId = document.getElementById('detailsEmployeeSelect')?.value;
    const month = document.getElementById('detailsMonth')?.value;
    const year = document.getElementById('detailsYear')?.value;
    
    if (!employeeId) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/export-calculation-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                employee_id: employeeId, 
                year: parseInt(year), 
                month: parseInt(month) 
            })
        });
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // Создаем workbook с ExcelJS
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Детализация');
            
            // Получаем заголовки из первого элемента
            const headers = Object.keys(result.data[0]);
            
            // Добавляем заголовки
            const headerRow = worksheet.addRow(headers);
            headerRow.font = { bold: true, size: 12 };
            headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
            headerRow.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
            
            // Добавляем данные
            result.data.forEach((row, index) => {
                const dataRow = worksheet.addRow(Object.values(row));
                
                // Форматирование ячеек
                dataRow.eachCell((cell, colNumber) => {
                    const value = cell.value;
                    const isNumber = typeof value === 'number' || !isNaN(parseFloat(value));
                    
                    cell.alignment = {
                        horizontal: isNumber ? 'center' : 'left',
                        vertical: 'middle'
                    };
                    
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
                    };
                    
                    // Последняя строка (ИТОГО)
                    if (index === result.data.length - 1) {
                        cell.font = { bold: true };
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF0F2F5' }
                        };
                    }
                });
            });
            
            // Автоширина колонок
            worksheet.columns.forEach((column, index) => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, (cell) => {
                    const cellValue = cell.value ? cell.value.toString() : '';
                    maxLength = Math.max(maxLength, cellValue.length);
                });
                column.width = Math.min(Math.max(maxLength + 2, 10), 50);
            });
            
            // Сохраняем файл
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.filename;
            a.click();
            window.URL.revokeObjectURL(url);
            
            showStatus('detailsStatus', 'Файл успешно экспортирован', 'success');
            setTimeout(() => hideStatus('detailsStatus'), 3000);
        } else {
            showStatus('detailsStatus', result.error || 'Ошибка экспорта', 'error');
        }
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        showStatus('detailsStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Печать детализации
function printDetails() {
    window.print();
}

// ========== ДИАГНОСТИКА (временный код) ==========

// Функция для проверки расчетов конкретного сотрудника
async function debugEmployee(employeeId) {
    const month = document.getElementById('reportMonth')?.value;
    const year = document.getElementById('reportYear')?.value;
    const endDate = document.getElementById('reportEndDate')?.value;
    
    console.group(`ДИАГНОСТИКА: ${employeeId}`);
    console.log('Период:', { month, year, endDate });
    
    // 1. Проверяем что в таблице
    const row = document.querySelector(`tr[data-employee-id="${employeeId}"]`);
    if (row) {
        console.log('<i class="ti ti-clipboard-list"></i> Данные из таблицы:');
        console.log('  - basePay (dataset):', row.dataset.basePay);
        console.log('  - shifts:', row.dataset.shifts);
        console.log('  - employeeName:', row.dataset.employeeName);
        
        // Получаем все значения из ячеек
        const totalGrossCell = row.querySelector('.total-gross');
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        const cardRemainderCell = row.querySelector('.card-remainder');
        const cashPayoutCell = row.querySelector('.cash-payout');
        
        console.log('  - totalGross (ячейка):', totalGrossCell?.textContent);
        console.log('  - advanceCard (ячейка):', advanceCardCell?.textContent);
        console.log('  - advanceCash (ячейка):', advanceCashCell?.textContent);
        console.log('  - cardRemainder (ячейка):', cardRemainderCell?.textContent);
        console.log('  - cashPayout (ячейка):', cashPayoutCell?.textContent);
    } else {
        console.warn('Строка не найдена в таблице!');
    }
    
    // 2. Запрашиваем детализацию с сервера
    try {
        const response = await fetch(`${API_BASE}/api/get-calculation-details`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                employee_id: employeeId, 
                year: parseInt(year), 
                month: parseInt(month) 
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Данные с сервера:');
            console.log('  - Всего дней:', result.details.length);
            console.log('  - Сумма (summary):', result.summary.total_earned);
            
            // Показываем каждый день
            console.log('Детализация по дням:');
            let calculatedTotal = 0;
            result.details.forEach((day, idx) => {
                calculatedTotal += day.total_pay;
                console.log(`    ${idx + 1}. ${day.date}: ${day.total_pay} грн (${day.store_address})`);
            });
            
            console.log('  - Сумма (рассчитанная):', calculatedTotal);
            
            // Сравниваем
            const tableBasePay = parseFloat(row?.dataset.basePay) || 0;
            if (Math.abs(tableBasePay - calculatedTotal) > 0.01) {
                console.error('РАСХОЖДЕНИЕ!');
                console.error('  В таблице:', tableBasePay);
                console.error('  На сервере:', calculatedTotal);
                console.error('  Разница:', tableBasePay - calculatedTotal);
            } else {
                console.log('Суммы совпадают');
            }
        } else {
            console.error('Ошибка API:', result.error);
        }
    } catch (error) {
        console.error('Ошибка запроса:', error);
    }
    
    console.groupEnd();
}

// Функция для проверки всех расчетов
function debugAllCalculations() {
    const rows = document.querySelectorAll('#monthlyReportTable tbody tr:not(.summary-row)');
    
    console.group('ПРОВЕРКА ВСЕХ РАСЧЕТОВ');
    
    let problemsFound = 0;
    
    rows.forEach(row => {
        const employeeId = row.dataset.employeeId;
        const employeeName = row.dataset.employeeName;
        const basePay = parseFloat(row.dataset.basePay) || 0;
        
        // Получаем значения из ячеек
        const advanceCardCell = row.querySelector('.advance-payment-card');
        const advanceCashCell = row.querySelector('.advance-payment-cash');
        const cardRemainderCell = row.querySelector('.card-remainder');
        const cashPayoutCell = row.querySelector('.cash-payout');
        
        // Извлекаем числа
        const extractNum = (cell) => {
            if (!cell) return 0;
            const text = cell.innerText || '';
            const match = text.replace(/[^\d.,]/g, '').replace(',', '.').match(/[\d.]+/);
            return match ? parseFloat(match[0]) : 0;
        };
        
        const advanceCard = extractNum(advanceCardCell);
        const advanceCash = extractNum(advanceCashCell);
        const cardRemainder = extractNum(cardRemainderCell);
        const cashPayout = extractNum(cashPayoutCell);
        
        const manualBonus = parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0;
        const penalty = parseFloat(row.querySelector('[name="penalty"]')?.value) || 0;
        const shortage = parseFloat(row.querySelector('[name="shortage"]')?.value) || 0;
        
        // Расчеты
        const totalGross = basePay + manualBonus;
        const totalDeductions = penalty + shortage;
        const totalAfterDeductions = totalGross - totalDeductions;
        const totalAdvance = advanceCard + advanceCash;
        const expectedRemainder = totalAfterDeductions - totalAdvance;
        const actualRemainder = cardRemainder + cashPayout;
        
        // Проверяем
        const hasDiscrepancy = Math.abs(expectedRemainder - actualRemainder) > 0.01;
        const cardOverLimit = (advanceCard + cardRemainder) > 8700;
        
        if (hasDiscrepancy || cardOverLimit) {
            problemsFound++;
            console.warn(`${employeeName} (${employeeId}):`);
            if (hasDiscrepancy) {
                console.warn(`   Остаток: ожидается ${expectedRemainder.toFixed(2)}, есть ${actualRemainder.toFixed(2)}`);
            }
            if (cardOverLimit) {
                console.warn(`   Превышен лимит карты: ${advanceCard + cardRemainder}`);
            }
        }
    });
    
    if (problemsFound === 0) {
        console.log('Все расчеты корректны!');
    } else {
        console.warn(`Найдено проблем: ${problemsFound}`);
    }
    
    console.groupEnd();
}

// Делаем функции доступными из консоли
window.debugEmployee = debugEmployee;
window.debugAllCalculations = debugAllCalculations;

console.log('Диагностические функции загружены:');
console.log('   debugEmployee("ID_сотрудника") - проверить конкретного сотрудника');
console.log('   debugAllCalculations() - проверить всех');