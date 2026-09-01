*fix-gross
$ErrorActionPreference = 'Stop'
Set-Location D:\Shifts-api\Shifts-api

$path = Join-Path (Get-Location) 'server.cjs'
$enc  = New-Object System.Text.UTF8Encoding($false)
$lines = [System.Collections.Generic.List[string]]([System.IO.File]::ReadAllLines($path, $enc))

if (($lines -join "`n") -like '*PATCH_KEEP_GROSS*') { Write-Host 'Патч уже применён — выхожу.'; exit }

Copy-Item server.cjs server.cjs.bak3 -Force
Write-Host 'Бэкап: server.cjs.bak3'

function Find-After([System.Collections.Generic.List[string]]$arr, [int]$start, [string]$needle) {
    for ($i = $start; $i -lt $arr.Count; $i++) { if ($arr[$i].Contains($needle)) { return $i } }
    return -1
}

$rA = Find-After $lines 0 "app.post('/save-universal-corrections'"
$rB = Find-After $lines 0 "app.post('/fix-universal-calculations'"
if ($rA -lt 0 -or $rB -lt 0) { throw 'Не найдены маршруты — файл изменён, патч отменён.' }

$aGross = Find-After $lines $rA 'total_gross: corrections.totalGross || 0,'
$aDed   = Find-After $lines $rA 'total_deductions: corrections.totalDeductions || 0,'
$aAft   = Find-After $lines $rA 'total_after_deductions: corrections.totalToPay || 0,'
$aIns   = Find-After $lines $rA "}, { onConflict: 'employee_id,month,year' });"

$bGross = Find-After $lines $rB 'total_gross: calculations.totalGross || 0,'
$bDed   = Find-After $lines $rB 'total_deductions: calculations.totalDeductions || 0,'
$bAft   = Find-After $lines $rB 'total_after_deductions: calculations.totalToPay || 0,'
$bIns   = Find-After $lines $rB 'const updateData = {'

foreach ($p in @($aGross,$aDed,$aAft,$aIns,$bGross,$bDed,$bAft,$bIns)) {
    if ($p -lt 0) { throw 'Не найден один из якорей — патч отменён, файл не тронут.' }
}
if ($aGross -gt $rB) { throw 'Якоря блока A залезли в другой маршрут — патч отменён.' }

# --- замены (индексы не смещаются) ---
$lines[$aGross] = '                total_gross: _gross,'
$lines[$aDed]   = '                total_deductions: _deductions,'
$lines[$aAft]   = '                total_after_deductions: _gross - _deductions,'
$lines[$bGross] = '            total_gross: _grossFix,'
$lines[$bDed]   = '            total_deductions: _deductionsFix,'
$lines[$bAft]   = '            total_after_deductions: _grossFix - _deductionsFix,'

$preA = @'

        // PATCH_KEEP_GROSS: не затираем начисления нулями, если клиент их не прислал
        const { data: existingFinal } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('year', year)
            .eq('month', month)
            .maybeSingle();
        const keepNum = (v, prev) => (v === undefined || v === null || v === '')
            ? Math.round(Number(prev) || 0)
            : Math.round(Number(v) || 0);
        const _gross = keepNum(corrections.totalGross, existingFinal?.total_gross);
        const _deductions = keepNum(corrections.totalDeductions, existingFinal?.total_deductions);
'@ -split "`r?`n"

$preB = @'
        // PATCH_KEEP_GROSS: подтягиваем текущую запись, чтобы не обнулять начисления
        const { data: existingFix } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('year', parseInt(year))
            .eq('month', parseInt(month))
            .maybeSingle();
        const keepNumFix = (v, prev) => (v === undefined || v === null || v === '')
            ? Math.round(Number(prev) || 0)
            : Math.round(Number(v) || 0);
        const _grossFix = keepNumFix(calculations.totalGross, existingFix?.total_gross);
        const _deductionsFix = keepNumFix(calculations.totalDeductions, existingFix?.total_deductions);

'@ -split "`r?`n"

# вставки сверху вниз по убыванию индекса, чтобы не сбить позиции
$lines.InsertRange($bIns, $preB)
$lines.InsertRange($aIns + 1, $preA)

[System.IO.File]::WriteAllLines($path, $lines, $enc)
Write-Host 'Патч применён.'
