// Тестирование новой логики расчета бонусов
// Запуск: node tests/test-bonus-calculation.js

function calculateDailyPay(revenue, numSellers, isSenior = false) {
  if (isSenior) return { baseRate: 1300, bonus: 0, totalPay: 1300, bonusDetails: 'Старший продавец - фиксированная ставка' };
  if (numSellers === 0) return { baseRate: 0, bonus: 0, totalPay: 0, bonusDetails: 'Нет продавцов' };
  
  let baseRatePerPerson = (numSellers === 1) ? 975 : 825;
  let bonusPerPerson = 0;
  let bonusDetails = '';

  if (revenue > 13000) {
    const bonusBase = revenue - 13000;
    const wholeThousands = Math.floor(bonusBase / 1000);
    let ratePerThousand = 0;
    
    // ИСПРАВЛЕННАЯ ЛОГИКА: определяем ставку по ФАКТИЧЕСКОЙ выручке
    if (revenue >= 50000) {
      ratePerThousand = 12;
      bonusDetails = `Касса ${revenue}грн (50-60к): ${wholeThousands}т × 12грн`;
    } else if (revenue >= 45000) {
      ratePerThousand = 11;
      bonusDetails = `Касса ${revenue}грн (45-50к): ${wholeThousands}т × 11грн`;
    } else if (revenue >= 40000) {
      ratePerThousand = 10;
      bonusDetails = `Касса ${revenue}грн (40-45к): ${wholeThousands}т × 10грн`;
    } else if (revenue >= 35000) {
      ratePerThousand = 9;
      bonusDetails = `Касса ${revenue}грн (35-40к): ${wholeThousands}т × 9грн`;
    } else if (revenue >= 30000) {
      ratePerThousand = 8;
      bonusDetails = `Касса ${revenue}грн (30-35к): ${wholeThousands}т × 8грн`;
    } else if (revenue >= 25000) {
      ratePerThousand = 7;
      bonusDetails = `Касса ${revenue}грн (25-30к): ${wholeThousands}т × 7грн`;
    } else if (revenue >= 20000) {
      ratePerThousand = 6;
      bonusDetails = `Касса ${revenue}грн (20-25к): ${wholeThousands}т × 6грн`;
    } else {
      ratePerThousand = 5;
      bonusDetails = `Касса ${revenue}грн (13-20к): ${wholeThousands}т × 5грн`;
    }
    
    // ВАЖНО: Бонус НЕ делится! Каждый продавец получает полный бонус
    bonusPerPerson = wholeThousands * ratePerThousand;
  } else {
    bonusDetails = `Касса ${revenue}грн < 13000 - без бонуса`;
  }
  
  return { 
    baseRate: baseRatePerPerson, 
    bonus: bonusPerPerson, 
    totalPay: baseRatePerPerson + bonusPerPerson,
    bonusDetails: bonusDetails
  };
}

// Тестовые случаи
console.log('=== ТЕСТИРОВАНИЕ НОВОЙ ЛОГИКИ РАСЧЕТА БОНУСОВ ===');
console.log('❗ БОНУС НЕ ДЕЛИТСЯ - КАЖДЫЙ ПОЛУЧАЕТ ПОЛНУЮ СУММУ\n');

const testCases = [
  { revenue: 12000, numSellers: 2, description: 'Касса < 13000 (без бонуса)' },
  { revenue: 18000, numSellers: 1, description: 'Касса 18к, 1 продавец' },
  { revenue: 18000, numSellers: 2, description: 'Касса 18к, 2 продавца' },
  { revenue: 29900, numSellers: 2, description: 'Пример со скриншота' },
  { revenue: 35000, numSellers: 1, description: 'Касса 35к (граница диапазона)' },
  { revenue: 48566.30, numSellers: 2, description: 'Касса 48566.30 (из скриншота)' },
  { revenue: 55000, numSellers: 1, description: 'Касса 55к (максимальный диапазон)' },
];

testCases.forEach(test => {
  const result = calculateDailyPay(test.revenue, test.numSellers, false);
  console.log(`📊 ${test.description}:`);
  console.log(`   Касса: ${test.revenue} грн, Продавцов: ${test.numSellers}`);
  console.log(`   Базовая ставка: ${result.baseRate} грн`);
  console.log(`   Бонус на человека: ${result.bonus.toFixed(2)} грн`);
  console.log(`   Итого на человека: ${result.totalPay.toFixed(2)} грн`);
  console.log(`   Расшифровка: ${result.bonusDetails}`);
  
  // Специальная проверка для примера со скриншота
  if (test.revenue === 29900 && test.numSellers === 2) {
    const expectedTotal = 937; // 825 + 112 (бонус НЕ делится!)
    const actualTotal = result.totalPay;
    if (Math.abs(actualTotal - expectedTotal) < 0.01) {
      console.log(`   ✅ ПРОВЕРКА ПРОЙДЕНА: Совпадает с примером на скриншоте!`);
    } else {
      console.log(`   ❌ ОШИБКА: Ожидалось ${expectedTotal}, получено ${actualTotal}`);
    }
  }
  console.log('');
});

// Проверка для кассы 48566.30 из скриншота
console.log('=== ПРОВЕРКА СКРИНШОТА (48566.30 грн, 2 продавца) ===');
const screenShotTest = calculateDailyPay(48566.30, 2, false);
console.log(`Касса: 48566.30 грн`);
console.log(`48566.30 - 13000 = 35566.30 грн`);
console.log(`Целых тысяч: 35`);
console.log(`Диапазон 45-50к → ставка 11 грн/тыс`);
console.log(`Бонус НА КАЖДОГО: 35 × 11 = 385 грн (НЕ ДЕЛИТСЯ!)`);
console.log(`Итого на человека: 825 + 385 = 1210 грн`);
console.log(`\nРезультат функции: ${screenShotTest.totalPay.toFixed(2)} грн`);
if (Math.abs(screenShotTest.totalPay - 1210) < 0.01) {
  console.log('✅ РАСЧЕТ ВЕРНЫЙ!');
} else {
  console.log('❌ РАСЧЕТ НЕВЕРНЫЙ!');
}

console.log('\n=== СРАВНЕНИЕ С И БЕЗ ДЕЛЕНИЯ БОНУСА ===');
console.log('Касса 30000, 3 продавца:');
const test3sellers = calculateDailyPay(30000, 3, false);
console.log(`  Старая логика (с делением): 825 + (17т×8грн)/3 = 825 + 45.33 = 870.33 грн`);
console.log(`  Новая логика (без деления): 825 + 17т×8грн = 825 + 136 = 961 грн`);
console.log(`  Результат функции: ${test3sellers.totalPay.toFixed(2)} грн`);
console.log(`  Разница на человека: ${(961 - 870.33).toFixed(2)} грн больше!`);
