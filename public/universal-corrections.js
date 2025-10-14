// universal-corrections.js - Улучшенная версия с исправлением бага

class UniversalCorrectionsModal {
    constructor() {
        this.currentEmployee = null;
        this.currentMonth = null;
        this.currentYear = null;
        this.originalData = null;
        this.adjustedData = null;
        this.hasUnsavedChanges = false; // Флаг для отслеживания изменений
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
            this.hasUnsavedChanges = false;
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            // Используем тестовые данные если API недоступен
            this.originalData = {
                basePay: 1017,
                bonuses: 0,
                penalties: 0,
                shortages: 0,
                advanceCard: 1000,
                advanceCash: 0,
                salaryCard: 17,
                salaryCash: 0,
                totalGross: 1017,
                totalDeductions: 0,
                totalToPay: 1017,
                advanceTotal: 1000,
                salaryTotal: 17,
                shortagesList: []
            };
            this.adjustedData = JSON.parse(JSON.stringify(this.originalData));
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
                    <button class="ucm-tab active" data-tab="summary">📊 СВОДКА</button>
                    <button class="ucm-tab" data-tab="advance">💰 АВАНС</button>
                    <button class="ucm-tab" data-tab="salary">💵 ЗАРПЛАТА</button>
                    <button class="ucm-tab" data-tab="bonuses">🎁 ПРЕМИИ/ШТРАФЫ</button>
                    <button class="ucm-tab" data-tab="shortages">📉 НЕДОСТАЧИ</button>
                    <button class="ucm-tab" data-tab="special">⚡ ОСОБЫЕ СЛУЧАИ</button>
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
                    <div id="ucm-preview-content">
                        ${this.renderLivePreview()}
                    </div>
                </div>

                <div class="ucm-footer">
                    <div class="ucm-footer-left">
                        <button class="ucm-btn ucm-btn-secondary" onclick="ucModal.reset()">
                            🔄 СБРОСИТЬ
                        </button>
                        <button class="ucm-btn ucm-btn-warning" onclick="ucModal.rollback()">
                            ↩️ ОТКАТ
                        </button>
                        <button class="ucm-btn ucm-btn-info" onclick="ucModal.showHistory()">
                            📜 ИСТОРИЯ
                        </button>
                    </div>
                    <div class="ucm-footer-right">
                        <button class="ucm-btn ucm-btn-lock" onclick="ucModal.fixCalculations()">
                            🔒 ЗАФИКСИРОВАТЬ
                        </button>
                        <button class="ucm-btn ucm-btn-primary" onclick="ucModal.save()">
                            💾 СОХРАНИТЬ
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Улучшенные стили с компактностью и читабельностью
const improvedStyle = document.createElement('style');
improvedStyle.innerHTML = `
    /* Основа модального окна */
    .ucm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    }
    
    .ucm-container {
        width: 95%;
        max-width: 1400px;
        height: 82vh;
        background: white;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }

    /* Компактный заголовок */
    .ucm-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 20px;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 10px 10px 0 0;
    }

    .ucm-header h2 {
        font-size: 15px;
        margin: 0;
        color: white;
        font-weight: 500;
    }
    
    .ucm-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        font-size: 20px;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .ucm-close:hover {
        background: rgba(255,255,255,0.3);
    }
    
    /* Информация о сотруднике */
    .ucm-employee-info {
        padding: 6px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
    }
    
    .ucm-info-card {
        display: flex;
        align-items: center;
        gap: 15px;
    }
    
    .ucm-info-card h3 {
        font-size: 14px;
        margin: 0;
        color: #2c3e50;
    }
    
    .ucm-period {
        background: white;
        padding: 3px 12px;
        border-radius: 15px;
        font-size: 12px;
        color: #667eea;
        border: 1px solid #667eea;
    }
    
    /* Компактные вкладки */
    .ucm-tabs {
        display: flex;
        background: #f8f9fa;
        padding: 0 20px;
        border-bottom: 1px solid #dee2e6;
        height: 36px;
    }

    .ucm-tab {
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 500;
        color: #6c757d;
        border: none;
        background: transparent;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
        white-space: nowrap;
    }
    
    .ucm-tab:hover {
        color: #495057;
        background: rgba(0,0,0,0.03);
    }
    
    .ucm-tab.active {
        color: #667eea;
        border-bottom-color: #667eea;
        background: white;
    }
    
    /* Основной контент */
    .ucm-content {
        flex: 1;
        padding: 12px 20px;
        background: white;
        overflow-y: auto;
        min-height: 0;
    }
    
    .ucm-tab-content {
        display: none;
    }
    
    .ucm-tab-content.active {
        display: block;
    }
    
    /* Контейнер сводки */
.ucm-summary-container {
    padding: 15px;
    background: #ffffff;
}

/* Основные блоки в ряд */
.ucm-summary-main {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 20px;
}

/* Каждый блок */
.ucm-summary-block {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
}

/* Заголовок блока */
.ucm-summary-title {
    background: #e9ecef;
    padding: 10px 15px;
    font-size: 13px;
    font-weight: 600;
    color: #495057;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #dee2e6;
}

/* Контент блока */
.ucm-summary-content {
    padding: 12px 15px;
}

/* Строка в блоке */
.ucm-summary-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    font-size: 13px;
    color: #495057;
}

.ucm-summary-line span {
    color: #6c757d;
}

.ucm-summary-line strong {
    font-size: 14px;
    color: #212529;
    font-weight: 600;
}

/* Итоговая строка */
.ucm-summary-line.total {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #dee2e6;
}

.ucm-summary-line.total strong {
    font-size: 16px;
    color: #212529;
}

/* Цветовые акценты */
.ucm-summary-line strong.positive {
    color: #28a745;
}

.ucm-summary-line strong.negative {
    color: #dc3545;
}

.ucm-summary-line strong.primary {
    color: #667eea;
}


/* Детализация по дням */
.ucm-work-days {
    margin-top: 20px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #e9ecef;
}

.ucm-section-header {
    font-size: 13px;
    font-weight: 600;
    color: #495057;
    margin-bottom: 12px;
    text-transform: uppercase;
}

.ucm-days-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 8px;
}

.ucm-day-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    font-size: 11px;
}

.day-date {
    color: #6c757d;
    margin-bottom: 4px;
}

.day-amount {
    font-weight: 600;
    color: #212529;
}

/* Статус валидации */
.ucm-validation-status {
    margin-top: 15px;
    padding: 10px;
    border-radius: 6px;
    font-size: 12px;
    display: none;
}

.ucm-validation-status.show {
    display: block;
}

.ucm-validation-status.success {
    background: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
}

.ucm-validation-status.error {
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
}

.ucm-validation-status.warning {
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffeaa7;
}

/* Адаптивность */
@media (max-width: 1200px) {
    .ucm-summary-main {
        grid-template-columns: 1fr;
    }
}

/* Убираем яркие градиенты из старых карточек */
.ucm-summary-card {
    background: #f8f9fa !important;
    color: #212529 !important;
    box-shadow: none !important;
}
    /* Компактные формы */
    .ucm-form-compact {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 10px;
    }

    .ucm-form-compact h4 {
        font-size: 13px;
        margin: 0 0 10px 0;
        color: #2c3e50;
        font-weight: 600;
    }

    .ucm-form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
    }

    .ucm-form-col {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 6px;
    }

    .ucm-form-col h4 {
        font-size: 13px;
        margin: 0 0 10px 0;
        color: #2c3e50;
        font-weight: 600;
    }

    .ucm-form-group {
        margin-bottom: 10px;
    }
    
    .ucm-form-group label {
        display: block;
        font-size: 11px;
        margin-bottom: 4px;
        color: #495057;
        font-weight: 500;
    }
    
    .ucm-form-group input,
    .ucm-form-group select {
        width: 100%;
        padding: 5px 8px;
        font-size: 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        background: white;
    }
    
    .ucm-form-group input:focus,
    .ucm-form-group select:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
    }
    
    .ucm-form-group small {
        display: block;
        font-size: 10px;
        margin-top: 2px;
        color: #6c757d;
    }
    
    /* Компактная сетка особых случаев */
    .ucm-special-grid-compact {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        padding: 10px 0;
    }

    .ucm-special-btn-compact {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 15px 8px;
        background: white;
        border: 2px solid #e9ecef;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .ucm-special-btn-compact:hover {
        border-color: #667eea;
        background: #f8f9fa;
        transform: translateY(-1px);
    }

    .ucm-special-btn-compact.danger:hover {
        border-color: #dc3545;
        background: #fff5f5;
    }

    .ucm-special-btn-compact .icon {
        font-size: 20px;
        margin-bottom: 6px;
    }

    .ucm-special-btn-compact .title {
        font-size: 11px;
        font-weight: 500;
        color: #2c3e50;
        text-align: center;
    }
    
    /* КОМПАКТНЫЙ предварительный расчет */
    .ucm-live-preview {
        background: #fff3cd;
        padding: 8px 20px;
        border-top: 1px solid #ffc107;
        min-height: 50px;
        max-height: 80px;
        overflow-y: auto;
    }

    .ucm-preview-compact {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .ucm-preview-main {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px;
        background: white;
        border-radius: 4px;
    }

    .ucm-preview-col {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .ucm-preview-col .label {
        font-size: 9px;
        color: #6c757d;
        text-transform: uppercase;
    }

    .ucm-preview-col .value {
        font-size: 14px;
        font-weight: 600;
        color: #2c3e50;
    }

    .ucm-preview-col .value.total {
        color: #667eea;
        font-size: 16px;
    }

    .ucm-preview-col .value.changed {
        color: #667eea;
        animation: pulse 1s infinite;
    }

    .ucm-preview-details {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 6px;
        background: white;
        border-radius: 4px;
        font-size: 10px;
        flex-wrap: wrap;
    }

    .changes-label {
        font-weight: 600;
        color: #856404;
    }

    .change-item {
        padding: 1px 4px;
        background: #ffeeba;
        border-radius: 3px;
        color: #856404;
        white-space: nowrap;
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
    }
    
    /* Недостачи */
    .ucm-shortages-list {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 10px;
        padding: 8px;
        background: white;
        border-radius: 6px;
        border: 1px solid #e9ecef;
    }
    
    .ucm-shortage-item {
        padding: 8px;
        margin-bottom: 8px;
        background: #f8f9fa;
        border-radius: 6px;
        border-left: 3px solid #dc3545;
        font-size: 11px;
    }
    
    /* Компактный футер */
    .ucm-footer {
        display: flex;
        justify-content: space-between;
        padding: 10px 20px;
        border-top: 1px solid #dee2e6;
        background: #f8f9fa;
        border-radius: 0 0 10px 10px;
    }
    
    .ucm-footer-left,
    .ucm-footer-right {
        display: flex;
        gap: 8px;
    }
    
    .ucm-btn {
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 5px;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .ucm-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    
    .ucm-btn-primary {
        background: #667eea;
        color: white;
    }
    
    .ucm-btn-secondary {
        background: #6c757d;
        color: white;
    }
    
    .ucm-btn-warning {
        background: #ffc107;
        color: #212529;
    }
    
    .ucm-btn-info {
        background: #17a2b8;
        color: white;
    }
    
    .ucm-btn-lock {
        background: #28a745;
        color: white;
    }
    
    /* Скрываем алерты для экономии места */
    .ucm-alert {
        display: none;
    }
    
    .ucm-alert-warning {
        display: block;
        padding: 8px 12px;
        margin: 8px 0;
        border-radius: 4px;
        font-size: 11px;
        background: #fff3cd;
        color: #856404;
        border: 1px solid #ffeeba;
    }
    
    /* Блок изменений */
    .ucm-changes-summary {
        margin-top: 6px;
        padding: 6px 8px;
        background: white;
        border-radius: 4px;
        border: 1px solid #ffc107;
    }

    .ucm-changes-summary h5 {
        font-size: 10px;
        margin: 0 0 4px 0;
        color: #856404;
    }

    .ucm-changes-summary ul {
        margin: 0;
        padding-left: 14px;
        font-size: 10px;
        color: #495057;
        line-height: 1.3;
    }

    .ucm-changes-summary li {
        margin-bottom: 1px;
    }
    
    .ucm-no-changes {
        text-align: center;
        padding: 10px;
        color: #6c757d;
        font-size: 11px;
    }
    
    /* Оптимизированный скроллбар */
    .ucm-content::-webkit-scrollbar,
    .ucm-shortages-list::-webkit-scrollbar,
    .ucm-live-preview::-webkit-scrollbar {
        width: 6px;
    }
    
    .ucm-content::-webkit-scrollbar-track,
    .ucm-shortages-list::-webkit-scrollbar-track,
    .ucm-live-preview::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 10px;
    }
    
    .ucm-content::-webkit-scrollbar-thumb,
    .ucm-shortages-list::-webkit-scrollbar-thumb,
    .ucm-live-preview::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 10px;
    }
    
    .ucm-content::-webkit-scrollbar-thumb:hover,
    .ucm-shortages-list::-webkit-scrollbar-thumb:hover,
    .ucm-live-preview::-webkit-scrollbar-thumb:hover {
        background: #555;
    }

    /* Дополнительная оптимизация для малых экранов */
    @media (max-height: 768px) {
        .ucm-container {
            height: 90vh;
        }
        
        .ucm-content {
            padding: 8px 15px;
        }
        
        .ucm-summary-grid {
            gap: 8px;
        }
        
        .ucm-summary-card {
            padding: 10px;
        }
    }
`;
document.head.appendChild(improvedStyle);


        // Привязываем обработчики
        this.attachEventListeners();

        // Проверяем, зафиксированы ли данные
        if (this.originalData && this.originalData.isFixed) {
            this.updateFixedState();
        }
        
        // ⭐⭐⭐ ДОБАВИТЬ ЗДЕСЬ НОВЫЙ КОД ДЛЯ АВТОСОХРАНЕНИЯ И ВАЛИДАЦИИ:
        
        // Загружаем сохраненный черновик если есть
        const key = `ucm_draft_${this.currentEmployee.id}_${this.currentMonth}_${this.currentYear}`;
        const saved = localStorage.getItem(key);
        
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const timeDiff = Date.now() - new Date(data.timestamp).getTime();
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                
                if (hoursDiff < 24) {
                    if (confirm(`Найден несохраненный черновик от ${new Date(data.timestamp).toLocaleString()}. Восстановить?`)) {
                        this.adjustedData = data.adjustedData;
                        // Обновляем поля если они существуют
                        setTimeout(() => {
                            const advanceCardEl = document.getElementById('ucm-advance-card');
                            const advanceCashEl = document.getElementById('ucm-advance-cash');
                            const salaryCardEl = document.getElementById('ucm-salary-card');
                            const salaryCashEl = document.getElementById('ucm-salary-cash');
                            const bonusEl = document.getElementById('ucm-bonus');
                            const penaltyEl = document.getElementById('ucm-penalty');
                            
                            if (advanceCardEl) advanceCardEl.value = this.adjustedData.advanceCard || 0;
                            if (advanceCashEl) advanceCashEl.value = this.adjustedData.advanceCash || 0;
                            if (salaryCardEl) salaryCardEl.value = this.adjustedData.salaryCard || 0;
                            if (salaryCashEl) salaryCashEl.value = this.adjustedData.salaryCash || 0;
                            if (bonusEl) bonusEl.value = this.adjustedData.bonus || 0;
                            if (penaltyEl) penaltyEl.value = this.adjustedData.penalty || 0;
                            
                            this.updateCalculations();
                        }, 100);
                    }
                }
            } catch (error) {
                console.error('Ошибка восстановления черновика:', error);
            }
        }
        
        // Настраиваем автосохранение
        let autoSaveTimer;
        const autoSave = () => {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => {
                const saveKey = `ucm_draft_${this.currentEmployee.id}_${this.currentMonth}_${this.currentYear}`;
                const saveData = {
                    timestamp: new Date().toISOString(),
                    adjustedData: this.adjustedData,
                    changes: this.getChanges()
                };
                
                try {
                    localStorage.setItem(saveKey, JSON.stringify(saveData));
                    console.log('Автосохранение выполнено');
                } catch (error) {
                    console.error('Ошибка автосохранения:', error);
                }
            }, 2000);
        };
        
        // Привязываем автосохранение ко всем полям ввода
        setTimeout(() => {
            const modal = document.getElementById('universal-corrections-modal');
            if (modal) {
                modal.querySelectorAll('input').forEach(input => {
                    input.addEventListener('input', autoSave);
                    input.addEventListener('change', autoSave);
                });
            }
        }, 100);
        
        // Выполняем начальную проверку данных
        setTimeout(() => {
            if (this.adjustedData) {
                // Простая проверка корректности данных
                const totalGross = this.adjustedData.totalGross || 0;
                const totalDeductions = this.adjustedData.totalDeductions || 0;
                const totalToPay = this.adjustedData.totalToPay || 0;
                const expectedToPay = totalGross - totalDeductions;
                
                if (Math.abs(totalToPay - expectedToPay) > 0.01) {
                    console.warn('Обнаружено расхождение в расчетах:', {
                        totalToPay,
                        expectedToPay,
                        difference: totalToPay - expectedToPay
                    });
                }
                
                // Проверка лимитов карты
                const totalCard = (this.adjustedData.advanceCard || 0) + (this.adjustedData.salaryCard || 0);
                if (totalCard > 8700) {
                    console.warn('Превышен лимит карты:', totalCard);
                }
            }
        }, 200);
        
    } // <-- Это закрывающая скобка функции createModal()

    // Рендер вкладки Сводка (следующая функция класса)
    renderSummaryTab() {
        // ... код функции renderSummaryTab ...
    }


    // Рендер вкладки Сводка
