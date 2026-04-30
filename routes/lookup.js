const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const jwt = require('jsonwebtoken');

const router = express.Router();

const bigquery = new BigQuery({
  credentials: JSON.parse(process.env.GCP_SA_KEY),
  projectId: 'family-market-analytics'
});

// Middleware: проверка JWT из cookie (как в твоём checkAuth)
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

// GET /lookup?barcode=XXX&store_address=YYY
router.get('/lookup', checkAuthCookie, async (req, res) => {
  const { barcode, store_address } = req.query;
  
  if (!barcode || !store_address) {
    return res.status(400).json({ success: false, error: 'barcode and store_address required' });
  }

  try {
    const query = `
      WITH
      in_store AS (
        SELECT product_name, quantity, cost, unit
        FROM \`family-market-analytics.returns_system.stock_current\`
        WHERE barcode = @barcode AND store_address = @store_address
        LIMIT 1
      ),
      in_network AS (
        SELECT 
          ANY_VALUE(product_name) AS product_name,
          SUM(quantity) AS total_qty,
          AVG(cost) AS avg_cost,
          ANY_VALUE(unit) AS unit,
          COUNT(DISTINCT store_address) AS stores_count
        FROM \`family-market-analytics.returns_system.stock_current\`
        WHERE barcode = @barcode
      ),
      in_catalog AS (
        SELECT product_name, last_cost AS cost
        FROM \`family-market-analytics.returns_system.barcode_catalog\`
        WHERE barcode = @barcode
        LIMIT 1
      )
      SELECT
        (SELECT product_name FROM in_store) AS store_name,
        (SELECT quantity FROM in_store) AS store_qty,
        (SELECT cost FROM in_store) AS store_cost,
        (SELECT unit FROM in_store) AS store_unit,
        (SELECT product_name FROM in_network) AS network_name,
        (SELECT total_qty FROM in_network) AS network_qty,
        (SELECT avg_cost FROM in_network) AS network_cost,
        (SELECT unit FROM in_network) AS network_unit,
        (SELECT stores_count FROM in_network) AS network_stores,
        (SELECT product_name FROM in_catalog) AS catalog_name,
        (SELECT cost FROM in_catalog) AS catalog_cost
    `;

    const [rows] = await bigquery.query({
      query,
      params: { barcode: String(barcode), store_address: String(store_address) },
      location: 'EU'
    });

    const r = rows[0];

    if (r.store_qty !== null) {
      return res.json({
        success: true, color: 'green', barcode,
        product_name: r.store_name,
        cost: Number(r.store_cost), unit: r.store_unit,
        stock_in_store: Number(r.store_qty), in_network: true
      });
    }
    if (r.network_stores > 0) {
      return res.json({
        success: true, color: 'orange', barcode,
        product_name: r.network_name,
        cost: Number(r.network_cost), unit: r.network_unit,
        stock_in_store: 0,
        stock_in_network: Number(r.network_qty),
        stores_count: Number(r.network_stores), in_network: true
      });
    }
    if (r.catalog_name) {
      return res.json({
        success: true, color: 'blue', barcode,
        product_name: r.catalog_name,
        cost: Number(r.catalog_cost),
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

module.exports = router;
