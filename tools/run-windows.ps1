param(
    [ValidateRange(1024,65535)][int]$Port = 8443,
    [ValidateRange(1024,65535)][int]$BackendPort = 8444,
    [string]$BindAddress = '127.0.0.1',
    [string]$DataPath = '',
    [string]$Certificate = '',
    [string]$PrivateKey = '',
    [switch]$Background
)
$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
$OrbitRoot = Split-Path $PSScriptRoot -Parent
$OrbitLocal = Join-Path $OrbitRoot '.local'
if ($Port -eq $BackendPort) { throw 'Frontend und WSL-Backend brauchen unterschiedliche Ports.' }
if ($OrbitRoot -notmatch '^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)(\\.+)$') {
    throw 'Dieser Starter erwartet einen WSL-Checkout. Fuer einen nativen Windows-Checkout siehe README-Schnellstart.'
}
$OrbitDistribution = $Matches[1]
$OrbitLinuxRoot = $Matches[2].Replace('\', '/')
$OrbitPython = Get-Command python.exe -ErrorAction SilentlyContinue
$OrbitPrefix = @()
if (-not $OrbitPython -or $OrbitPython.Source -like '*WindowsApps*') {
    $OrbitPython = Get-Command py.exe -ErrorAction SilentlyContinue
    $OrbitPrefix = @('-3')
}
if (-not $OrbitPython) { throw 'Windows-Python 3.11 oder neuer wird fuer die TCP-Weiterleitung benoetigt.' }
& $OrbitPython.Source @OrbitPrefix -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Windows-Python 3.11 oder neuer wird benoetigt.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port ist belegt. Nur den zugehoerigen Orbit-Server beenden, bevor der aktuelle Stand startet."
}
if (-not $Certificate) { $Certificate = Join-Path $OrbitLocal 'cert.pem' }
if (-not $PrivateKey) { $PrivateKey = Join-Path $OrbitLocal 'key.pem' }
$OrbitLinuxCert = & wsl.exe -d $OrbitDistribution --exec wslpath -u $Certificate
if ($LASTEXITCODE -ne 0) { throw 'Zertifikatspfad kann nicht nach WSL aufgeloest werden.' }
$OrbitLinuxKey = & wsl.exe -d $OrbitDistribution --exec wslpath -u $PrivateKey
if ($LASTEXITCODE -ne 0) { throw 'Schluesselpfad kann nicht nach WSL aufgeloest werden.' }
$OrbitBackendArguments = @(($OrbitLinuxRoot + '/tools/start_wsl_backend.py'), '--port', "$BackendPort",
    '--cert', $OrbitLinuxCert, '--key', $OrbitLinuxKey)
if ($DataPath) { $OrbitBackendArguments += @('--data-dir', $DataPath) }
if ($BindAddress -eq '0.0.0.0') {
    foreach ($OrbitAddress in (Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue)) {
        if ($OrbitAddress.IPAddress -notmatch '^(127\.|169\.254\.)' -and $OrbitAddress.InterfaceAlias -notmatch 'vEthernet|Loopback') {
            $OrbitBackendArguments += @('--url', "https://$($OrbitAddress.IPAddress):$Port")
        }
    }
}
# Native code, SQLite and AI stay in the existing WSL environment. Only TLS bytes cross Windows.
& wsl.exe -d $OrbitDistribution --exec python3 @OrbitBackendArguments
if ($LASTEXITCODE -ne 0) { throw 'Der WSL-HTTPS-Server konnte nicht starten.' }
$OrbitHealthText = & "$env:SystemRoot\System32\curl.exe" --silent --show-error --fail --max-time 5 `
    --cacert $Certificate "https://localhost:$BackendPort/health"
if ($LASTEXITCODE -ne 0) { throw 'WSL-HTTPS ist unter Windows nicht erreichbar. WSL localhostForwarding und docs/vr/setup.md pruefen.' }
$OrbitHealth = $OrbitHealthText | ConvertFrom-Json
if ($OrbitHealth.app -ne 'orbit-wilde-inseln' -or $OrbitHealth.protocol -ne 4) { throw 'Am Backend-Port antwortet nicht der aktuelle Orbit-Server.' }
$OrbitArguments = $OrbitPrefix + @('-u', (Join-Path $PSScriptRoot 'tcp_relay.py'), '--host', $BindAddress,
    '--port', "$Port", '--upstream-port', "$BackendPort")
Write-Host "Aktueller Orbit-Checkout: $OrbitRoot"
Write-Host "Spiel: https://localhost:$Port/  Werkstatt: https://localhost:$Port/designer/index.html"
if ($Background) {
    if ($OrbitArguments | Where-Object { $_.Contains('"') }) { throw 'Ungueltiges Anfuehrungszeichen im Startpfad.' }
    $OrbitCommandLine = ($OrbitArguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
    $OrbitProcess = Start-Process -FilePath $OrbitPython.Source -ArgumentList $OrbitCommandLine -WorkingDirectory $OrbitRoot `
        -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $OrbitLocal "windows-$Port.log") `
        -RedirectStandardError (Join-Path $OrbitLocal "windows-$Port-error.log")
    $OrbitReady = $false
    for ($OrbitAttempt = 0; $OrbitAttempt -lt 40; $OrbitAttempt++) {
        $OrbitProcess.Refresh()
        if ($OrbitProcess.HasExited) { throw "Orbit-Start fehlgeschlagen; siehe .local/windows-$Port-error.log." }
        foreach ($OrbitSocket in (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
            # py.exe can launch a child interpreter; retain ownership checks.
            $OrbitCandidate = [int]$OrbitSocket.OwningProcess
            for ($OrbitDepth = 0; $OrbitDepth -lt 4 -and $OrbitCandidate -gt 0; $OrbitDepth++) {
                if ($OrbitCandidate -eq $OrbitProcess.Id) {
                    $OrbitServerId = [int]$OrbitSocket.OwningProcess
                    $OrbitReady = $true
                    break
                }
                $OrbitParent = Get-CimInstance Win32_Process -Filter "ProcessId = $OrbitCandidate" -ErrorAction SilentlyContinue
                if (-not $OrbitParent) { break }
                $OrbitCandidate = [int]$OrbitParent.ParentProcessId
            }
        }
        if ($OrbitReady) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $OrbitReady) {
        Stop-Process -Id $OrbitProcess.Id
        throw 'Die neue Weiterleitung hat innerhalb des Zeitbudgets keinen Listener geoeffnet.'
    }
    Set-Content -Path (Join-Path $OrbitLocal "windows-$Port.pid") -Value $OrbitServerId
    Write-Host "Orbit laeuft im Hintergrund (Windows-PID $OrbitServerId)."
} else {
    & $OrbitPython.Source @OrbitArguments
    exit $LASTEXITCODE
}