renderSummaryTab() {
    const d = this.originalData;
    return `
    <div class="ucm-summary-container">
        <!-- Основные показатели в одну строку -->
        <div class="ucm-summary-main">
            <div class="ucm-summary-block">
                <div class="ucm-summary-title">Начисления</div>
                <div class="ucm-summary-content">
                    <div class="ucm-summary-line">
                        <span>База (смены):</span>
                        <strong>${this.formatNumber(d.basePay)}</strong>
                    </div>
                    <div class="ucm-summary-line">
                        <span>Премии:</span>
                        <strong class="positive">${this.formatNumber(d.bonuses)}</strong>
                    </div>
                    <div class="ucm-summary-line total">
                        <span>Итого:</span>
                        <strong>${this.formatNumber(d.totalGross)}</strong>
                    </div>
                </div>
            </div>
            
            <div class="ucm-summary-block">
                <div class="ucm-summary-title">Вычеты</div>
                <div class="ucm-summary-content">
                    <div class="ucm-summary-line">
                        <span>Штрафы:</span>
                        <strong class="negative">${this.formatNumber(d.penalties)}</strong>
                    </div>
                    <div class="ucm-summary-line">
                        <span>Недостачи:</span>
                        <strong class="negative">${this.formatNumber(d.shortages)}</strong>
                    </div>
                    <div class="ucm-summary-line total">
                        <span>Итого:</span>
                        <strong class="negative">${this.formatNumber(d.totalDeductions)}</strong>
                    </div>
                </div>
            </div>
            
            <div class="ucm-summary-block">
                <div class="ucm-summary-title">Выплаты</div>
                <div class="ucm-summary-content">
                    <div class="ucm-summary-line">
                        <span>Аванс:</span>
                        <strong>${this.formatNumber(d.advanceTotal)}</strong>
                    </div>
                    <div class="ucm-summary-line">
                        <span>Зарплата:</span>
                        <strong>${this.formatNumber(d.salaryTotal)}</strong>
                    </div>
                    <div class="ucm-summary-line total">
                        <span>К выплате:</span>
                        <strong class="primary">${this.formatNumber(d.totalToPay)}</strong>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Детализация по дням работы -->
        ${this.renderWorkDaysDetails()}
        
        <!-- Статус валидации -->
        <div class="ucm-validation-status" id="validation-status"></div>
    </div>`;
}

