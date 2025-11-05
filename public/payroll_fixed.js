// ИСПРАВЛЕННАЯ СТРОКА 120-125:

        const revenueDateEl = document.getElementById('revenueDate');
        if (revenueDateEl) revenueDateEl.value = todayStr;

        // ИСПРАВЛЕНИЕ: По умолчанию ставим ВЧЕРАШНЮЮ дату, так как зарплата обычно за прошедший день
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const payrollDateEl = document.getElementById('payrollDate');
        if (payrollDateEl) payrollDateEl.value = yesterdayStr;

// ================== ИНСТРУКЦИЯ ==================
// 
// В файле D:\Shifts-api\Shifts-api\public\payroll.js
// 
// НАЙДИТЕ строки (примерно 120-122):
//
//   const payrollDateEl = document.getElementById('payrollDate');
//   if (payrollDateEl) payrollDateEl.value = todayStr;
//
// ЗАМЕНИТЕ НА:
//
//   // ИСПРАВЛЕНИЕ: По умолчанию ставим ВЧЕРАШНЮЮ дату
//   const yesterday = new Date(today);
//   yesterday.setDate(yesterday.getDate() - 1);
//   const yesterdayStr = yesterday.toISOString().split('T')[0];
//   
//   const payrollDateEl = document.getElementById('payrollDate');
//   if (payrollDateEl) payrollDateEl.value = yesterdayStr;
//
// ===============================================
