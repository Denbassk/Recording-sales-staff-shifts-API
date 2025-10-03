// universal-corrections.js - Универсальная система корректировок

class UniversalCorrectionsModal {
    constructor() {
        this.currentEmployee = null;
        this.currentMonth = null;
        this.currentYear = null;
        this.originalData = null;
        this.adjustedData = null;
    }

    // Открытие модального окна
    async open(employeeId, employeeName, month, year) {
        this.currentEmployee = { id: employeeId, name: employeeName };
        this.currentMonth = month;
        this.currentYear = year;
        
        // Загружаем все данные сотрудника
        await this.loadEmployeeData();
        
        // Создаем и показываем модальное окно
        this.createModal();
    }

    // Загрузка всех данных сотрудника
    async loadEmployeeData() {
        try {
            const response = await fetch(`${API_BASE}/get-employee-full-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employee_id: this.currentEmployee.id,
                    month: this.currentMonth,
                    year: this.currentYear
                })
            });
            
            const data = await response.json();
            this.originalData = data;
            this.adjustedData = JSON.parse(JSON.stringify(data)); // Глубокая копия
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
        }
    }

    // Создание модального окна
    createModal() {
        // Удаляем существующее модальное окно если есть
        const existing = document.getElementById('universal-corrections-modal');
        if (existing) existing.remove();

        const modalHTML = `
        <div id="universal-corrections-modal" class="ucm-overlay">
            <div class="ucm-container">
                <div class="ucm-header">
                    <h2>💼 Универсальная корректировка выплат</h2>
                    <button class="ucm-close" onclick="ucModal.close()">✕</button>
                </div>
                
                <div class="ucm-employee-info">
                    <div class="ucm-info-card">
                        <h3>${this.currentEmployee.name}</h3>
                        <span class="ucm-period">${this.getMonthName(this.currentMonth)} ${this.currentYear}</span>
                    </div>
                </div>

                <div class="ucm-tabs">
                    <button class="ucm-tab active" data-tab="summary">📊 Сводка</button>
                    <button class="ucm-tab" data-tab="advance">💰 Аванс</button>
                    <button class="ucm-tab" data-tab="salary">💵 Зарплата</button>
                    <button class="ucm-tab" data-tab="bonuses">🎁 Премии/Штрафы</button>
                    <button class="ucm-tab" data-tab="shortages">📉 Недостачи</button>
                    <button class="ucm-tab" data-tab="special">⚡ Особые случаи</button>
                </div>

                <div class="ucm-content">
                    <!-- Вкладка Сводка -->
                    <div class="ucm-tab-content active" data-content="summary">
                        ${this.renderSummaryTab()}
                    </div>
                    
                    <!-- Вкладка Аванс -->
                    <div class="ucm-tab-content" data-content="advance">
                        ${this.renderAdvanceTab()}
                    </div>
                    
                    <!-- Вкладка Зарплата -->
                    <div class="ucm-tab-content" data-content="salary">
                        ${this.renderSalaryTab()}
                    </div>
                    
                    <!-- Вкладка Премии/Штрафы -->
                    <div class="ucm-tab-content" data-content="bonuses">
                        ${this.renderBonusesTab()}
                    </div>
                    
                    <!-- Вкладка Недостачи -->
                    <div class="ucm-tab-content" data-content="shortages">
                        ${this.renderShortagesTab()}
                    </div>
                    
                    <!-- Вкладка Особые случаи -->
                    <div class="ucm-tab-content" data-content="special">
                        ${this.renderSpecialTab()}
                    </div>
                </div>

                <div class="ucm-live-preview">
                    <h4>📋 Предварительный расчет:</h4>
                    <div id="ucm-preview-content">
                        ${this.renderLivePreview()}
                    </div>
                </div>

                <div class="ucm-footer">
                    <button class="ucm-btn ucm-btn-secondary" onclick="ucModal.reset()">
                        🔄 Сбросить изменения
                    </button>
                    <button class="ucm-btn ucm-btn-primary" onclick="ucModal.save()">
                        💾 Сохранить все изменения
                    </button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.attachEventListeners();
    }

    // Рендер вкладки Сводка
    renderSummaryTab() {
        const d = this.originalData;
        return `
        <div class="ucm-summary-grid">
            <div class="ucm-summary-card">
                <h4>Начисления</h4>
                <div class="ucm-summary-row">
                    <span>База (смены):</span>
                    <strong>${this.formatNumber(d.basePay)} грн</strong>
                </div>
                <div class="ucm-summary-row">
                    <span>Премии:</span>
                    <strong class="positive">${this.formatNumber(d.bonuses)} грн</strong>
                </div>
                <div class="ucm-summary-row total">
                    <span>Всего начислено:</span>
                    <strong>${this.formatNumber(d.totalGross)} грн</strong>
                </div>
            </div>
            
            <div class="ucm-summary-card">
                <h4>Вычеты</h4>
                <div class="ucm-summary-row">
                    <span>Штрафы:</span>
                    <strong class="negative">${this.formatNumber(d.penalties)} грн</strong>
                </div>
                <div class="ucm-summary-row">
                    <span>Недостачи:</span>
                    <strong class="negative">${this.formatNumber(d.shortages)} грн</strong>
                </div>
                <div class="ucm-summary-row total">
                    <span>Всего вычетов:</span>
                    <strong class="negative">${this.formatNumber(d.totalDeductions)} грн</strong>
                </div>
            </div>
            
            <div class="ucm-summary-card">
                <h4>Выплаты</h4>
                <div class="ucm-summary-row">
                    <span>Аванс:</span>
                    <strong>${this.formatNumber(d.advanceTotal)} грн</strong>
                </div>
                <div class="ucm-summary-row">
                    <span>Зарплата:</span>
                    <strong>${this.formatNumber(d.salaryTotal)} грн</strong>
                </div>
                <div class="ucm-summary-row total">
                    <span>К выплате итого:</span>
                    <strong class="primary">${this.formatNumber(d.totalToPay)} грн</strong>
                </div>
            </div>
        </div>`;
    }

    // Рендер вкладки Аванс
    renderAdvanceTab() {
        return `
        <div class="ucm-form-section">
            <h4>Корректировка аванса</h4>
            
            <div class="ucm-quick-actions">
                <button class="ucm-quick-btn" onclick="ucModal.setAdvancePreset('standard')">
                    📐 Стандартный (90%)
                </button>
                <button class="ucm-quick-btn" onclick="ucModal.setAdvancePreset('max')">
                    📈 Максимальный (7900)
                </button>
                <button class="ucm-quick-btn" onclick="ucModal.setAdvancePreset('zero')">
                    ❌ Без аванса
                </button>
                <button class="ucm-quick-btn" onclick="ucModal.setAdvancePreset('custom')">
                    ✏️ Произвольный
                </button>
            </div>
            
            <div class="ucm-form-group">
                <label>💳 Аванс на карту:</label>
                <input type="number" id="ucm-advance-card" 
                       value="${this.adjustedData.advanceCard || 0}"
                       onchange="ucModal.updateCalculations()">
                <small>Максимум: ${this.formatNumber(Math.min(7900, 8600))} грн</small>
            </div>
            
            <div class="ucm-form-group">
                <label>💵 Аванс наличными:</label>
                <input type="number" id="ucm-advance-cash" 
                       value="${this.adjustedData.advanceCash || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
            
            <div class="ucm-form-group">
                <label>📝 Причина корректировки:</label>
                <select id="ucm-advance-reason" onchange="ucModal.handleReasonChange(this)">
                    <option value="">-- Выберите причину --</option>
                    <option value="employee_request">По заявлению сотрудника</option>
                    <option value="termination">Увольнение</option>
                    <option value="vacation">Отпускные</option>
                    <option value="sick_leave">Больничный</option>
                    <option value="advance_loan">Займ в счет зарплаты</option>
                    <option value="other">Другое...</option>
                </select>
                <input type="text" id="ucm-advance-reason-custom" 
                       placeholder="Укажите причину" 
                       style="display:none; margin-top:10px;">
            </div>
            
            <div class="ucm-alert ucm-alert-info">
                ℹ️ Лимиты: максимум на карту 8600 грн/месяц, стандартный аванс 7900 грн
            </div>
        </div>`;
    }

    // Рендер вкладки Зарплата
    renderSalaryTab() {
        return `
        <div class="ucm-form-section">
            <h4>Корректировка зарплаты</h4>
            
            <div class="ucm-form-group">
                <label>💳 Остаток на карту:</label>
                <input type="number" id="ucm-salary-card" 
                       value="${this.adjustedData.salaryCard || 0}"
                       onchange="ucModal.updateCalculations()">
                <small>Доступно: ${this.formatNumber(8600 - (this.adjustedData.advanceCard || 0))} грн</small>
            </div>
            
            <div class="ucm-form-group">
                <label>💵 Зарплата наличными:</label>
                <input type="number" id="ucm-salary-cash" 
                       value="${this.adjustedData.salaryCash || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
            
            <div class="ucm-form-group">
                <label>🔄 Автоматическое распределение:</label>
                <button class="ucm-btn-small" onclick="ucModal.autoDistribute()">
                    Распределить остаток автоматически
                </button>
            </div>
        </div>`;
    }

    // Рендер вкладки Премии/Штрафы
    renderBonusesTab() {
        return `
        <div class="ucm-form-section">
            <h4>Премирование и депремирование</h4>
            
            <div class="ucm-form-group">
                <label>➕ Премия:</label>
                <input type="number" id="ucm-bonus" 
                       value="${this.adjustedData.bonus || 0}"
                       onchange="ucModal.updateCalculations()">
                <input type="text" id="ucm-bonus-reason" 
                       placeholder="Причина премирования"
                       value="${this.adjustedData.bonusReason || ''}">
            </div>
            
            <div class="ucm-form-group">
                <label>➖ Депремирование:</label>
                <input type="number" id="ucm-penalty" 
                       value="${this.adjustedData.penalty || 0}"
                       onchange="ucModal.updateCalculations()">
                <input type="text" id="ucm-penalty-reason" 
                       placeholder="Причина депремирования"
                       value="${this.adjustedData.penaltyReason || ''}">
            </div>
            
            <div class="ucm-quick-templates">
                <h5>Быстрые шаблоны:</h5>
                <button onclick="ucModal.applyTemplate('bonus', 500, 'За перевыполнение плана')">
                    +500 грн за план
                </button>
                <button onclick="ucModal.applyTemplate('penalty', 300, 'Опоздание')">
                    -300 грн опоздание
                </button>
            </div>
        </div>`;
    }

    // Рендер вкладки Недостачи
    renderShortagesTab() {
        return `
        <div class="ucm-form-section">
            <h4>Управление недостачами</h4>
            
            <div class="ucm-shortages-list">
                ${this.renderShortagesList()}
            </div>
            
            <div class="ucm-form-group">
                <h5>Добавить недостачу:</h5>
                <input type="number" id="ucm-new-shortage-amount" 
                       placeholder="Сумма">
                <input type="text" id="ucm-new-shortage-desc" 
                       placeholder="Описание (накладная, дата)">
                <select id="ucm-new-shortage-deduction">
                    <option value="advance">Вычесть из аванса</option>
                    <option value="salary">Вычесть из зарплаты</option>
                    <option value="both">Разделить 50/50</option>
                </select>
                <button onclick="ucModal.addShortage()">➕ Добавить</button>
            </div>
        </div>`;
    }

    // Рендер вкладки Особые случаи
    renderSpecialTab() {
        return `
        <div class="ucm-form-section">
            <h4>Особые операции</h4>
            
            <div class="ucm-special-actions">
                <div class="ucm-action-card">
                    <h5>🚪 Увольнение</h5>
                    <p>Полная выплата всех начислений</p>
                    <button class="ucm-btn-danger" onclick="ucModal.processTermination()">
                        Оформить увольнение
                    </button>
                </div>
                
                <div class="ucm-action-card">
                    <h5>🏖️ Отпускные</h5>
                    <p>Выплата отпускных авансом</p>
                    <button class="ucm-btn-warning" onclick="ucModal.processVacation()">
                        Оформить отпускные
                    </button>
                </div>
                
                <div class="ucm-action-card">
                    <h5>💸 Займ</h5>
                    <p>Выдача денег в счет будущей зарплаты</p>
                    <button class="ucm-btn-info" onclick="ucModal.processLoan()">
                        Оформить займ
                    </button>
                </div>
                
                <div class="ucm-action-card">
                    <h5>🚫 Приостановка выплат</h5>
                    <p>Временная блокировка всех выплат</p>
                    <button class="ucm-btn-danger" onclick="ucModal.suspendPayments()">
                        Приостановить выплаты
                    </button>
                </div>
            </div>
        </div>`;
    }

    // Live preview обновления
    renderLivePreview() {
        const d = this.adjustedData || this.originalData;
        const changes = this.getChanges();
        
        return `
        <div class="ucm-preview-grid">
            <div class="ucm-preview-item">
                <span>Начислено:</span>
                <strong class="${changes.totalGross ? 'changed' : ''}">
                    ${this.formatNumber(d.totalGross)} грн
                </strong>
            </div>
            <div class="ucm-preview-item">
                <span>Вычеты:</span>
                <strong class="${changes.totalDeductions ? 'changed negative' : ''}">
                    -${this.formatNumber(d.totalDeductions)} грн
                </strong>
            </div>
            <div class="ucm-preview-item">
                <span>К выплате:</span>
                <strong class="${changes.totalToPay ? 'changed primary' : ''}">
                    ${this.formatNumber(d.totalToPay)} грн
                </strong>
            </div>
        </div>
        
        <div class="ucm-payment-breakdown">
            <h5>Разбивка выплат:</h5>
            <div class="ucm-payment-row ${changes.advanceCard ? 'changed' : ''}">
                <span>Аванс на карту:</span>
                <strong>${this.formatNumber(d.advanceCard)} грн</strong>
            </div>
            <div class="ucm-payment-row ${changes.advanceCash ? 'changed' : ''}">
                <span>Аванс наличными:</span>
                <strong>${this.formatNumber(d.advanceCash)} грн</strong>
            </div>
            <div class="ucm-payment-row ${changes.salaryCard ? 'changed' : ''}">
                <span>Зарплата на карту:</span>
                <strong>${this.formatNumber(d.salaryCard)} грн</strong>
            </div>
            <div class="ucm-payment-row ${changes.salaryCash ? 'changed' : ''}">
                <span>Зарплата наличными:</span>
                <strong>${this.formatNumber(d.salaryCash)} грн</strong>
            </div>
        </div>
        
        ${this.renderChangesSummary()}`;
    }

    // Отображение изменений
    renderChangesSummary() {
        const changes = this.getChanges();
        if (Object.keys(changes).length === 0) {
            return '<div class="ucm-no-changes">Изменений нет</div>';
        }
        
        let html = '<div class="ucm-changes-summary"><h5>Внесенные изменения:</h5><ul>';
        for (const [key, value] of Object.entries(changes)) {
            html += `<li>${this.getFieldName(key)}: ${value.from} → ${value.to}</li>`;
        }
        html += '</ul></div>';
        return html;
    }

    // Обновление расчетов
    updateCalculations() {
        // Собираем все значения из формы
        this.adjustedData.advanceCard = parseFloat(document.getElementById('ucm-advance-card')?.value) || 0;
        this.adjustedData.advanceCash = parseFloat(document.getElementById('ucm-advance-cash')?.value) || 0;
        this.adjustedData.salaryCard = parseFloat(document.getElementById('ucm-salary-card')?.value) || 0;
        this.adjustedData.salaryCash = parseFloat(document.getElementById('ucm-salary-cash')?.value) || 0;
        this.adjustedData.bonus = parseFloat(document.getElementById('ucm-bonus')?.value) || 0;
        this.adjustedData.penalty = parseFloat(document.getElementById('ucm-penalty')?.value) || 0;
        
        // Пересчитываем итоги
        this.adjustedData.totalGross = this.adjustedData.basePay + this.adjustedData.bonus;
        this.adjustedData.totalDeductions = this.adjustedData.penalty + this.adjustedData.shortages;
        this.adjustedData.totalToPay = this.adjustedData.totalGross - this.adjustedData.totalDeductions;
        this.adjustedData.advanceTotal = this.adjustedData.advanceCard + this.adjustedData.advanceCash;
        this.adjustedData.salaryTotal = this.adjustedData.salaryCard + this.adjustedData.salaryCash;
        
        // Обновляем превью
        document.getElementById('ucm-preview-content').innerHTML = this.renderLivePreview();
    }

    // Сохранение изменений
    async save() {
        const changes = this.getChanges();
        
        if (Object.keys(changes).length === 0) {
            alert('Нет изменений для сохранения');
            return;
        }
        
        if (!confirm('Сохранить все внесенные изменения?')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/save-universal-corrections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employee_id: this.currentEmployee.id,
                    month: this.currentMonth,
                    year: this.currentYear,
                    corrections: this.adjustedData,
                    changes: changes
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showModalNotification('✅ Все изменения успешно сохранены', 'success');
                this.close();
                // Обновляем основную таблицу
                if (typeof generateMonthlyReport === 'function') {
                    generateMonthlyReport();
                }
            } else {
                alert('Ошибка: ' + result.error);
            }
        } catch (error) {
            alert('Ошибка сохранения: ' + error.message);
        }
    }

    // Получение списка изменений
    getChanges() {
        const changes = {};
        const fields = ['advanceCard', 'advanceCash', 'salaryCard', 'salaryCash', 
                       'bonus', 'penalty', 'totalGross', 'totalDeductions', 'totalToPay'];
        
        for (const field of fields) {
            if (this.originalData[field] !== this.adjustedData[field]) {
                changes[field] = {
                    from: this.originalData[field],
                    to: this.adjustedData[field]
                };
            }
        }
        
        return changes;
    }

    // Закрытие модального окна
    close() {
        const modal = document.getElementById('universal-corrections-modal');
        if (modal) modal.remove();
    }

    // Вспомогательные методы
    formatNumber(num) {
        return formatNumber(num); // Используем глобальную функцию
    }

    getMonthName(month) {
        const names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
        return names[month - 1];
    }

    // Привязка обработчиков событий
    attachEventListeners() {
        // Переключение вкладок
        document.querySelectorAll('.ucm-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                
                // Деактивируем все вкладки
                document.querySelectorAll('.ucm-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.ucm-tab-content').forEach(c => c.classList.remove('active'));
                
                // Активируем выбранную
                e.target.classList.add('active');
                document.querySelector(`[data-content="${tabName}"]`).classList.add('active');
            });
        });
        
        // Закрытие по клику на оверлей
        document.querySelector('.ucm-overlay').addEventListener('click', (e) => {
            if (e.target.classList.contains('ucm-overlay')) {
                this.close();
            }
        });
    }

    // Специальные операции
    processTermination() {
        if (!confirm('Оформить увольнение с полной выплатой?')) return;
        
        // Выплачиваем всю сумму
        const total = this.adjustedData.totalToPay;
        
        // Распределяем между картой и наличными
        this.adjustedData.advanceCard = Math.min(total, 8600);
        this.adjustedData.advanceCash = Math.max(0, total - 8600);
        this.adjustedData.salaryCard = 0;
        this.adjustedData.salaryCash = 0;
        
        this.adjustedData.isTermination = true;
        this.adjustedData.terminationReason = prompt('Причина увольнения:', 'По собственному желанию');
        
        this.updateCalculations();
    }

    // Сброс изменений
    reset() {
        if (!confirm('Сбросить все изменения?')) return;
        
        this.adjustedData = JSON.parse(JSON.stringify(this.originalData));
        this.createModal(); // Перерисовываем модальное окно
    }
}

// Создаем глобальный экземпляр
const ucModal = new UniversalCorrectionsModal();

// Экспортируем для использования
window.ucModal = ucModal;