// Новая функция для отображения деталей по дням
renderWorkDaysDetails() {
    if (!this.originalData.workDays || this.originalData.workDays.length === 0) {
        return '';
    }
    
    return `
    <div class="ucm-work-days">
        <div class="ucm-section-header">Детализация по дням</div>
        <div class="ucm-days-grid">
            ${this.originalData.workDays.map(day => `
                <div class="ucm-day-item">
                    <span class="day-date">${day.date}</span>
                    <span class="day-amount">${this.formatNumber(day.amount)}</span>
                </div>
            `).join('')}
        </div>
    </div>`;
}

   // Рендер вкладки Аванс - упрощенная
renderAdvanceTab() {
    return `
    <div class="ucm-form-compact">
        <h4>Корректировка аванса</h4>
        
        <div class="ucm-form-row">
            <div class="ucm-form-group">
                <label>💳 На карту (макс. 8700):</label>
                <input type="number" id="ucm-advance-card" 
                       value="${this.adjustedData.advanceCard || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
            
            <div class="ucm-form-group">
                <label>💵 Наличными:</label>
                <input type="number" id="ucm-advance-cash" 
                       value="${this.adjustedData.advanceCash || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
        </div>
    </div>`;
}

    // Рендер вкладки Зарплата - упрощенная
