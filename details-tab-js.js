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
async function loadCalculationDetails() {
    const employeeId = document.getElementById('detailsEmployeeSelect')?.value;
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
    
    const { employee, details, summary, store_stats } = data;
    
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
    
    let html = `
        <div class="details-summary-panel">
            <h3 style="margin: 0 0 15px 0;">
                👤 ${employee.fullname} 
                ${employee.role === 'seller' ? '(Продавец)' : '(Старший продавец)'}
            </h3>
            <p style="margin: 0; opacity: 0.9;">
                Период: ${monthNames[parseInt(month) - 1]} ${year}
            </p>
            
            <div class="details-summary-grid">
                <div class="details-summary-item">
                    <div class="label">📅 Отработано дней</div>
                    <div class="value">${summary.total_days}</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">💰 Всего начислено</div>
                    <div class="value">${formatNumber(summary.total_earned)} грн</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">📊 Средняя за день</div>
                    <div class="value">${formatNumber(summary.avg_per_day)} грн</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">💵 Ставка (всего)</div>
                    <div class="value">${formatNumber(summary.total_base)} грн</div>
                </div>
                <div class="details-summary-item">
                    <div class="label">🎁 Бонусы (всего)</div>
                    <div class="value">${formatNumber(summary.total_bonus)} грн</div>
                </div>
            </div>
        </div>
    `;
    
    // Статистика по магазинам (если есть)
    if (store_stats && Object.keys(store_stats).length > 0) {
        html += `
            <div class="store-stats-panel">
                <h4 style="margin: 0 0 10px 0; color: #667eea;">🏪 Статистика по магазинам:</h4>
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
    
    // Таблица с детализацией по дням
    html += `
        <h4 style="margin: 20px 0 10px 0; color: #667eea;">📅 Детализация по дням:</h4>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 10%;">Дата</th>
                        <th style="width: 20%;">Магазин</th>
                        <th style="width: 12%;">Касса магазина</th>
                        <th style="width: 8%;">Продавцов</th>
                        <th style="width: 10%;">Ставка</th>
                        <th style="width: 10%;">Бонус</th>
                        <th style="width: 20%;">Расшифровка бонуса</th>
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
    
    // Итоговая строка
    html += `
                    <tr class="summary-row" style="background: #f0f2f5; font-weight: bold;">
                        <td colspan="4" style="text-align: right;">ИТОГО:</td>
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
                📊 Экспорт в Excel
            </button>
            <button onclick="printDetails()" class="secondary">
                🖨️ Печать
            </button>
        </div>
    `;
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// Экспорт детализации в Excel
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
            // Создаем Excel файл
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(result.data);
            
            // Настраиваем ширину колонок
            ws['!cols'] = [
                { wch: 5 },  // №
                { wch: 12 }, // Дата
                { wch: 25 }, // Магазин
                { wch: 15 }, // Выручка
                { wch: 12 }, // Продавцов
                { wch: 10 }, // Ставка
                { wch: 10 }, // Бонус
                { wch: 35 }, // Расшифровка
                { wch: 12 }, // Итого
                { wch: 12 }  // Старший
            ];
            
            XLSX.utils.book_append_sheet(wb, ws, "Детализация");
            XLSX.writeFile(wb, result.filename);
            
            showStatus('detailsStatus', '✅ Файл успешно экспортирован', 'success');
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

// Вызываем инициализацию при загрузке вкладки
document.addEventListener('DOMContentLoaded', function() {
    // Инициализируем вкладку детализации при переключении на неё
    const detailsButton = document.getElementById('details-tab-button');
    if (detailsButton) {
        detailsButton.addEventListener('click', function() {
            initDetailsTab();
        });
    }
});
