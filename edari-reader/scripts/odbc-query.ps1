param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$PayloadJson
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

function Write-JsonResult($Object) {
    $json = $Object | ConvertTo-Json -Depth 8 -Compress
    [Console]::Out.WriteLine($json)
}

function Get-InstalledOdbcDrivers {
    param([string[]]$Candidates)

    $installed = @()
    $allNexus = @()
    $roots = @(
        'HKLM:\SOFTWARE\ODBC\ODBCINST.INI\ODBC Drivers',
        'HKLM:\SOFTWARE\WOW6432Node\ODBC\ODBCINST.INI\ODBC Drivers'
    )

    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $props = Get-ItemProperty $root
        foreach ($prop in $props.PSObject.Properties) {
            if ($prop.Name -in @('PSPath', 'PSParentPath', 'PSChildName', 'PSDrive', 'PSProvider')) { continue }
            if ($prop.Name -match 'Nexus') {
                if ($allNexus -notcontains $prop.Name) { $allNexus += $prop.Name }
            }
            if ($Candidates -contains $prop.Name) {
                if ($installed -notcontains $prop.Name) { $installed += $prop.Name }
            }
        }
    }

    foreach ($driver in $allNexus) {
        if ($installed -notcontains $driver) { $installed += $driver }
    }

    return ,$installed
}

function Resolve-OdbcDriver {
    param(
        [string[]]$Candidates,
        [string]$Requested
    )

    # Trust an explicitly requested driver to skip the registry scan (perf).
    if ($Requested) {
        return $Requested
    }
    $installed = Get-InstalledOdbcDrivers -Candidates $Candidates
    if ($installed.Count -gt 0) {
        return $installed[0]
    }
    return $null
}

