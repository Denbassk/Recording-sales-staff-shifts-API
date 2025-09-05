// Улучшенные функции экспорта для payroll.js
// Эти функции заменят существующие функции экспорта

// Функция для экспорта месячного отчета с правильной структурой данных
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

    // Собираем данные из таблицы в структурированный формат
    const exportData = [];
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", 
                       "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    
    // Получаем все даты работы из первой строки для заголовков
    const firstRow = tableRows[0];
    const shiftsData = firstRow ? JSON.parse(firstRow.dataset.shifts || '[]') : [];
    const workDates = shiftsData.map(day => `${day}.${String(month).padStart(2, '0')}.${year}`);
    
    tableRows.forEach(row => {
        // Пропускаем строки-заголовки магазинов
        if (row.classList.contains('summary-row')) return;
        
        const rowData = {
            'Сотрудник': row.dataset.employeeName || '',
            'Магазин': row.dataset.storeAddress || '',
            'Месяц': `${monthNames[month - 1]} ${year}`,
            'Всего начислено (база)': parseFloat(row.dataset.basePay) || 0,
            'Премирование': parseFloat(row.querySelector('[name="manual_bonus"]')?.value) || 0,
            'Причина премии': row.querySelector('[name="bonus_reason"]')?.value || '',
            'Депремирование': parseFloat(row.querySelector('[name="penalty"]')?.value) || 0,
            'Причина депремирования': row.querySelector('[name="penalty_reason"]')?.value || '',
            'Вычет за недостачу': parseFloat(row.querySelector('[name="shortage"]')?.value) || 0,
            'Всего начислено': parseFloat(row.querySelector('.total-gross')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            'Аванс (на карту)': parseFloat(row.querySelector('.advance-payment')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            'Остаток (на карту)': parseFloat(row.querySelector('.card-remainder')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            'Зарплата (наличными)': parseFloat(row.querySelector('.cash-payout strong')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            'Итого к выплате': parseFloat(row.querySelector('.total-payout strong')?.textContent.replace(/\s/g, '').replace(',', '.')) || 0,
            'Рабочие дни': JSON.parse(row.dataset.shifts || '[]').join(', ')
        };
        
        exportData.push(rowData);
    });

    // Создаем рабочую книгу
    const wb = XLSX.utils.book_new();
    
    // Создаем лист с данными
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Настраиваем ширину колонок
    const colWidths = [
        { wch: 25 }, // Сотрудник
        { wch: 20 }, // Магазин
        { wch: 15 }, // Месяц
        { wch: 15 }, // Всего начислено (база)
        { wch: 12 }, // Премирование
        { wch: 20 }, // Причина премии
        { wch: 15 }, // Депремирование
        { wch: 20 }, // Причина депремирования
        { wch: 15 }, // Вычет за недостачу
        { wch: 15 }, // Всего начислено
        { wch: 15 }, // Аванс
        { wch: 15 }, // Остаток
        { wch: 15 }, // Наличными
        { wch: 15 }, // Итого к выплате
        { wch: 20 }  // Рабочие дни
    ];
    ws['!cols'] = colWidths;
    
    // Добавляем лист в книгу
    XLSX.utils.book_append_sheet(wb, ws, "Отчет за месяц");
    
    // Создаем второй лист со сводкой по магазинам
    const summaryData = [];
    const storeGroups = {};
    
    exportData.forEach(row => {
        const store = row['Магазин'];
        if (!storeGroups[store]) {
            storeGroups[store] = {
                employees: 0,
                totalBase: 0,
                totalBonus: 0,
                totalPenalty: 0,
                totalShortage: 0,
                totalGross: 0,
                totalAdvance: 0,
                totalRemainder: 0,
                totalCash: 0,
                totalPayout: 0
            };
        }
        
        storeGroups[store].employees++;
        storeGroups[store].totalBase += row['Всего начислено (база)'];
        storeGroups[store].totalBonus += row['Премирование'];
        storeGroups[store].totalPenalty += row['Депремирование'];
        storeGroups[store].totalShortage += row['Вычет за недостачу'];
        storeGroups[store].totalGross += row['Всего начислено'];
        storeGroups[store].totalAdvance += row['Аванс (на карту)'];
        storeGroups[store].totalRemainder += row['Остаток (на карту)'];
        storeGroups[store].totalCash += row['Зарплата (наличными)'];
        storeGroups[store].totalPayout += row['Итого к выплате'];
    });
    
    Object.entries(storeGroups).forEach(([store, data]) => {
        summaryData.push({
            'Магазин': store,
            'Кол-во сотрудников': data.employees,
            'Начислено (база)': data.totalBase,
            'Премии': data.totalBonus,
            'Штрафы': data.totalPenalty,
            'Недостачи': data.totalShortage,
            'Всего начислено': data.totalGross,
            'Выплачено авансом': data.totalAdvance,
            'Выплачено остаток': data.totalRemainder,
            'Выплачено наличными': data.totalCash,
            'Итого выплачено': data.totalPayout
        });
    });
    
    if (summaryData.length > 0) {
        const ws2 = XLSX.utils.json_to_sheet(summaryData);
        ws2['!cols'] = [
            { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
            { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 18 }, { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(wb, ws2, "Сводка по магазинам");
    }
    
    // Сохраняем файл
    const fileName = `Отчет_за_${monthNames[month - 1]}_${year}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// Функция для экспорта дневного расчета зарплаты
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
            if (cells.length >= 7) {
                const rowData = {
                    'Дата': date,
                    'Магазин': currentStore,
                    'Сотрудник': cells[0].textContent.replace(/СП/g, '').trim(),
                    'Старший продавец': cells[0].textContent.includes('СП') ? 'Да' : 'Нет',
                    'Касса магазина': storeRevenue,
                    'Кол-во продавцов': parseInt(cells[3].textContent) || 0,
                    'Ставка': parseFloat(cells[4].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0,
                    'Бонус': parseFloat(cells[5].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0,
                    'Итого начислено': parseFloat(cells[6].textContent.replace(/\s/g, '').replace(',', '.').replace('грн', '')) || 0
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
        { wch: 15 }, // Кол-во продавцов
        { wch: 12 }, // Ставка
        { wch: 12 }, // Бонус
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

// Функция для экспорта выручки
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

// Функция для экспорта отчета ФОТ
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
