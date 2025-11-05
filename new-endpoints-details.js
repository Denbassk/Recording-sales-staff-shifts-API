// ================================================
// НОВЫЙ ЭНДПОИНТ: Детализация расчетов для кураторов
// ================================================
// Добавить в server.cjs после других эндпоинтов (примерно строка 2500)

// Middleware для кураторов
const canViewDetails = checkRole(['admin', 'accountant', 'curator']);

// Получение списка сотрудников для выбора (для кураторов и выше)
app.get('/api/get-employees-list', checkAuth, canViewDetails, async (req, res) => {
    try {
        const { data: employees, error } = await supabase
            .from('employees')
            .select('id, fullname, role')
            .eq('active', true)
            .in('role', ['seller']) // Только продавцы
            .order('fullname', { ascending: true });
        
        if (error) throw error;
        
        res.json({ success: true, employees });
    } catch (error) {
        console.error('Ошибка получения списка сотрудников:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получение детализации расчетов для конкретного сотрудника
app.post('/api/get-calculation-details', checkAuth, canViewDetails, async (req, res) => {
    const { employee_id, year, month } = req.body;
    
    if (!employee_id || !year || !month) {
        return res.status(400).json({ 
            success: false, 
            error: 'Не указаны обязательные параметры' 
        });
    }
    
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        
        // Получаем информацию о сотруднике
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('id, fullname, role')
            .eq('id', employee_id)
            .single();
        
        if (empError) throw empError;
        
        // Получаем все расчеты за период с деталями
        const { data: calculations, error: calcError } = await supabase
            .from('payroll_calculations')
            .select('*')
            .eq('employee_id', employee_id)
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date', { ascending: true });
        
        if (calcError) throw calcError;
        
        if (!calculations || calculations.length === 0) {
            return res.json({ 
                success: true, 
                employee: employee,
                details: [], 
                summary: {
                    total_days: 0,
                    total_earned: 0,
                    avg_per_day: 0,
                    total_base: 0,
                    total_bonus: 0
                }
            });
        }
        
        // Формируем детальный отчет
        const details = calculations.map(calc => ({
            date: calc.work_date,
            store_address: calc.store_address || 'Не указан',
            revenue: calc.revenue || 0,
            num_sellers: calc.num_sellers || 1,
            base_rate: calc.base_rate || 0,
            bonus: calc.bonus || 0,
            bonus_details: calc.bonus_details || 'Нет данных',
            total_pay: calc.total_pay || 0,
            is_senior: calc.is_senior || false
        }));
        
        // Считаем итоги
        const summary = {
            total_days: calculations.length,
            total_earned: calculations.reduce((sum, c) => sum + (c.total_pay || 0), 0),
            total_base: calculations.reduce((sum, c) => sum + (c.base_rate || 0), 0),
            total_bonus: calculations.reduce((sum, c) => sum + (c.bonus || 0), 0),
            avg_per_day: 0
        };
        
        summary.avg_per_day = summary.total_days > 0 
            ? summary.total_earned / summary.total_days 
            : 0;
        
        // Группируем по магазинам для дополнительной статистики
        const storeStats = {};
        calculations.forEach(calc => {
            const store = calc.store_address || 'Не указан';
            if (!storeStats[store]) {
                storeStats[store] = {
                    days: 0,
                    total_revenue: 0,
                    total_earned: 0
                };
            }
            storeStats[store].days++;
            storeStats[store].total_revenue += calc.revenue || 0;
            storeStats[store].total_earned += calc.total_pay || 0;
        });
        
        res.json({ 
            success: true, 
            employee: employee,
            details: details, 
            summary: summary,
            store_stats: storeStats
        });
        
    } catch (error) {
        console.error('Ошибка получения детализации:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Экспорт детализации в Excel (для всех ролей с доступом)
app.post('/api/export-calculation-details', checkAuth, canViewDetails, async (req, res) => {
    const { employee_id, year, month } = req.body;
    
    try {
        // Получаем те же данные что и для просмотра
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        
        const { data: employee } = await supabase
            .from('employees')
            .select('fullname')
            .eq('id', employee_id)
            .single();
        
        const { data: calculations } = await supabase
            .from('payroll_calculations')
            .select('*')
            .eq('employee_id', employee_id)
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .order('work_date', { ascending: true });
        
        if (!calculations || calculations.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Нет данных за выбранный период' 
            });
        }
        
        // Формируем данные для Excel
        const excelData = calculations.map((calc, index) => ({
            '№': index + 1,
            'Дата': new Date(calc.work_date).toLocaleDateString('ru-RU'),
            'Магазин': calc.store_address || 'Не указан',
            'Выручка магазина': calc.revenue || 0,
            'Продавцов в смене': calc.num_sellers || 1,
            'Ставка': calc.base_rate || 0,
            'Бонус': calc.bonus || 0,
            'Расшифровка бонуса': calc.bonus_details || '',
            'ИТОГО за день': calc.total_pay || 0,
            'Старший продавец': calc.is_senior ? 'Да' : 'Нет'
        }));
        
        // Добавляем итоговую строку
        const totalEarned = calculations.reduce((sum, c) => sum + (c.total_pay || 0), 0);
        const totalBase = calculations.reduce((sum, c) => sum + (c.base_rate || 0), 0);
        const totalBonus = calculations.reduce((sum, c) => sum + (c.bonus || 0), 0);
        
        excelData.push({
            '№': '',
            'Дата': 'ИТОГО',
            'Магазин': '',
            'Выручка магазина': '',
            'Продавцов в смене': calculations.length + ' дней',
            'Ставка': totalBase,
            'Бонус': totalBonus,
            'Расшифровка бонуса': '',
            'ИТОГО за день': totalEarned,
            'Старший продавец': ''
        });
        
        res.json({ 
            success: true, 
            data: excelData,
            filename: `Детализация_${employee?.fullname || employee_id}_${month}-${year}.xlsx`
        });
        
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
