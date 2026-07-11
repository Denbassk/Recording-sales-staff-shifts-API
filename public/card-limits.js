// card-limits.js - Управление лимитами карты

// ========== КОНФИГУРАЦИЯ API ==========
if (!window.API_BASE) {
    window.API_BASE = window.location.hostname === 'localhost' 
        ? 'http://localhost:3000' 
        : 'https://shifts-api.fly.dev';
}

// Глобальные переменные
let allEmployees = [];
let selectedEmployees = new Set();
let cardLimitTypes = [];

// Скрываем панель настроек при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    const settingsPanel = document.getElementById('limitTypesSettings');
    if (settingsPanel) {
        settingsPanel.style.display = 'none';
    }
});


// Инициализация при загрузке страницы
async function initCardLimitsPage() {
    await loadCardLimitTypes();
    await loadEmployeesWithLimits();
}

// Загрузка типов лимитов
async function loadCardLimitTypes() {
    try {
        const response = await fetch(`${window.API_BASE}/api/card-limit-types`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            cardLimitTypes = result.types;
            renderLimitTypeSelector();
        }
    } catch (error) {
        console.error('Ошибка загрузки типов лимитов:', error);
    }
}

// Загрузка сотрудников с их лимитами
async function loadEmployeesWithLimits() {
    try {
        showStatus('cardLimitsStatus', 'Загрузка данных...', 'info');
        
        const response = await fetch(`${window.API_BASE}/api/employees-with-limits`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            allEmployees = result.employees;
            renderEmployeesTable();
            updateStatistics();
            hideStatus('cardLimitsStatus');
        }
    } catch (error) {
        console.error('Ошибка загрузки сотрудников:', error);
        showStatus('cardLimitsStatus', `Ошибка: ${error.message}`, 'error');
    }
}
       

