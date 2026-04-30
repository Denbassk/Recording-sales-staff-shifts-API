const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const jwt = require('jsonwebtoken');

const router = express.Router();

const bigquery = new BigQuery({
  credentials: JSON.parse(process.env.GCP_SA_KEY),
  projectId: 'family-market-analytics'
});

function checkAuthCookie(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ success: false, message: "Нет токена." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Невалидный токен." });
  }
}

router.get('/lookup', checkAuthCookie, async (req, res) => {
  const { barcode, store_address } = req.query;
  
  if (!barcode || !store_address) {
    return res.status(400).json({ success: false, error: 'barcode and store_address required' });
  }

  try {
    const query = `
      WITH
      in_store AS (
        SELECT product_name, qty_in_stock, cost_price, retail_price
        FROM \`family-market-analytics.returns_system.stock_current\`
        WHERE barcode = @barcode AND store_address = @store_address
        LIMIT 1
      ),
      in_network AS (
        SELECT 
          ANY_VALUE(product_name) AS product_name,
          SUM(qty_in_stock) AS total_qty,
          AVG(cost_price) AS avg_cost,
          AVG(retail_price) AS avg_retail,
          COUNT(DISTINCT store_address) AS stores_count
        FROM \`family-market-analytics.returns_system.stock_current\`
        WHERE barcode = @barcode
      ),
      in_catalog AS (
        SELECT product_name, last_cost_price, last_retail_price
        FROM \`family-market-analytics.returns_system.barcode_catalog\`
        WHERE barcode = @barcode
        LIMIT 1
      )
      SELECT
        (SELECT product_name FROM in_store) AS store_name,
        (SELECT qty_in_stock FROM in_store) AS store_qty,
        (SELECT cost_price FROM in_store) AS store_cost,
        (SELECT retail_price FROM in_store) AS store_retail,
        (SELECT product_name FROM in_network) AS network_name,
        (SELECT total_qty FROM in_network) AS network_qty,
        (SELECT avg_cost FROM in_network) AS network_cost,
        (SELECT avg_retail FROM in_network) AS network_retail,
        (SELECT stores_count FROM in_network) AS network_stores,
        (SELECT product_name FROM in_catalog) AS catalog_name,
        (SELECT last_cost_price FROM in_catalog) AS catalog_cost,
        (SELECT last_retail_price FROM in_catalog) AS catalog_retail
    `;

    const [rows] = await bigquery.query({
      query,
      params: { barcode: String(barcode), store_address: String(store_address) },
      location: 'EU'
    });

    const r = rows[0];

    if (r.store_qty !== null && r.store_qty !== undefined) {
      return res.json({
        success: true, color: 'green', barcode,
        product_name: r.store_name,
        cost: Number(r.store_cost),
        retail_price: Number(r.store_retail),
        stock_in_store: Number(r.store_qty),
        in_network: true
      });
    }
    if (r.network_stores > 0) {
      return res.json({
        success: true, color: 'orange', barcode,
        product_name: r.network_name,
        cost: Number(r.network_cost),
        retail_price: Number(r.network_retail),
        stock_in_store: 0,
        stock_in_network: Number(r.network_qty),
        stores_count: Number(r.network_stores),
        in_network: true
      });
    }
    if (r.catalog_name) {
      return res.json({
        success: true, color: 'blue', barcode,
        product_name: r.catalog_name,
        cost: Number(r.catalog_cost),
        retail_price: Number(r.catalog_retail),
        in_network: false, in_catalog: true
      });
    }
    return res.json({
      success: true, color: 'yellow', barcode,
      product_name: null, in_network: false, in_catalog: false
    });

  } catch (err) {
    console.error('BigQuery lookup error:', err);
    return res.status(500).json({ success: false, error: 'Lookup failed', detail: err.message });
  }
});
// GET /me-with-store - кто я и где работаю сегодня
router.get('/me-with-store', checkAuthCookie, async (req, res) => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const employeeId = req.user.id;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Информация о сотруднике
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, fullname, role')
      .eq('id', employeeId)
      .single();
    
    if (empError || !employee) {
      return res.status(404).json({ success: false, error: 'Сотрудник не найден' });
    }
    
    // 1. Сначала проверяем подмену на сегодня
    const { data: substitution } = await supabase
      .from('substitutions')
      .select('worked_store_id')
      .eq('employee_id', employeeId)
      .eq('substitution_date', today)
      .maybeSingle();
    
    let storeId = substitution?.worked_store_id || null;
    let source = substitution ? 'substitution' : null;
    
    // 2. Если подмены нет — берём из сегодняшней смены
    if (!storeId) {
      const { data: shift } = await supabase
        .from('shifts')
        .select('store_id')
        .eq('employee_id', employeeId)
        .eq('shift_date', today)
        .maybeSingle();
      
      if (shift) {
        storeId = shift.store_id;
        source = 'shift';
      }
    }
    
    // 3. Если смены нет — берём из постоянной привязки
    if (!storeId) {
      const { data: link } = await supabase
        .from('employee_store')
        .select('store_id')
        .eq('employee_id', employeeId)
        .maybeSingle();
      
      if (link) {
        storeId = link.store_id;
        source = 'permanent';
      }
    }
    
// Админы и бухгалтеры — без магазина (они работают в офисе)
if (!storeId) {
  if (employee.role === 'admin' || employee.role === 'accountant' || employee.role === 'curator') {
    return res.json({
      success: true,
      employee: {
        id: employee.id,
        fullname: employee.fullname,
        role: employee.role
      },
      store: null,
      source: 'office'
    });
  }
  return res.status(404).json({ 
    success: false, 
    error: 'Магазин не определён. Сначала отметьтесь в смене.' 
  });
}
    
    // Получаем адрес магазина
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, name, address')
      .eq('id', storeId)
      .single();
    
    if (storeError || !store) {
      return res.status(404).json({ success: false, error: 'Магазин не найден' });
    }
    
    res.json({
      success: true,
      employee: {
        id: employee.id,
        fullname: employee.fullname,
        role: employee.role
      },
      store: {
        id: store.id,
        name: store.name,
        address: store.address
      },
      source: source  // 'substitution' | 'shift' | 'permanent'
    });
    
  } catch (err) {
    console.error('me-with-store error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// POST /returns - создание возврата
router.post('/returns', checkAuthCookie, async (req, res) => {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  const employeeId = req.user.id;
  const { items, notes } = req.body;
  
  // Валидация
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items required (non-empty array)' });
  }
  
  for (const item of items) {
    if (!item.barcode || !item.product_name || !item.quantity) {
      return res.status(400).json({ 
        success: false, 
        error: 'Each item must have: barcode, product_name, quantity' 
      });
    }
    if (Number(item.quantity) <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid quantity for ${item.barcode}` 
      });
    }
  }
  
  try {
    // 1. Определяем магазин (та же логика, что в /me-with-store)
    const today = new Date().toISOString().split('T')[0];
    
    const { data: substitution } = await supabase
      .from('substitutions')
      .select('worked_store_id')
      .eq('employee_id', employeeId)
      .eq('substitution_date', today)
      .maybeSingle();
    
    let storeId = substitution?.worked_store_id || null;
    
    if (!storeId) {
      const { data: shift } = await supabase
        .from('shifts')
        .select('store_id')
        .eq('employee_id', employeeId)
        .eq('shift_date', today)
        .maybeSingle();
      if (shift) storeId = shift.store_id;
    }
    
    if (!storeId) {
      const { data: link } = await supabase
        .from('employee_store')
        .select('store_id')
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (link) storeId = link.store_id;
    }
    
    if (!storeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Магазин не определён. Сначала отметьтесь в смене.' 
      });
    }
    
    // 2. Получаем адрес магазина
    const { data: store } = await supabase
      .from('stores')
      .select('address')
      .eq('id', storeId)
      .single();
    
    if (!store) {
      return res.status(404).json({ success: false, error: 'Магазин не найден' });
    }
    
    // 3. Генерируем номер возврата через SEQUENCE
    const { data: numberRow, error: numError } = await supabase
      .rpc('generate_return_number');
    
    if (numError) {
      console.error('generate_return_number error:', numError);
      return res.status(500).json({ success: false, error: 'Не удалось сгенерировать номер' });
    }
    
    const returnNumber = numberRow;
    
    // 4. Считаем итоги
    const itemsCount = items.length;
    const totalCost = items.reduce((sum, it) => {
      const cost = Number(it.cost_price) || 0;
      const qty = Number(it.quantity) || 0;
      return sum + (cost * qty);
    }, 0);
    
    // 5. Создаём шапку возврата
    const { data: returnRow, error: returnError } = await supabase
      .from('returns')
      .insert({
        return_number: returnNumber,
        employee_id: employeeId,
        store_id: storeId,
        store_address: store.address,
        status: 'active',
        items_count: itemsCount,
        total_cost: totalCost,
        notes: notes || null
      })
      .select()
      .single();
    
    if (returnError) {
      console.error('Insert return error:', returnError);
      return res.status(500).json({ success: false, error: returnError.message });
    }
    
    // 6. Создаём позиции
    const itemsToInsert = items.map(it => ({
      return_id: returnRow.id,
      barcode: String(it.barcode),
      product_name: String(it.product_name),
      quantity: Number(it.quantity),
      cost_price: it.cost_price !== undefined ? Number(it.cost_price) : null,
      lookup_status: it.lookup_status || null,
      reason: it.reason || null
    }));
    
    const { error: itemsError } = await supabase
      .from('return_items')
      .insert(itemsToInsert);
    
    if (itemsError) {
      // Откат шапки
      await supabase.from('returns').delete().eq('id', returnRow.id);
      console.error('Insert items error:', itemsError);
      return res.status(500).json({ success: false, error: itemsError.message });
    }
    
    res.json({
      success: true,
      return_number: returnNumber,
      return_id: returnRow.id,
      items_count: itemsCount,
      total_cost: totalCost,
      store_address: store.address
    });
    
  } catch (err) {
    console.error('POST /returns error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
