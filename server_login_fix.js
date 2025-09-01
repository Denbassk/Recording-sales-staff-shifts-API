// --- ИСПРАВЛЕННАЯ ВЕРСИЯ LOGIN ENDPOINT ---
// Добавить в server.cjs вместо существующего app.post("/login", ...)

app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  
  // Добавляем логирование для отладки
  console.log(`[LOGIN] Попытка входа: ${username}, device: ${deviceKey}`);
  
  try {
    // Ищем сотрудника
    const { data: employee, error: empError } = await supabase.from('employees')
      .select('id, fullname, role')
      .ilike('fullname', username.trim())
      .eq('password', password)
      .single();

    if (empError || !employee) {
      console.log(`[LOGIN] Неудачная авторизация для: ${username}`);
      return res.status(401).json({ 
        success: false, 
        message: "Неверное имя или пароль" 
      });
    }

    console.log(`[LOGIN] Сотрудник найден: ${employee.fullname} (${employee.id})`);

    let storeId = null;
    let storeAddress = '';
    let responseMessage = '';
    const isSeniorSeller = employee.id.startsWith('SProd');

    if (employee.role === 'seller') {
      // Используем блокировку для предотвращения race conditions
      const lockResult = await withLock(`login_${employee.id}_${new Date().toDateString()}`, async () => {
        
        // 1. Определяем магазин
        if (deviceKey) {
          console.log(`[LOGIN] Поиск магазина по устройству: ${deviceKey}`);
          const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select('store_id')
            .eq('device_key', deviceKey)
            .single();
          
          if (device && !deviceError) {
            storeId = device.store_id;
            console.log(`[LOGIN] Магазин найден по устройству: ${storeId}`);
          } else {
            console.log(`[LOGIN] Устройство не найдено или ошибка: ${deviceError?.message}`);
          }
        }

        // Для старшего продавца без устройства
        if (isSeniorSeller && !storeId) {
          storeAddress = "Старший продавец";
          console.log(`[LOGIN] Старший продавец без привязки к магазину`);
        } 
        // Для обычного продавца ищем его основное место
        else if (!isSeniorSeller && !storeId) {
          console.log(`[LOGIN] Поиск основного магазина для сотрудника`);
          const { data: storeLink } = await supabase
            .from('employee_store')
            .select('store_id')
            .eq('employee_id', employee.id)
            .single();
          
          if (storeLink) {
            storeId = storeLink.store_id;
            console.log(`[LOGIN] Основной магазин найден: ${storeId}`);
          } else {
            console.log(`[LOGIN] Основной магазин не найден`);
          }
        }
        
        // Получаем адрес магазина
        if (storeId) {
          const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('address')
            .eq('id', storeId)
            .single();
          
          if (storeError || !store) {
            console.log(`[LOGIN] Ошибка получения адреса магазина: ${storeError?.message}`);
            throw new Error("Магазин не найден");
          }
          storeAddress = store.address;
          console.log(`[LOGIN] Адрес магазина: ${storeAddress}`);
        }
        
        // Проверка на отсутствие адреса
        if (!storeAddress) {
          console.log(`[LOGIN] Не удалось определить магазин для сотрудника`);
          throw new Error("Для этого сотрудника не удалось определить магазин.");
        }

        // 2. Проверяем и создаем смену
        const today = new Date();
        const shiftDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        console.log(`[LOGIN] Проверка существующей смены на дату: ${shiftDate}`);
        
        // Более точная проверка существующей смены
        const { data: existingShift, error: shiftCheckError } = await supabase
          .from('shifts')
          .select('id, started_at')
          .eq('employee_id', employee.id)
          .eq('shift_date', shiftDate);
        
        if (shiftCheckError) {
          console.log(`[LOGIN] Ошибка проверки смены: ${shiftCheckError.message}`);
          throw shiftCheckError;
        }
        
        if (!existingShift || existingShift.length === 0) {
          console.log(`[LOGIN] Создание новой смены`);
          
          // Создаем новую смену с retry логикой
          let retries = 3;
          let shiftCreated = false;
          
          while (retries > 0 && !shiftCreated) {
            try {
              const { data: newShift, error: insertError } = await supabase
                .from('shifts')
                .insert({ 
                  employee_id: employee.id, 
                  store_id: storeId, 
                  shift_date: shiftDate,
                  started_at: new Date().toISOString()
                })
                .select()
                .single();
              
              if (insertError) {
                console.log(`[LOGIN] Ошибка создания смены (попытка ${4-retries}): ${insertError.message}`);
                if (insertError.code === '23505') { // Unique violation
                  // Смена уже существует (создана другим запросом)
                  responseMessage = `Смена уже зафиксирована. Хорошего дня, ${employee.fullname}!`;
                  shiftCreated = true;
                } else if (retries === 1) {
                  throw insertError;
                }
                retries--;
                await new Promise(resolve => setTimeout(resolve, 500)); // Ждем 500мс перед retry
              } else {
                console.log(`[LOGIN] Смена успешно создана: ${newShift.id}`);
                responseMessage = `Добро пожаловать, ${employee.fullname}!`;
                shiftCreated = true;
              }
            } catch (err) {
              if (retries === 1) throw err;
              retries--;
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        } else {
          console.log(`[LOGIN] Смена уже существует: ${existingShift[0].id}`);
          responseMessage = `Ваша смена на сегодня уже была зафиксирована. Хорошего дня, ${employee.fullname}!`;
        }
        
        return { storeAddress, responseMessage };
      });
      
      storeAddress = lockResult.storeAddress;
      responseMessage = lockResult.responseMessage;
      
    } else if (employee.role === 'admin' || employee.role === 'accountant') {
      storeAddress = "Административная панель";
      responseMessage = `Добро пожаловать, ${employee.fullname}!`;
    }

    // Создаем токен
    const token = jwt.sign(
      { id: employee.id, role: employee.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );
    
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, { 
      httpOnly: true, 
      secure: isProduction, 
      sameSite: isProduction ? 'strict' : 'lax' 
    });
    
    console.log(`[LOGIN] Успешная авторизация: ${employee.fullname}, магазин: ${storeAddress}`);
    
    return res.json({ 
      success: true, 
      message: responseMessage, 
      store: storeAddress, 
      role: employee.role,
      token: token // Добавляем токен в ответ для клиента
    });
    
  } catch (error) {
    console.error(`[LOGIN] Критическая ошибка:`, error);
    
    // Более детальная обработка ошибок
    if (error.message === "Магазин не найден") {
      return res.status(404).json({ 
        success: false, 
        message: "Магазин не найден в системе" 
      });
    } else if (error.message === "Для этого сотрудника не удалось определить магазин.") {
      return res.status(404).json({ 
        success: false, 
        message: error.message 
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        message: "Внутренняя ошибка сервера. Попробуйте позже." 
      });
    }
  }
});