// Отрисовка таблицы сотрудников
function renderEmployeesTable() {
    const tbody = document.getElementById('cardLimitsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    allEmployees.forEach(emp => {
        const limitInfo = emp.card_limit_types || { limit_name: 'Обычная карта', card_limit: 8700 };
        const isSelected = selectedEmployees.has(emp.id);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align: center;">
                <input type="checkbox" 
                       class="employee-checkbox" 
                       data-employee-id="${emp.id}"
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleEmployeeSelection('${emp.id}')">
            </td>
            <td>${emp.fullname}</td>
            <td>${limitInfo.limit_name}</td>
            <td style="text-align: center;">${limitInfo.card_limit} грн</td>
            <td style="text-align: center;">
                <button onclick="openEditLimitModal('${emp.id}', '${emp.fullname}')" 
                        style="padding: 5px 10px; background: var(--brand); color: white; 
                               border: none; border-radius: 4px; cursor: pointer;">
                    Изменить
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Переключение выбора сотрудника
function toggleEmployeeSelection(employeeId) {
    if (selectedEmployees.has(employeeId)) {
        selectedEmployees.delete(employeeId);
    } else {
        selectedEmployees.add(employeeId);
    }
    updateSelectedCount();
}

// Выбрать всех / Снять выбор
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.employee-checkbox');
    
    if (selectAllCheckbox.checked) {
        checkboxes.forEach(cb => {
            cb.checked = true;
            selectedEmployees.add(cb.dataset.employeeId);
        });
    } else {
        checkboxes.forEach(cb => {
            cb.checked = false;
            selectedEmployees.clear();
        });
    }
    
    updateSelectedCount();
}

// Обновление счетчика выбранных
function updateSelectedCount() {
    const countEl = document.getElementById('selectedCount');
    if (countEl) {
        countEl.textContent = selectedEmployees.size;
    }
    
    const bulkPanel = document.getElementById('bulkActionsPanel');
    if (bulkPanel) {
        bulkPanel.style.display = selectedEmployees.size > 0 ? 'block' : 'none';
    }
}

// Отрисовка селектора типов лимитов
function renderLimitTypeSelector() {
    const container = document.getElementById('limitTypeSelector');
    if (!container) return;
    
    container.innerHTML = cardLimitTypes.map(type => `
        <label style="display: flex; align-items: center; padding: 10px; 
                      background: var(--surface); border: 2px solid var(--border); 
                      border-radius: 8px; cursor: pointer; margin-bottom: 10px;">
            <input type="radio" name="bulk_limit_type" value="${type.id}" 
                   style="margin-right: 10px;">
            <div style="flex: 1;">
                <strong>${type.limit_name}</strong><br>
                <small style="color: #666;">
                    Лимит: ${type.card_limit} грн | Макс. аванс: ${type.max_advance} грн
                </small>
            </div>
        </label>
    `).join('');
}

// Применение массового изменения
async function applyBulkLimitChange() {
    const selectedLimitType = document.querySelector('input[name="bulk_limit_type"]:checked');
    
    if (!selectedLimitType) {
        alert('Выберите тип лимита');
        return;
    }
    
    if (selectedEmployees.size === 0) {
        alert('Выберите хотя бы одного сотрудника');
        return;
    }
    
    const limitType = cardLimitTypes.find(t => t.id == selectedLimitType.value);
    
    if (!confirm(`Изменить лимит на "${limitType.limit_name}" для ${selectedEmployees.size} сотрудников?`)) {
        return;
    }
    
    showStatus('cardLimitsStatus', 'Применение изменений...', 'info');
    
    try {
        const response = await fetch(`${window.API_BASE}/api/bulk-update-card-limits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                employee_ids: Array.from(selectedEmployees),
                new_limit_type_id: parseInt(selectedLimitType.value)
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('cardLimitsStatus', `${result.message}`, 'success');
            selectedEmployees.clear();
            await loadEmployeesWithLimits();
        } else {
            showStatus('cardLimitsStatus', result.error || 'Ошибка изменения', 'error');
        }
    } catch (error) {
        console.error('Ошибка массового изменения:', error);
        showStatus('cardLimitsStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Открытие модалки редактирования для одного сотрудника
async function openEditLimitModal(employeeId, employeeName) {
    const employee = allEmployees.find(e => e.id === employeeId);
    if (!employee) return;
    
    const currentLimitId = employee.card_limit_type_id || 1;
    
    const modalHTML = `
        <div id="editLimitModal" style="
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 10000;">
            <div style="background: var(--surface); padding: 25px; border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 500px; width: 90%;">
                <h3 style="margin-bottom: 20px; color: var(--brand);">Лимит карты</h3>
                <p><strong>Сотрудник:</strong> ${employeeName}</p>
                <hr style="margin: 15px 0;">
                
                <div style="margin: 20px 0;">
                    ${cardLimitTypes.map(type => `
                        <label style="display: flex; align-items: center; padding: 12px;
                                      background: ${type.id === currentLimitId ? '#e8f5e9' : 'white'};
                                      border: 2px solid ${type.id === currentLimitId ? '#28a745' : 'var(--border)'};
                                      border-radius: 8px; cursor: pointer; margin-bottom: 10px;">
                            <input type="radio" name="single_limit_type" value="${type.id}"
                                   ${type.id === currentLimitId ? 'checked' : ''}
                                   style="margin-right: 10px;">
                            <div style="flex: 1;">
                                <strong>${type.limit_name}</strong><br>
                                <small style="color: #666;">
                                    Лимит: ${type.card_limit} грн | Макс. аванс: ${type.max_advance} грн
                                </small>
                            </div>
                        </label>
                    `).join('')}
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px;">
                    <button onclick="saveSingleLimitChange('${employeeId}')" style="
                        flex: 1; padding: 12px; background: var(--anthra);
                        color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                        Сохранить
                    </button>
                    <button onclick="closeEditLimitModal()" style="
                        flex: 1; padding: 12px; background: #6c757d; color: white;
                        border: none; border-radius: 5px; cursor: pointer;">
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Сохранение изменения для одного сотрудника
async function saveSingleLimitChange(employeeId) {
    const selectedLimit = document.querySelector('input[name="single_limit_type"]:checked');
    if (!selectedLimit) return;
    
    try {
        const response = await fetch(`${window.API_BASE}/api/update-employee-card-limit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                employee_id: employeeId,
                new_limit_type_id: parseInt(selectedLimit.value)
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showModalNotification(result.message, 'success');
            closeEditLimitModal();
            await loadEmployeesWithLimits();
        } else {
            alert(result.error || 'Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

// Закрытие модалки
function closeEditLimitModal() {
    const modal = document.getElementById('editLimitModal');
    if (modal) modal.remove();
}

// Обновление статистики
function updateStatistics() {
    const stats = allEmployees.reduce((acc, emp) => {
        const limitName = emp.card_limit_types?.limit_name || 'Обычная карта';
        acc[limitName] = (acc[limitName] || 0) + 1;
        return acc;
    }, {});
    
    const statsEl = document.getElementById('cardLimitsStats');
    if (statsEl) {
        statsEl.innerHTML = Object.entries(stats)
            .map(([name, count]) => `<li>${name}: <strong>${count}</strong> сотрудников</li>`)
            .join('');
    }
}

// Фильтрация таблицы
function filterEmployees() {
    const searchInput = document.getElementById('employeeSearch');
    const limitFilter = document.getElementById('limitFilter');
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const selectedLimit = limitFilter?.value || 'all';
    
    const filtered = allEmployees.filter(emp => {
        const matchesSearch = emp.fullname.toLowerCase().includes(searchTerm);
        const matchesLimit = selectedLimit === 'all' || 
                           emp.card_limit_type_id == selectedLimit;
        return matchesSearch && matchesLimit;
    });
    
    // Перерисовываем таблицу с отфильтрованными данными
    const tbody = document.getElementById('cardLimitsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    filtered.forEach(emp => {
        const limitInfo = emp.card_limit_types || { limit_name: 'Обычная карта', card_limit: 8700 };
        const isSelected = selectedEmployees.has(emp.id);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align: center;">
                <input type="checkbox" class="employee-checkbox" 
                       data-employee-id="${emp.id}"
                       ${isSelected ? 'checked' : ''}
                       onchange="toggleEmployeeSelection('${emp.id}')">
            </td>
            <td>${emp.fullname}</td>
            <td>${limitInfo.limit_name}</td>
            <td style="text-align: center;">${limitInfo.card_limit} грн</td>
            <td style="text-align: center;">
                <button onclick="openEditLimitModal('${emp.id}', '${emp.fullname}')" 
                        style="padding: 5px 10px; background: var(--brand); color: white; 
                               border: none; border-radius: 4px; cursor: pointer;">
                    Изменить
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    const resultCountEl = document.getElementById('filteredCount');
    if (resultCountEl) {
        resultCountEl.textContent = filtered.length;
    }
}

// Экспорт в Excel
function exportCardLimitsToExcel() {
    const exportData = allEmployees.map(emp => ({
        'Сотрудник': emp.fullname,
        'Лимит карты': emp.card_limit_types?.limit_name || 'Обычная карта',
        'Лимит (грн)': emp.card_limit_types?.card_limit || 8700,
        'Макс. аванс (грн)': emp.card_limit_types?.max_advance || 7900
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    ws['!cols'] = [
        { wch: 30 }, // Сотрудник
        { wch: 20 }, // Лимит карты
        { wch: 15 }, // Лимит
        { wch: 15 }  // Макс. аванс
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Лимиты карты");
    
    const fileName = `Лимиты_карты_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// ========== УПРАВЛЕНИЕ ТИПАМИ ЛИМИТОВ (для админов и бухгалтеров) ==========

// Загрузка и отображение редактора типов лимитов
async function loadLimitTypesEditor() {
    const container = document.getElementById('limitTypesEditor');
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center; color: #999;">⏳ Загрузка...</p>';
    
    try {
        const response = await fetch(`${window.API_BASE}/api/card-limit-types`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success && result.types) {
            renderLimitTypesEditor(result.types);
        } else {
            container.innerHTML = '<p style="color: red;">Ошибка загрузки типов лимитов</p>';
        }
    } catch (error) {
        console.error('Ошибка загрузки типов лимитов:', error);
        container.innerHTML = `<p style="color: red;">Ошибка: ${error.message}</p>`;
    }
}

// Отрисовка редактора типов лимитов
function renderLimitTypesEditor(types) {
    const container = document.getElementById('limitTypesEditor');
    if (!container) return;
    
    let html = '<div style="display: flex; flex-direction: column; gap: 15px;">';
    
    types.forEach((type, index) => {
        const isDefault = type.id === 1;
        const isPremium = type.id === 2;
        const canDelete = type.id > 2;
        
        html += `
        <div class="limit-type-card" data-type-id="${type.id}" style="
            background: ${isDefault ? 'var(--surface-2)' : isPremium ? '#e3f2fd' : '#fff3e0'};
            border: 2px solid ${isDefault ? '#dee2e6' : isPremium ? '#2196f3' : '#ff9800'};
            border-radius: 10px;
            padding: 15px;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h5 style="margin: 0; color: #333; display: flex; align-items: center; gap: 8px;">
                    ${isDefault ? '' : isPremium ? '' : ''} 
                    <span class="limit-type-name">${type.limit_name}</span>
                    ${isDefault ? '<span style="color: #666; font-size: 11px; background: #e9ecef; padding: 2px 6px; border-radius: 3px;">по умолчанию</span>' : ''}
                </h5>
                ${canDelete ? `
                <button onclick="deleteLimitType(${type.id}, '${type.limit_name}')" 
                        style="background: #dc3545; color: white; border: none; 
                               padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;"
                        title="Удалить тип лимита">
                    Удалить
                </button>
                ` : ''}
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                <div class="control-group">
                    <label style="font-size: 11px; color: #666; display: block; margin-bottom: 4px;">
                        Название:
                    </label>
                    <input type="text" 
                           class="limit-name-input" 
                           data-type-id="${type.id}"
                           value="${type.limit_name}"
                           ${isDefault || isPremium ? 'readonly' : ''}
                           style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;
                                  ${isDefault || isPremium ? 'background: #f5f5f5; color: #666;' : ''}">
                </div>
                
                <div class="control-group">
                    <label style="font-size: 11px; color: #666; display: block; margin-bottom: 4px;">
                        Лимит на карту (грн/мес):
                    </label>
                    <input type="number" 
                           class="card-limit-input" 
                           data-type-id="${type.id}"
                           value="${type.card_limit}"
                           min="1000" max="100000" step="100"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
                </div>
                
                <div class="control-group">
                    <label style="font-size: 11px; color: #666; display: block; margin-bottom: 4px;">
                        Макс. аванс (грн):
                    </label>
                    <input type="number" 
                           class="max-advance-input" 
                           data-type-id="${type.id}"
                           value="${type.max_advance}"
                           min="0" max="100000" step="100"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
                </div>
                
                <div class="control-group">
                    <label style="font-size: 11px; color: #666; display: block; margin-bottom: 4px;">
                        % аванса от начислений:
                    </label>
                    <input type="number" 
                           class="advance-percentage-input" 
                           data-type-id="${type.id}"
                           value="${Math.round((type.advance_percentage || 0.9) * 100)}"
                           min="0" max="100" step="5"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
                </div>
            </div>
            
            <div style="margin-top: 12px; padding: 8px 12px; background: rgba(0,0,0,0.04); border-radius: 5px;">
                <small style="color: #555;">
                    <strong>Логика:</strong> 
                    Аванс = MIN(Начислено × <span class="preview-percent">${Math.round((type.advance_percentage || 0.9) * 100)}%</span>, 
                    <span class="preview-max-advance">${type.max_advance}</span> грн), 
                    на карту не более <span class="preview-card-limit">${type.card_limit}</span> грн/мес
                </small>
            </div>
        </div>
        `;
    });
    
    // Кнопка просмотра истории
    html += `
        <div style="margin-top: 15px; text-align: right;">
            <button onclick="showLimitTypesHistory()" 
                    style="background: #6c757d; color: white; border: none; 
                           padding: 8px 15px; border-radius: 5px; cursor: pointer;">
                История изменений
            </button>
        </div>
    `;
    
    html += '</div>';
    container.innerHTML = html;
    
    // Добавляем обработчики для live-preview
    container.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateLimitPreview);
    });
}

// Обновление превью при изменении значений
function updateLimitPreview(event) {
    const input = event.target;
    const card = input.closest('.limit-type-card');
    if (!card) return;
    
    const cardLimit = card.querySelector('.card-limit-input')?.value || 0;
    const maxAdvance = card.querySelector('.max-advance-input')?.value || 0;
    const percentage = card.querySelector('.advance-percentage-input')?.value || 90;
    
    // Обновляем превью
    const previewCardLimit = card.querySelector('.preview-card-limit');
    const previewMaxAdvance = card.querySelector('.preview-max-advance');
    const previewPercent = card.querySelector('.preview-percent');
    
    if (previewCardLimit) previewCardLimit.textContent = cardLimit;
    if (previewMaxAdvance) previewMaxAdvance.textContent = maxAdvance;
    if (previewPercent) previewPercent.textContent = percentage + '%';
    
    // Подсветка если макс. аванс > лимита карты (ошибка)
    if (parseInt(maxAdvance) > parseInt(cardLimit)) {
        card.style.borderColor = '#dc3545';
        card.querySelector('.max-advance-input').style.borderColor = '#dc3545';
    } else {
        card.style.borderColor = '';
        card.querySelector('.max-advance-input').style.borderColor = 'var(--border)';
    }
}

// Добавление нового типа лимита
async function addNewLimitType() {
    const name = prompt('Введите название нового типа лимита:', 'VIP карта');
    if (!name || !name.trim()) return;
    
    const cardLimit = prompt('Лимит на карту (грн/месяц):', '20000');
    if (!cardLimit) return;
    
    const maxAdvance = prompt('Максимальный аванс (грн):', '15000');
    if (!maxAdvance) return;
    
    // Валидация
    if (parseInt(maxAdvance) > parseInt(cardLimit)) {
        alert('Максимальный аванс не может быть больше лимита карты!');
        return;
    }
    
    showStatus('cardLimitsStatus', 'Добавление типа лимита...', 'info');
    
    try {
        const response = await fetch(`${window.API_BASE}/api/add-card-limit-type`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                limit_name: name.trim(),
                card_limit: parseInt(cardLimit),
                max_advance: parseInt(maxAdvance),
                advance_percentage: 0.9
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('cardLimitsStatus', 'Новый тип лимита добавлен!', 'success');
            await loadLimitTypesEditor();
            await loadCardLimitTypes();
        } else {
            showStatus('cardLimitsStatus', result.error || 'Ошибка добавления', 'error');
        }
    } catch (error) {
        console.error('Ошибка добавления типа лимита:', error);
        showStatus('cardLimitsStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Сохранение всех изменений типов лимитов
async function saveLimitTypes() {
    const cards = document.querySelectorAll('.limit-type-card');
    const updates = [];
    const errors = [];
    
    cards.forEach(card => {
        const typeId = parseInt(card.dataset.typeId);
        const limitName = card.querySelector('.limit-name-input')?.value?.trim() || '';
        const cardLimit = parseInt(card.querySelector('.card-limit-input')?.value) || 0;
        const maxAdvance = parseInt(card.querySelector('.max-advance-input')?.value) || 0;
        const advancePercentage = parseFloat(card.querySelector('.advance-percentage-input')?.value) || 90;
        
        // Валидация
        if (!limitName) {
            errors.push(`Тип #${typeId}: название не может быть пустым`);
        }
        if (cardLimit < 1000) {
            errors.push(`${limitName}: лимит карты должен быть не менее 1000 грн`);
        }
        if (maxAdvance > cardLimit) {
            errors.push(`${limitName}: макс. аванс (${maxAdvance}) не может превышать лимит карты (${cardLimit})`);
        }
        if (advancePercentage < 0 || advancePercentage > 100) {
            errors.push(`${limitName}: процент должен быть от 0 до 100`);
        }
        
        updates.push({
            id: typeId,
            limit_name: limitName,
            card_limit: cardLimit,
            max_advance: maxAdvance,
            advance_percentage: advancePercentage / 100
        });
    });
    
    // Если есть ошибки валидации
    if (errors.length > 0) {
        showStatus('cardLimitsStatus', `Ошибки:\n${errors.join('\n')}`, 'error');
        alert('Обнаружены ошибки:\n\n' + errors.join('\n'));
        return;
    }
    
    // Подтверждение
    const confirmMsg = `Сохранить изменения для ${updates.length} типов лимитов?\n\n` +
                       `Это повлияет на расчет зарплаты для всех сотрудников с этими типами карт!`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    showStatus('cardLimitsStatus', 'Сохранение изменений...', 'info');
    
    try {
        const response = await fetch(`${window.API_BASE}/api/update-card-limit-types`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ updates })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('cardLimitsStatus', 'Все изменения сохранены!', 'success');
            
            // Очищаем кэш лимитов на клиенте (если используется)
            if (typeof employeeLimitsCache !== 'undefined') {
                employeeLimitsCache.clear();
                console.log('Кэш лимитов очищен');
            }
            
            // Перезагружаем данные
            await loadLimitTypesEditor();
            await loadCardLimitTypes();
            await loadEmployeesWithLimits();
            
            // Уведомление
            if (typeof showModalNotification === 'function') {
                showModalNotification('Типы лимитов обновлены! Изменения применены.', 'success');
            }
        } else {
            showStatus('cardLimitsStatus', result.error || 'Ошибка сохранения', 'error');
        }
    } catch (error) {
        console.error('Ошибка сохранения типов лимитов:', error);
        showStatus('cardLimitsStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Удаление типа лимита
async function deleteLimitType(typeId, typeName) {
    const confirmMsg = `Удалить тип лимита "${typeName}"?\n\n` +
                       `Все сотрудники с этим типом будут переведены на "Обычную карту".`;
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    showStatus('cardLimitsStatus', 'Удаление типа лимита...', 'info');
    
    try {
        const response = await fetch(`${window.API_BASE}/api/delete-card-limit-type/${typeId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showStatus('cardLimitsStatus', 'Тип лимита удален', 'success');
            await loadLimitTypesEditor();
            await loadCardLimitTypes();
            await loadEmployeesWithLimits();
        } else {
            showStatus('cardLimitsStatus', result.error || 'Ошибка удаления', 'error');
        }
    } catch (error) {
        console.error('Ошибка удаления типа лимита:', error);
        showStatus('cardLimitsStatus', `Ошибка: ${error.message}`, 'error');
    }
}

// Показать историю изменений лимитов
async function showLimitTypesHistory() {
    try {
        const response = await fetch(`${window.API_BASE}/api/card-limit-types-history`, {
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (!result.success || !result.history || result.history.length === 0) {
            alert('История изменений пуста');
            return;
        }
        
        let historyHTML = `
            <div id="limitHistoryModal" style="
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); display: flex; align-items: center;
                justify-content: center; z-index: 10000;">
                <div style="background: var(--surface); padding: 25px; border-radius: 10px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 800px; 
                            width: 90%; max-height: 80vh; overflow-y: auto;">
                    <h3 style="margin-bottom: 20px; color: var(--brand);">История изменений лимитов</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: var(--surface-2);">
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Дата</th>
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Тип</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Лимит</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Макс. аванс</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">%</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Действие</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        result.history.forEach(record => {
            const date = new Date(record.changed_at).toLocaleString('ru-RU');
            historyHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 8px;">${date}</td>
                    <td style="padding: 8px;">${record.limit_name}</td>
                    <td style="padding: 8px; text-align: center;">${record.card_limit} грн</td>
                    <td style="padding: 8px; text-align: center;">${record.max_advance} грн</td>
                    <td style="padding: 8px; text-align: center;">${Math.round(record.advance_percentage * 100)}%</td>
                    <td style="padding: 8px; text-align: center;">
                        <button onclick="rollbackLimitType(${record.id})" 
                                style="background: #ffc107; color: #333; border: none; 
                                       padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                            ↩Откатить
                        </button>
                    </td>
                </tr>
            `;
        });
        
        historyHTML += `
                        </tbody>
                    </table>
                    <div style="text-align: center; margin-top: 20px;">
                        <button onclick="closeLimitHistoryModal()" 
                                style="padding: 10px 30px; background: #6c757d; color: white; 
                                       border: none; border-radius: 5px; cursor: pointer;">
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', historyHTML);
        
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

// Закрыть модалку истории
function closeLimitHistoryModal() {
    const modal = document.getElementById('limitHistoryModal');
    if (modal) modal.remove();
}

// Откатить к значениям из истории
async function rollbackLimitType(historyId) {
    if (!confirm('Восстановить эти значения лимита?\n\nТекущие значения будут сохранены в историю.')) {
        return;
    }
    
    try {
        const response = await fetch(`${window.API_BASE}/api/rollback-card-limit-type`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ history_id: historyId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('' + result.message);
            closeLimitHistoryModal();
            await loadLimitTypesEditor();
            await loadCardLimitTypes();
            
            // Очищаем кэш
            if (typeof employeeLimitsCache !== 'undefined') {
                employeeLimitsCache.clear();
            }
        } else {
            alert('Ошибка: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка отката:', error);
        alert(`Ошибка: ${error.message}`);
    }
}

// Переопределяем initCardLimitsPage чтобы показывать редактор для админов/бухгалтеров
const _originalInitCardLimitsPage = initCardLimitsPage;
initCardLimitsPage = async function() {
    // Вызываем оригинальную функцию
    await _originalInitCardLimitsPage();
    
    // Проверяем что мы ТОЧНО на вкладке "Лимиты карты"
    const cardLimitsTab = document.getElementById('cardLimits-tab');
    const isCardLimitsTabActive = cardLimitsTab && 
                                   cardLimitsTab.style.display !== 'none' && 
                                   cardLimitsTab.classList.contains('active');
    
    // Также проверяем что таблица лимитов видна на странице
    const cardLimitsTable = document.getElementById('cardLimitsTableBody');
    
    if (!isCardLimitsTabActive && !cardLimitsTable) {
        // Скрываем панель если не на вкладке лимитов
        const settingsPanel = document.getElementById('limitTypesSettings');
        if (settingsPanel) {
            settingsPanel.style.display = 'none';
        }
        return;
    }
    
    // Проверяем права и показываем редактор
    try {
        const response = await fetch(`${window.API_BASE}/check-auth`, { credentials: 'include' });
        const data = await response.json();
        
        if (data.success && data.user) {
            const canEditLimits = data.user.role === 'admin' || data.user.role === 'accountant';
            
            const settingsPanel = document.getElementById('limitTypesSettings');
            if (settingsPanel && canEditLimits) {
                settingsPanel.style.display = 'block';
                await loadLimitTypesEditor();
            }
        }
    } catch (error) {
        console.error('Ошибка проверки прав для редактора лимитов:', error);
    }
};
