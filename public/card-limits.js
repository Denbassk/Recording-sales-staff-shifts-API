// card-limits.js - Управление лимитами карты
// Глобальные переменные
let allEmployees = [];
let selectedEmployees = new Set();
let cardLimitTypes = [];

// Инициализация при загрузке страницы
async function initCardLimitsPage() {
    await loadCardLimitTypes();
    await loadEmployeesWithLimits();
}

// Загрузка типов лимитов
async function loadCardLimitTypes() {
    try {
        const response = await fetch(`${API_BASE}/api/card-limit-types`, {
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
        
        const response = await fetch(`${API_BASE}/api/employees-with-limits`, {
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
                        style="padding: 5px 10px; background: #667eea; color: white; 
                               border: none; border-radius: 4px; cursor: pointer;">
                    ✏️ Изменить
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
                      background: white; border: 2px solid #e0e0e0; 
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
        const response = await fetch(`${API_BASE}/api/bulk-update-card-limits`, {
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
            showStatus('cardLimitsStatus', `✅ ${result.message}`, 'success');
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
            <div style="background: white; padding: 25px; border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3); max-width: 500px; width: 90%;">
                <h3 style="margin-bottom: 20px; color: #667eea;">💳 Лимит карты</h3>
                <p><strong>Сотрудник:</strong> ${employeeName}</p>
                <hr style="margin: 15px 0;">
                
                <div style="margin: 20px 0;">
                    ${cardLimitTypes.map(type => `
                        <label style="display: flex; align-items: center; padding: 12px;
                                      background: ${type.id === currentLimitId ? '#e8f5e9' : 'white'};
                                      border: 2px solid ${type.id === currentLimitId ? '#28a745' : '#e0e0e0'};
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
                        flex: 1; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">
                        💾 Сохранить
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
        const response = await fetch(`${API_BASE}/api/update-employee-card-limit`, {
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
                        style="padding: 5px 10px; background: #667eea; color: white; 
                               border: none; border-radius: 4px; cursor: pointer;">
                    ✏️ Изменить
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
