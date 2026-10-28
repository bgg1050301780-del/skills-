# 仅清理用户明确指定的旧 uberSKILLS 部署；不删除共享的 Node.js、浏览器或其他项目。
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath('F:\uberSKILLS').TrimEnd('\')
if ($target -cne 'F:\uberSKILLS') { throw '清理目录核对失败，操作已停止。' }
if (Test-Path -LiteralPath $target) {
    $rootItem = Get-Item -LiteralPath $target -Force
    if ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '清理根目录是链接，操作已停止。' }
}
$processes = @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match '(?i)F:\\uberSKILLS\\'
})
foreach ($process in ($processes | Sort-Object ParentProcessId -Descending)) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
$removedShortcuts = @()
$shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'uberSKILLS 技能编辑器.lnk'),
    'C:\Users\Public\Desktop\uberSKILLS 技能编辑器.lnk'
)
$ws = New-Object -ComObject WScript.Shell
foreach ($shortcutPath in $shortcutPaths) {
    if (Test-Path -LiteralPath $shortcutPath) {
        $shortcut = $ws.CreateShortcut($shortcutPath)
        if ($shortcut.Arguments -notmatch '(?i)F:\\uberSKILLS\\' -and $shortcut.TargetPath -notlike "$target\*") { throw '快捷方式指向其他项目，已停止删除。' }
        Remove-Item -LiteralPath $shortcutPath -Force
        $removedShortcuts += $shortcutPath
    }
}
if (Test-Path -LiteralPath $target) {
    # PowerShell 原生命令只删除已核对的绝对目录；不跨 shell 拼接删除命令。
    Remove-Item -LiteralPath $target -Recurse -Force
}
$remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match '(?i)F:\\uberSKILLS\\' })
$stillExists = Test-Path -LiteralPath $target
if ($stillExists -or $remaining.Count) { throw '旧项目尚有残留，请检查清理记录。' }
$report = [ordered]@{
    time = (Get-Date).ToString('o')
    project = 'uberSKILLS 技能编辑器'
    deletedRoot = $target
    removedProcessIds = @($processes | ForEach-Object ProcessId)
    removedShortcuts = $removedShortcuts
    rootAbsent = -not $stillExists
    remainingProjectProcesses = $remaining.Count
    scope = '旧项目源代码、模型配置、数据库、缓存、日志、备份、下载和专属工具均位于已删除目录。共享组件保留。'
}
$output = Join-Path $PSScriptRoot '..\evidence\旧uberSKILLS清理记录.json'
[IO.File]::WriteAllText([IO.Path]::GetFullPath($output),($report | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
$report | ConvertTo-Json -Depth 5