function Build-ConnectionString {
    param(
        [string]$Driver,
        [string]$Mode,
        [string]$Server,
        [int]$Port,
        [string]$Alias,
        [string]$DatabasePath
    )

    $isDevart = $Driver -match 'Devart'

    if ($Mode -eq 'internal') {
        $folder = $DatabasePath
        if (-not $folder.EndsWith('\')) { $folder += '\' }
        if ($isDevart) {
            return "Driver={$Driver};Database=$folder"
        }
        return "Driver={$Driver};Transport=Internal;Database=$folder"
    }

    if ($isDevart) {
        return "Driver={$Driver};Server=$Server;Port=$Port;Database=$Alias;String=Unicode"
    }

    return "Driver={$Driver};Server=nexusdb@$Server;Transport=TCP;Port=$Port;Database=$Alias"
}

function Open-OdbcConnection {
    param([string]$ConnectionString)
    Add-Type -AssemblyName System.Data
    $connection = New-Object System.Data.Odbc.OdbcConnection($ConnectionString)
    $connection.Open()
    return $connection
}

# Streams rows via a forward-only DataReader into generic Lists.
# Avoids DataTable double-buffering and PowerShell's O(n^2) array "+=".
function Invoke-OdbcReader {
    param(
        [System.Data.Odbc.OdbcConnection]$Connection,
        [string]$Sql
    )

    $command = $Connection.CreateCommand()
    $command.CommandText = $Sql
    $reader = $command.ExecuteReader()
    try {
        $fieldCount = $reader.FieldCount
        $columns = [System.Collections.Generic.List[string]]::new()
        for ($i = 0; $i -lt $fieldCount; $i++) {
            $columns.Add($reader.GetName($i))
        }

        $rows = [System.Collections.Generic.List[object]]::new()
        while ($reader.Read()) {
            $item = [ordered]@{}
            for ($i = 0; $i -lt $fieldCount; $i++) {
                $value = $reader.GetValue($i)
                if ($null -eq $value -or [DBNull]::Value.Equals($value)) {
                    $item[$columns[$i]] = $null
                }
                elseif ($value -is [byte[]]) {
                    $item[$columns[$i]] = [Convert]::ToBase64String($value)
                }
                else {
                    $item[$columns[$i]] = [string]$value
                }
            }
            $rows.Add($item)
        }

        return @{
            columns = $columns
            rows = $rows
            rowCount = $rows.Count
        }
    }
    finally {
        $reader.Close()
        $command.Dispose()
    }
}

# Single-shot: open connection, run one query, close.
function Invoke-OdbcAction {
    param(
        [string]$ConnectionString,
        [string]$Sql
    )

    $connection = Open-OdbcConnection -ConnectionString $ConnectionString
    try {
        return Invoke-OdbcReader -Connection $connection -Sql $Sql
    }
    finally {
        $connection.Close()
    }
}

try {
    if ($PayloadJson -like '@*') {
        $filePath = $PayloadJson.Substring(1)
        if (-not (Test-Path -LiteralPath $filePath)) {
            Write-JsonResult @{
                ok = $false
                error = "Payload file not found: $filePath"
            }
            exit 0
        }
        $PayloadJson = Get-Content -LiteralPath $filePath -Raw -Encoding UTF8
    }

    $payload = $PayloadJson | ConvertFrom-Json
    $candidates = @($payload.candidates)
    if ($candidates.Count -eq 0) {
        $candidates = @(
            'NexusDB V4 ODBC Driver',
            'NexusDB V3 ODBC Driver',
            'NexusDB V1 ODBC Driver',
            'NexusDB ODBC Driver'
        )
    }

    switch ($payload.action) {
        'detectDrivers' {
            $installed = Get-InstalledOdbcDrivers -Candidates $candidates
            Write-JsonResult @{
                ok = $true
                installed = $installed
                hasDriver = ($installed.Count -gt 0)
                candidates = $candidates
            }
        }

        'testConnection' {
            $driver = Resolve-OdbcDriver -Candidates $candidates -Requested $payload.driver
            if (-not $driver) {
                Write-JsonResult @{
                    ok = $false
                    error = 'NexusDB ODBC driver is not installed on this machine.'
                    needsDriver = $true
                }
                exit 0
            }

            $connectionString = Build-ConnectionString `
                -Driver $driver `
                -Mode $payload.mode `
                -Server $payload.server `
                -Port ([int]$payload.port) `
                -Alias $payload.alias `
                -DatabasePath $payload.databasePath

            $result = Invoke-OdbcAction -ConnectionString $connectionString -Sql 'SELECT TOP 1 * FROM #Tables'
            Write-JsonResult @{
                ok = $true
                driver = $driver
                connectionString = $connectionString
                sample = $result
            }
        }

        'listTables' {
            $driver = Resolve-OdbcDriver -Candidates $candidates -Requested $payload.driver
            if (-not $driver) {
                Write-JsonResult @{
                    ok = $false
                    error = 'NexusDB ODBC driver is not installed on this machine.'
                    needsDriver = $true
                }
                exit 0
            }

            $connectionString = Build-ConnectionString `
                -Driver $driver `
                -Mode $payload.mode `
                -Server $payload.server `
                -Port ([int]$payload.port) `
                -Alias $payload.alias `
                -DatabasePath $payload.databasePath

            $tables = @()
            try {
                $metadata = Invoke-OdbcAction -ConnectionString $connectionString -Sql 'SELECT * FROM #Tables'
                foreach ($row in $metadata.rows) {
                    if ($row.TABLE_NAME) { $tables += $row.TABLE_NAME }
                }
            }
            catch {
                # fallback below
            }

            if ($tables.Count -eq 0 -and $payload.databasePath -and (Test-Path $payload.databasePath)) {
                $tables = Get-ChildItem -Path $payload.databasePath -Filter '*.nx1' |
                    ForEach-Object { $_.BaseName }
            }

            Write-JsonResult @{
                ok = $true
                tables = $tables
                driver = $driver
            }
        }

        'query' {
            $driver = Resolve-OdbcDriver -Candidates $candidates -Requested $payload.driver
            if (-not $driver) {
                Write-JsonResult @{
                    ok = $false
                    error = 'NexusDB ODBC driver is not installed on this machine.'
                    needsDriver = $true
                }
                exit 0
            }

            $connectionString = Build-ConnectionString `
                -Driver $driver `
                -Mode $payload.mode `
                -Server $payload.server `
                -Port ([int]$payload.port) `
                -Alias $payload.alias `
                -DatabasePath $payload.databasePath

            $result = Invoke-OdbcAction -ConnectionString $connectionString -Sql $payload.sql
            Write-JsonResult @{
                ok = $true
                driver = $driver
                columns = $result.columns
                rows = $result.rows
                rowCount = $result.rowCount
            }
        }

        'batchQuery' {
            $driver = Resolve-OdbcDriver -Candidates $candidates -Requested $payload.driver
            if (-not $driver) {
                Write-JsonResult @{
                    ok = $false
                    error = 'NexusDB ODBC driver is not installed on this machine.'
                    needsDriver = $true
                }
                exit 0
            }

            $connectionString = Build-ConnectionString `
                -Driver $driver `
                -Mode $payload.mode `
                -Server $payload.server `
                -Port ([int]$payload.port) `
                -Alias $payload.alias `
                -DatabasePath $payload.databasePath

            $batch = @{}
            $connection = Open-OdbcConnection -ConnectionString $connectionString
            try {
                foreach ($item in @($payload.queries)) {
                    $id = [string]$item.id
                    if (-not $id) { continue }
                    $result = Invoke-OdbcReader -Connection $connection -Sql $item.sql
                    $batch[$id] = @{
                        columns = $result.columns
                        rows = $result.rows
                        rowCount = $result.rowCount
                    }
                }
            }
            finally {
                $connection.Close()
            }

            Write-JsonResult @{
                ok = $true
                driver = $driver
                results = $batch
            }
        }

        default {
            Write-JsonResult @{
                ok = $false
                error = "Unknown action: $($payload.action)"
            }
        }
    }
}
catch {
    Write-JsonResult @{
        ok = $false
        error = $_.Exception.Message
    }
}