renderSalaryTab() {
    const maxCard = 8700 - (this.adjustedData.advanceCard || 0);
    return `
    <div class="ucm-form-compact">
        <h4>Корректировка зарплаты</h4>
        
        <div class="ucm-form-row">
            <div class="ucm-form-group">
                <label>💳 На карту (остаток ${maxCard}):</label>
                <input type="number" id="ucm-salary-card" 
                       value="${this.adjustedData.salaryCard || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
            
            <div class="ucm-form-group">
                <label>💵 Наличными:</label>
                <input type="number" id="ucm-salary-cash" 
                       value="${this.adjustedData.salaryCash || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
        </div>
    </div>`;
}


  // Рендер вкладки Премии/Штрафы - БЕЗ шаблонов
renderBonusesTab() {
    return `
    <div class="ucm-form-row">
        <div class="ucm-form-col">
            <h4>➕ Премирование</h4>
            <div class="ucm-form-group">
                <label>Сумма премии:</label>
                <input type="number" id="ucm-bonus" 
                       value="${this.adjustedData.bonus || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
            <div class="ucm-form-group">
                <label>Причина:</label>
                <input type="text" id="ucm-bonus-reason" 
                       placeholder="Укажите причину"
                       value="${this.adjustedData.bonusReason || ''}">
            </div>
        </div>
        
        <div class="ucm-form-col">
            <h4>➖ Депремирование</h4>
            <div class="ucm-form-group">
                <label>Сумма штрафа:</label>
                <input type="number" id="ucm-penalty" 
                       value="${this.adjustedData.penalty || 0}"
                       onchange="ucModal.updateCalculations()">
            </div>
            <div class="ucm-form-group">
                <label>Причина:</label>
                <input type="text" id="ucm-penalty-reason" 
                       placeholder="Укажите причину"
                       value="${this.adjustedData.penaltyReason || ''}">
            </div>
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
                       placeholder="Сумма" style="margin-bottom: 8px;">
                <input type="text" id="ucm-new-shortage-desc" 
                       placeholder="Описание (накладная, дата)" style="margin-bottom: 8px;">
                <select id="ucm-new-shortage-deduction" style="margin-bottom: 8px;">
                    <option value="advance">Вычесть из аванса</option>
                    <option value="salary">Вычесть из зарплаты</option>
                    <option value="both">Разделить 50/50</option>
                </select>
                <button class="ucm-quick-btn" style="width: 100%;" onclick="ucModal.addShortage()">
                    ➕ Добавить недостачу
                </button>
            </div>
        </div>`;
    }

   // Рендер вкладки Особые случаи - компактная сетка
renderSpecialTab() {
    return `
    <div class="ucm-special-grid-compact">
        <button class="ucm-special-btn-compact" onclick="ucModal.processTermination()">
            <span class="icon">🚪</span>
            <span class="title">Увольнение</span>
        </button>
        
        <button class="ucm-special-btn-compact" onclick="ucModal.processVacation()">
            <span class="icon">🏖️</span>
            <span class="title">Отпускные</span>
        </button>
        
        <button class="ucm-special-btn-compact" onclick="ucModal.processLoan()">
            <span class="icon">💸</span>
            <span class="title">Займ</span>
        </button>
        
        <button class="ucm-special-btn-compact danger" onclick="ucModal.suspendPayments()">
            <span class="icon">🚫</span>
            <span class="title">Блокировка</span>
        </button>
    </div>`;
}

    // Обновленный Live preview - компактный
