$ErrorActionPreference = 'Stop'
Set-Location 'D:\Shifts-api\Shifts-api'
$js = 'public\payroll.js'
Copy-Item $js "$js.bak-head" -Force

$lines  = Get-Content $js -Encoding UTF8
$iThead = ($lines | Select-String -SimpleMatch '<thead class="monthly-report-head">' | Select-Object -First 1).LineNumber - 1
$iRow2  = ($lines | Select-String -SimpleMatch '<th>Сумма</th>' | Select-Object -First 1).LineNumber - 1
if ($iThead -lt 0 -or $iRow2 -le $iThead) { throw 'Якоря шапки не найдены' }

$new = @'
            <tr>
                <th rowspan="2" style="vertical-align: middle;">Сотрудник</th>
                <th rowspan="2" style="vertical-align: middle;">Магазин</th>
                <th colspan="4" class="grp-head grp-earn-head">Начислено</th>
                <th colspan="3" class="grp-head grp-ded-head">Удержано</th>
                <th colspan="2" class="grp-head grp-adv-head">Выплачено авансом</th>
                <th colspan="3" class="grp-head grp-rem-head">Остаток к выдаче</th>
                <th rowspan="2" style="vertical-align: middle;">Действия</th>
            </tr>
            <tr>
                <th>Всего</th>
                <th class="sub-muted">в т.ч. бонусы</th>
                <th>Премия</th>
                <th class="col-reason">Причина</th>
                <th>Депремия</th>
                <th class="col-reason">Причина</th>
                <th>Недостача</th>
                <th>На карту</th>
                <th>Наличными</th>
                <th>На карту</th>
                <th>Наличными</th>
                <th>Всего</th>
            </tr>
'@ -split "`r?`n"

$out = $lines[0..$iThead] + $new + $lines[($iRow2 + 1)..($lines.Count - 1)]
Set-Content $js -Value $out -Encoding UTF8

$c = Get-Content $js -Raw -Encoding UTF8
$oldSync = "    t.querySelectorAll('.grp-prem-head, .grp-deprem-head').forEach(th => { th.colSpan = span; });"
$newSync = @'
    t.querySelectorAll('.grp-earn-head').forEach(th => { th.colSpan = span + 2; });
    t.querySelectorAll('.grp-ded-head').forEach(th => { th.colSpan = span + 1; });
    t.querySelectorAll('.grp-adv-head').forEach(th => { th.colSpan = 2; });
    t.querySelectorAll('.grp-rem-head').forEach(th => { th.colSpan = 3; });
'@
if (-not $c.Contains($oldSync)) { throw 'Тело syncGroupHeaders не найдено' }
$c = $c.Replace($oldSync, $newSync)

$dup = "    document.querySelectorAll('.grp-prem-head, .grp-deprem-head').forEach(th => { th.colSpan = collapsed ? 1 : 2; });`r`n"
$c = $c.Replace($dup, '')

Set-Content $js -Value $c -NoNewline -Encoding UTF8
Write-Host 'OK: шапка и syncGroupHeaders обновлены, бэкап public\payroll.js.bak-head'