renderLivePreview() {
    const d = this.adjustedData || this.originalData;
    const changes = this.getChanges();
    const hasChanges = Object.keys(changes).length > 0;
    
    return `
    <div class="ucm-preview-compact">
        <div class="ucm-preview-main">
            <div class="ucm-preview-col">
                <span class="label">Начислено:</span>
                <span class="value ${changes.totalGross ? 'changed' : ''}">${this.formatNumber(d.totalGross)} грн</span>
            </div>
            <div class="ucm-preview-col">
                <span class="label">Вычеты:</span>
                <span class="value ${changes.totalDeductions ? 'changed' : ''}">-${this.formatNumber(d.totalDeductions)} грн</span>
            </div>
            <div class="ucm-preview-col">
                <span class="label">К выплате:</span>
                <span class="value total ${changes.totalToPay ? 'changed' : ''}">${this.formatNumber(d.totalToPay)} грн</span>
            </div>
        </div>
        
        ${hasChanges ? `
        <div class="ucm-preview-details">
            <span class="changes-label">Изменения:</span>
            ${Object.entries(changes).map(([key, value]) => 
                `<span class="change-item">${this.getFieldName(key)}: ${value.from}→${value.to}</span>`
            ).join(' ')}
        </div>` : ''}
    </div>`;
}
// Добавьте новый метод в класс:
togglePreview() {
    const content = document.getElementById('preview-content');
    const icon = document.getElementById('preview-toggle-icon');
    const button = icon.parentElement;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
        button.textContent = icon.textContent + ' Свернуть';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
        button.textContent = icon.textContent + ' Развернуть';
    }
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

    // Рендер списка недостач
    renderShortagesList() {
        if (!this.adjustedData || !this.adjustedData.shortagesList || this.adjustedData.shortagesList.length === 0) {
            return '<p style="text-align: center; color: #6c757d; padding: 20px;">Нет зарегистрированных недостач</p>';
        }
        
        const shortages = this.adjustedData.shortagesList;
        let html = '';
        
        shortages.forEach((shortage, index) => {
            html += `
                <div class="ucm-shortage-item">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <strong>Недостача #${index + 1}</strong><br>
                            <small>Сумма: ${this.formatNumber(shortage.amount)} грн</small><br>
                            <small>Описание: ${shortage.description || 'Не указано'}</small><br>
                            <small>Вычет из: ${shortage.deduction_from === 'advance' ? 'Аванс' : 
                                             shortage.deduction_from === 'salary' ? 'Зарплата' : 
                                             'Разделить 50/50'}</small>
                        </div>
                        <button onclick="ucModal.removeShortage('${shortage.id}')" 
                                style="padding: 5px 10px; background: #dc3545; color: white; 
                                       border: none; border-radius: 4px; cursor: pointer;">
                            🗑️
                        </button>
                    </div>
                </div>`;
        });
        
        return html;
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
        this.adjustedData.totalDeductions = this.adjustedData.penalty + (this.adjustedData.shortages || 0);
        this.adjustedData.totalToPay = this.adjustedData.totalGross - this.adjustedData.totalDeductions;
        this.adjustedData.advanceTotal = this.adjustedData.advanceCard + this.adjustedData.advanceCash;
        this.adjustedData.salaryTotal = this.adjustedData.salaryCard + this.adjustedData.salaryCash;
        
        // Отмечаем наличие изменений
        this.hasUnsavedChanges = true;
        
        // Обновляем превью
        document.getElementById('ucm-preview-content').innerHTML = this.renderLivePreview();
    }

    // ИСПРАВЛЕННОЕ СОХРАНЕНИЕ - проверяем реальные изменения
    async save() {
        const changes = this.getChanges();
        
        // Если нет изменений, просто закрываем
        if (Object.keys(changes).length === 0) {
            alert('Нет изменений для сохранения');
            this.close();
            return;
        }
        
        if (!confirm('Сохранить все внесенные изменения?')) {
            return;
        }
        
        try {
            // Определяем, что именно сохраняем
            const dataToSave = {
                employee_id: this.currentEmployee.id,
                month: this.currentMonth,
                year: this.currentYear,
                corrections: {
                    advanceCard: this.adjustedData.advanceCard,
                    advanceCash: this.adjustedData.advanceCash,
                    salaryCard: this.adjustedData.salaryCard,
                    salaryCash: this.adjustedData.salaryCash,
                    bonus: this.adjustedData.bonus || 0,
                    penalty: this.adjustedData.penalty || 0,
                    bonusReason: document.getElementById('ucm-bonus-reason')?.value || '',
                    penaltyReason: document.getElementById('ucm-penalty-reason')?.value || '',
                    shortagesList: this.adjustedData.shortagesList || []
                },
                changes: changes
            };
            
            const response = await fetch(`${API_BASE}/save-universal-corrections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(dataToSave)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Сохраняем в историю только если были реальные изменения
                if (Object.keys(changes).length > 0) {
                    this.saveStateForHistory();
                }
                
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
            console.error('Ошибка сохранения:', error);
            alert('Ошибка сохранения: ' + error.message);
        }
    }

    // Получение списка изменений
    getChanges() {
        const changes = {};
        const fields = ['advanceCard', 'advanceCash', 'salaryCard', 'salaryCash', 
                       'bonus', 'penalty', 'totalGross', 'totalDeductions', 'totalToPay'];
        
        for (const field of fields) {
            const originalValue = this.originalData[field] || 0;
            const adjustedValue = this.adjustedData[field] || 0;
            
            // Сравниваем с точностью до 2 знаков после запятой
            if (Math.abs(originalValue - adjustedValue) > 0.01) {
                changes[field] = {
                    from: originalValue,
                    to: adjustedValue
                };
            }
        }
        
        return changes;
    }

    // Закрытие модального окна
    close() {
        if (this.hasUnsavedChanges) {
            const changes = this.getChanges();
            if (Object.keys(changes).length > 0) {
                if (!confirm('Есть несохраненные изменения. Закрыть без сохранения?')) {
                    return;
                }
            }
        }
        
        const modal = document.getElementById('universal-corrections-modal');
        if (modal) modal.remove();
    }

    // Сброс изменений
    reset() {
        if (!confirm('Сбросить все изменения к исходным значениям?')) return;
        
        this.adjustedData = JSON.parse(JSON.stringify(this.originalData));
        this.hasUnsavedChanges = false;
        this.createModal(); // Перерисовываем модальное окно
    }

    // Вспомогательные методы
    formatNumber(num) {
        return new Intl.NumberFormat('ru-RU').format(num || 0);
    }

    getMonthName(month) {
        const names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
        return names[month - 1];
    }

    getFieldName(key) {
        const names = {
            advanceCard: 'Аванс на карту',
            advanceCash: 'Аванс наличными',
            salaryCard: 'Остаток на карту',
            salaryCash: 'Зарплата наличными',
            bonus: 'Премия',
            penalty: 'Штраф',
            totalGross: 'Всего начислено',
            totalDeductions: 'Всего вычетов',
            totalToPay: 'К выплате'
        };
        return names[key] || key;
    }

    // Функции для быстрых действий
    setAdvancePreset(type) {
        const advanceCardInput = document.getElementById('ucm-advance-card');
        const advanceCashInput = document.getElementById('ucm-advance-cash');
        
        if (!advanceCardInput || !advanceCashInput) return;
        
        switch(type) {
            case 'standard':
                const standardAdvance = Math.min(
                    Math.floor((this.originalData.basePay * 0.9) / 100) * 100,
                    7900
                );
                advanceCardInput.value = standardAdvance;
                advanceCashInput.value = 0;
                break;
                
            case 'max':
                advanceCardInput.value = 7900;
                advanceCashInput.value = 0;
                break;
                
            case 'zero':
                advanceCardInput.value = 0;
                advanceCashInput.value = 0;
                break;
                
            case 'custom':
                const customAmount = prompt('Введите сумму аванса:', '5000');
                if (customAmount) {
                    const amount = parseFloat(customAmount) || 0;
                    if (amount > 8700) {
                        alert('Сумма превышает лимит карты (8700 грн)');
                        advanceCardInput.value = 8700;
                        advanceCashInput.value = amount - 8700;
                    } else {
                        advanceCardInput.value = amount;
                        advanceCashInput.value = 0;
                    }
                }
                break;
        }
        
        this.updateCalculations();
    }

    handleReasonChange(select) {
        const customInput = document.getElementById('ucm-advance-reason-custom');
        if (select.value === 'other') {
            customInput.style.display = 'block';
        } else {
            customInput.style.display = 'none';
        }
    }

    autoDistribute() {
        const totalToPay = this.adjustedData.totalToPay || 0;
        const advanceTotal = this.adjustedData.advanceTotal || 0;
        const remaining = totalToPay - advanceTotal;
        
        if (remaining <= 0) {
            alert('Нет остатка для распределения');
            return;
        }
        
        const maxCard = 8700 - (this.adjustedData.advanceCard || 0);
        const cardAmount = Math.min(remaining, maxCard);
        const cashAmount = remaining - cardAmount;
        
        document.getElementById('ucm-salary-card').value = cardAmount;
        document.getElementById('ucm-salary-cash').value = cashAmount;
        
        this.updateCalculations();
    }

    applyTemplate(type, amount, reason) {
        if (type === 'bonus') {
            document.getElementById('ucm-bonus').value = amount;
            document.getElementById('ucm-bonus-reason').value = reason;
        } else if (type === 'penalty') {
            document.getElementById('ucm-penalty').value = amount;
            document.getElementById('ucm-penalty-reason').value = reason;
        }
        this.updateCalculations();
    }

    addShortage() {
        const amount = parseFloat(document.getElementById('ucm-new-shortage-amount')?.value) || 0;
        const description = document.getElementById('ucm-new-shortage-desc')?.value || '';
        const deduction = document.getElementById('ucm-new-shortage-deduction')?.value || 'advance';
        
        if (amount <= 0) {
            alert('Введите корректную сумму недостачи');
            return;
        }
        
        if (!this.adjustedData.shortagesList) {
            this.adjustedData.shortagesList = [];
        }
        
        this.adjustedData.shortagesList.push({
            id: 'new_' + Date.now(),
            amount: amount,
            description: description,
            deduction_from: deduction,
            is_new: true
        });
        
        this.adjustedData.shortages = (this.adjustedData.shortages || 0) + amount;
        
        // Перерендерим вкладку
        document.querySelector('[data-content="shortages"]').innerHTML = this.renderShortagesTab();
        
        this.updateCalculations();
    }

    removeShortage(shortageId) {
        if (!confirm('Удалить эту недостачу?')) return;
        
        if (this.adjustedData.shortagesList) {
            const shortage = this.adjustedData.shortagesList.find(s => s.id === shortageId);
            if (shortage) {
                this.adjustedData.shortages = Math.max(0, (this.adjustedData.shortages || 0) - shortage.amount);
                this.adjustedData.shortagesList = this.adjustedData.shortagesList.filter(s => s.id !== shortageId);
                
                // Перерендерим вкладку
                document.querySelector('[data-content="shortages"]').innerHTML = this.renderShortagesTab();
                
                this.updateCalculations();
            }
        }
    }

    processTermination() {
        if (!confirm('Оформить увольнение с полной выплатой?')) return;
        
        const total = this.adjustedData.totalToPay;
        
        document.getElementById('ucm-advance-card').value = Math.min(total, 8700);
        document.getElementById('ucm-advance-cash').value = Math.max(0, total - 8700);
        document.getElementById('ucm-salary-card').value = 0;
        document.getElementById('ucm-salary-cash').value = 0;
        
        this.adjustedData.isTermination = true;
        this.adjustedData.terminationReason = prompt('Причина увольнения:', 'По собственному желанию');
        
        this.updateCalculations();
    }

    processLoan() {
        const loanAmount = prompt('Введите сумму займа:', '3000');
        if (!loanAmount) return;
        
        const amount = parseFloat(loanAmount) || 0;
        if (amount <= 0) {
            alert('Некорректная сумма');
            return;
        }
        
        const maxCard = 8700;
        document.getElementById('ucm-advance-card').value = Math.min(amount, maxCard);
        document.getElementById('ucm-advance-cash').value = Math.max(0, amount - maxCard);
        
        this.adjustedData.loanAmount = amount;
        this.adjustedData.loanReason = 'Займ в счет будущей зарплаты';
        
        document.getElementById('ucm-salary-card').value = 0;
        document.getElementById('ucm-salary-cash').value = 0;
        
        alert(`Оформлен займ на сумму ${this.formatNumber(amount)} грн`);
        this.updateCalculations();
    }

    processVacation() {
        const vacationDays = prompt('Введите количество дней отпуска:', '14');
        if (!vacationDays) return;
        
        const days = parseInt(vacationDays) || 0;
        if (days <= 0) {
            alert('Некорректное количество дней');
            return;
        }
        
        const dailyRate = this.originalData.basePay / 22;
        const vacationAmount = Math.round(dailyRate * days);
        
        document.getElementById('ucm-advance-card').value = Math.min(vacationAmount, 8700);
        document.getElementById('ucm-advance-cash').value = Math.max(0, vacationAmount - 8700);
        
        this.adjustedData.vacationDays = days;
        this.adjustedData.vacationAmount = vacationAmount;
        
        alert(`Оформлены отпускные на ${days} дней: ${this.formatNumber(vacationAmount)} грн`);
        this.updateCalculations();
    }

    suspendPayments() {
        if (!confirm('Приостановить все выплаты для этого сотрудника?')) return;
        
        const reason = prompt('Укажите причину приостановки:', 'Дисциплинарное взыскание');
        if (!reason) return;
        
        document.getElementById('ucm-advance-card').value = 0;
        document.getElementById('ucm-advance-cash').value = 0;
        document.getElementById('ucm-salary-card').value = 0;
        document.getElementById('ucm-salary-cash').value = 0;
        
        this.adjustedData.paymentsSuspended = true;
        this.adjustedData.suspensionReason = reason;
        
        alert('Выплаты приостановлены');
        this.updateCalculations();
    }

    // Валидация данных
    validateData() {
        const errors = [];
        const warnings = [];
        
        // Проверка основных сумм
        const totalGross = this.adjustedData.totalGross || 0;
        const totalDeductions = this.adjustedData.totalDeductions || 0;
        const totalToPay = this.adjustedData.totalToPay || 0;
        const expectedToPay = totalGross - totalDeductions;
        
        // Проверка математической корректности
        if (Math.abs(totalToPay - expectedToPay) > 0.01) {
            errors.push(`Ошибка расчета: ${totalToPay} ≠ ${expectedToPay}`);
        }
        
        // Проверка лимитов карты
        const advanceCard = this.adjustedData.advanceCard || 0;
        const salaryCard = this.adjustedData.salaryCard || 0;
        const totalCard = advanceCard + salaryCard;
        
        if (totalCard > 8700) {
            errors.push(`Превышен лимит карты: ${totalCard} > 8700`);
        }
        
        // Проверка авансов
        const advanceTotal = this.adjustedData.advanceCard + this.adjustedData.advanceCash;
        if (advanceTotal > 7900 && !this.adjustedData.isTermination && !this.adjustedData.loanAmount) {
            warnings.push(`Аванс превышает стандартный лимит: ${advanceTotal} > 7900`);
        }
        
        // Проверка на отрицательные значения
        if (totalToPay < 0) {
            errors.push(`Отрицательная сумма к выплате: ${totalToPay}`);
        }
        
        // Проверка недостач
        if (this.adjustedData.shortages > 0 && (!this.adjustedData.shortagesList || this.adjustedData.shortagesList.length === 0)) {
            warnings.push('Есть сумма недостач, но нет деталей');
        }
        
        // Проверка соответствия суммы выплат
        const totalPayments = this.adjustedData.advanceTotal + this.adjustedData.salaryTotal;
        if (Math.abs(totalPayments - totalToPay) > 0.01 && !this.adjustedData.paymentsSuspended) {
            warnings.push(`Сумма выплат (${totalPayments}) не соответствует итогу (${totalToPay})`);
        }
        
        return { errors, warnings };
    }
    
    // Отображение статуса валидации
    showValidationStatus(errors, warnings) {
        const statusEl = document.getElementById('validation-status');
        if (!statusEl) {
            // Создаем элемент если его нет
            const previewEl = document.getElementById('ucm-preview-content');
            if (previewEl) {
                const statusDiv = document.createElement('div');
                statusDiv.id = 'validation-status';
                statusDiv.className = 'ucm-validation-status';
                previewEl.appendChild(statusDiv);
            }
        }
        
        const status = document.getElementById('validation-status');
        if (!status) return;
        
        if (errors.length === 0 && warnings.length === 0) {
            status.className = 'ucm-validation-status success show';
            status.innerHTML = '✅ Все данные корректны';
        } else if (errors.length > 0) {
            status.className = 'ucm-validation-status error show';
            status.innerHTML = `❌ Ошибки:<br>${errors.join('<br>')}`;
        } else if (warnings.length > 0) {
            status.className = 'ucm-validation-status warning show';
            status.innerHTML = `⚠️ Предупреждения:<br>${warnings.join('<br>')}`;
        }
        
        // Автоскрытие через 5 секунд
        setTimeout(() => {
            status.classList.remove('show');
        }, 5000);
    }
    
    // Автосохранение изменений
    setupAutoSave() {
        let autoSaveTimer;
        
        const autoSave = () => {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => {
                this.saveToLocalStorage();
            }, 2000);
        };
        
        // Привязываем к всем полям ввода
        document.querySelectorAll('#universal-corrections-modal input').forEach(input => {
            input.addEventListener('input', autoSave);
            input.addEventListener('change', autoSave);
        });
    }
    
    // Сохранение в localStorage
    saveToLocalStorage() {
        const key = `ucm_draft_${this.currentEmployee.id}_${this.currentMonth}_${this.currentYear}`;
        const data = {
            timestamp: new Date().toISOString(),
            adjustedData: this.adjustedData,
            changes: this.getChanges()
        };
        
        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log('Автосохранение выполнено');
        } catch (error) {
            console.error('Ошибка автосохранения:', error);
        }
    }
    
    // Восстановление из localStorage
    loadFromLocalStorage() {
        const key = `ucm_draft_${this.currentEmployee.id}_${this.currentMonth}_${this.currentYear}`;
        const saved = localStorage.getItem(key);
        
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const timeDiff = Date.now() - new Date(data.timestamp).getTime();
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                
                if (hoursDiff < 24) {
                    if (confirm(`Найден несохраненный черновик от ${new Date(data.timestamp).toLocaleString()}. Восстановить?`)) {
                        this.adjustedData = data.adjustedData;
                        return true;
                    }
                }
            } catch (error) {
                console.error('Ошибка восстановления:', error);
            }
        }
        return false;
    }
    
    // Создание резервной копии
    createBackup() {
        const backup = {
            timestamp: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(this.adjustedData))
        };
        
        sessionStorage.setItem('ucm_last_backup', JSON.stringify(backup));
    }
    
    // Восстановление из резервной копии
    restoreFromBackup() {
        const backup = sessionStorage.getItem('ucm_last_backup');
        if (backup) {
            const data = JSON.parse(backup);
            this.adjustedData = data.data;
            this.createModal();
            showModalNotification('✅ Данные восстановлены из резервной копии', 'success');
        }
    }
    
    // Расчет контрольной суммы
    calculateChecksum() {
        const data = JSON.stringify(this.adjustedData);
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
    
    // Блокировка интерфейса при загрузке
    setLoadingState(isLoading) {
        const modal = document.getElementById('universal-corrections-modal');
        if (!modal) return;
        
        if (isLoading) {
            modal.style.pointerEvents = 'none';
            modal.style.opacity = '0.7';
            
            const loader = document.createElement('div');
            loader.id = 'ucm-loader';
            loader.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 1000;
                background: white;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            loader.innerHTML = '⏳ Сохранение...';
            modal.appendChild(loader);
        } else {
            modal.style.pointerEvents = '';
            modal.style.opacity = '';
            const loader = document.getElementById('ucm-loader');
            if (loader) loader.remove();
        }
    }
    
    // ========== КОНЕЦ БЛОКА ВАЛИДАЦИИ ==========
    
    // ОБНОВЛЕННАЯ функция save() с валидацией
    async save() {
        // ВАЛИДАЦИЯ ПЕРЕД СОХРАНЕНИЕМ
        const { errors, warnings } = this.validateData();
        
        if (errors.length > 0) {
            this.showValidationStatus(errors, warnings);
            alert(`Невозможно сохранить - обнаружены ошибки:\n${errors.join('\n')}`);
            return;
        }
        
        if (warnings.length > 0) {
            this.showValidationStatus([], warnings);
            if (!confirm(`Есть предупреждения:\n${warnings.join('\n')}\n\nПродолжить сохранение?`)) {
                return;
            }
        }
        
        const changes = this.getChanges();
        
        if (Object.keys(changes).length === 0) {
            alert('Нет изменений для сохранения');
            return;
        }
        
        if (!confirm('Сохранить все внесенные изменения?')) {
            return;
        }
        
        // Создаем резервную копию
        this.createBackup();
        
        try {
            // Блокируем интерфейс
            this.setLoadingState(true);
            
            const dataToSave = {
                employee_id: this.currentEmployee.id,
                month: this.currentMonth,
                year: this.currentYear,
                corrections: {
                    advanceCard: this.adjustedData.advanceCard,
                    advanceCash: this.adjustedData.advanceCash,
                    salaryCard: this.adjustedData.salaryCard,
                    salaryCash: this.adjustedData.salaryCash,
                    bonus: this.adjustedData.bonus || 0,
                    penalty: this.adjustedData.penalty || 0,
                    bonusReason: document.getElementById('ucm-bonus-reason')?.value || '',
                    penaltyReason: document.getElementById('ucm-penalty-reason')?.value || '',
                    shortagesList: this.adjustedData.shortagesList || []
                },
                changes: changes,
                validation: {
                    checksum: this.calculateChecksum(),
                    timestamp: new Date().toISOString()
                }
            };
            
            const response = await fetch(`${API_BASE}/save-universal-corrections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(dataToSave)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Очищаем черновик
                const key = `ucm_draft_${this.currentEmployee.id}_${this.currentMonth}_${this.currentYear}`;
                localStorage.removeItem(key);
                
                // Сохраняем в историю
                if (Object.keys(changes).length > 0) {
                    this.saveStateForHistory();
                }
                
                showModalNotification('✅ Все изменения успешно сохранены и проверены', 'success');
                this.close();
                
                if (typeof generateMonthlyReport === 'function') {
                    generateMonthlyReport();
                }
            } else {
                alert('Ошибка: ' + result.error);
            }
        } catch (error) {
            console.error('Ошибка сохранения:', error);
            alert('Ошибка сохранения: ' + error.message);
            
            // Предлагаем восстановить из резервной копии
            if (confirm('Произошла ошибка. Восстановить предыдущее состояние?')) {
                this.restoreFromBackup();
            }
        } finally {
            this.setLoadingState(false);
        }
    }

    // Сохранение состояния для истории
    saveStateForHistory() {
        const state = {
            employee_id: this.currentEmployee.id,
            employee_name: this.currentEmployee.name,
            month: this.currentMonth,
            year: this.currentYear,
            timestamp: new Date().toISOString(),
            data: JSON.parse(JSON.stringify(this.adjustedData))
        };
        
        const history = JSON.parse(localStorage.getItem('ucm_history') || '[]');
        history.push(state);
        
        // Храним только последние 20 записей
        if (history.length > 20) {
            history.shift();
        }
        
        localStorage.setItem('ucm_history', JSON.stringify(history));
    }

    // Откат последнего изменения
    async rollback() {
        const history = JSON.parse(localStorage.getItem('ucm_history') || '[]');
        
        if (history.length === 0) {
            alert('Нет сохраненных состояний для отката');
            return;
        }
        
        const lastState = history[history.length - 1];
        
        if (!confirm(`Откатить к состоянию от ${new Date(lastState.timestamp).toLocaleString()}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/save-universal-corrections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employee_id: lastState.employee_id,
                    month: lastState.month,
                    year: lastState.year,
                    corrections: lastState.data,
                    changes: { rollback: true }
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                history.pop();
                localStorage.setItem('ucm_history', JSON.stringify(history));
                
                showModalNotification('✅ Откат выполнен успешно', 'success');
                this.close();
                
                if (typeof generateMonthlyReport === 'function') {
                    generateMonthlyReport();
                }
            }
        } catch (error) {
            alert('Ошибка отката: ' + error.message);
        }
    }

    // Показ истории
    showHistory() {
        const history = JSON.parse(localStorage.getItem('ucm_history') || '[]');
        
        if (history.length === 0) {
            alert('История изменений пуста');
            return;
        }
        
        let historyHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 25px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                max-width: 700px;
                max-height: 500px;
                overflow-y: auto;
                z-index: 10001;
            " id="history-modal">
                <h3 style="margin-bottom: 20px; color: #2c3e50;">📜 История изменений</h3>
                <div style="max-height: 350px; overflow-y: auto;">`;
        
        history.reverse().forEach((item, index) => {
            const date = new Date(item.timestamp);
            historyHTML += `
                <div style="
                    padding: 15px;
                    margin-bottom: 12px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border-left: 3px solid #667eea;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: #2c3e50;">${item.employee_name || this.currentEmployee.name}</strong><br>
                            <small style="color: #6c757d;">${date.toLocaleString('ru-RU')}</small><br>
                            <small style="color: #495057;">
                                Аванс: ${this.formatNumber(item.data.advanceTotal || 0)} грн | 
                                Зарплата: ${this.formatNumber(item.data.salaryTotal || 0)} грн
                            </small>
                        </div>
                        <button onclick="ucModal.restoreFromHistory(${history.length - 1 - index})" 
                                style="padding: 6px 12px; background: #667eea; color: white; 
                                       border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            Восстановить
                        </button>
                    </div>
                </div>`;
        });
        
        historyHTML += `
                </div>
                <div style="text-align: center; margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                    <button onclick="document.getElementById('history-modal').remove(); document.getElementById('history-overlay').remove();" 
                            style="padding: 10px 25px; background: #6c757d; color: white; 
                                   border: none; border-radius: 6px; cursor: pointer;">
                        Закрыть
                    </button>
                    <button onclick="ucModal.clearHistory()" 
                            style="padding: 10px 25px; background: #dc3545; color: white; 
                                   border: none; border-radius: 6px; cursor: pointer;">
                        Очистить историю
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
                z-index: 10000;
            " onclick="document.getElementById('history-modal').remove(); this.remove();"></div>`;
        
        document.body.insertAdjacentHTML('beforeend', historyHTML);
    }

    restoreFromHistory(index) {
        const history = JSON.parse(localStorage.getItem('ucm_history') || '[]');
        
        if (index >= 0 && index < history.length) {
            const state = history[index];
            
            if (confirm(`Восстановить состояние от ${new Date(state.timestamp).toLocaleString()}?`)) {
                this.adjustedData = JSON.parse(JSON.stringify(state.data));
                
                const historyModal = document.getElementById('history-modal');
                const historyOverlay = document.getElementById('history-overlay');
                if (historyModal) historyModal.remove();
                if (historyOverlay) historyOverlay.remove();
                
                this.createModal();
                
                showModalNotification('✅ Состояние восстановлено', 'success');
            }
        }
    }

    clearHistory() {
        if (confirm('Очистить всю историю изменений? Это действие нельзя отменить.')) {
            localStorage.removeItem('ucm_history');
            
            const historyModal = document.getElementById('history-modal');
            const historyOverlay = document.getElementById('history-overlay');
            if (historyModal) historyModal.remove();
            if (historyOverlay) historyOverlay.remove();
            
            showModalNotification('🗑️ История очищена', 'info');
        }
    }

    // Фиксация расчетов
    async fixCalculations() {
        if (!confirm('Зафиксировать текущие расчеты? После фиксации изменения будут окончательными.')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/fix-universal-calculations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    employee_id: this.currentEmployee.id,
                    month: this.currentMonth,
                    year: this.currentYear,
                    calculations: this.adjustedData
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showModalNotification('🔒 Расчеты зафиксированы', 'success');
                this.originalData.isFixed = true;
                this.adjustedData.isFixed = true;
                
                this.updateFixedState();
            }
        } catch (error) {
            alert('Ошибка фиксации: ' + error.message);
        }
    }

    // Обновление интерфейса для зафиксированных данных
    updateFixedState() {
        if (this.adjustedData.isFixed) {
            const header = document.querySelector('.ucm-header h2');
            if (header && !header.innerHTML.includes('🔒')) {
                header.innerHTML = '🔒 ' + header.innerHTML;
            }
            
            const warningHTML = `
                <div class="ucm-alert ucm-alert-warning" style="margin: 15px 0;">
                    ⚠️ Расчеты зафиксированы. Для внесения изменений требуется отмена фиксации.
                </div>
            `;
            
            const content = document.querySelector('.ucm-content');
            if (content && !document.querySelector('.ucm-alert-warning')) {
                content.insertAdjacentHTML('afterbegin', warningHTML);
            }
        }
    }
}

// Создаем глобальный экземпляр
const ucModal = new UniversalCorrectionsModal();

// Экспортируем для использования
window.ucModal = ucModal;

// Функция для показа уведомлений (если еще не определена)
if (typeof showModalNotification === 'undefined') {
    window.showModalNotification = function(message, type = 'info') {
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${colors[type] || colors.info};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10002;
            animation: slideIn 0.3s ease;
            font-size: 14px;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };
}
