param(
    [Parameter(Mandatory = $true)]
    [string]$Server,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [int]$ReconnectSeconds = 3
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class RemoteBridgeTyper
{
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    public static void TypeText(string text)
    {
        foreach (char ch in text)
        {
            if (ch == '\r') continue;

            INPUT[] inputs = new INPUT[2];
            if (ch == '\n')
            {
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].U.ki.wVk = 0x0D;
                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].U.ki.wVk = 0x0D;
                inputs[1].U.ki.dwFlags = KEYEVENTF_KEYUP;
            }
            else
            {
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].U.ki.wScan = (ushort)ch;
                inputs[0].U.ki.dwFlags = KEYEVENTF_UNICODE;
                inputs[1].type = INPUT_KEYBOARD;
                inputs[1].U.ki.wScan = (ushort)ch;
                inputs[1].U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            }

            SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            Thread.Sleep(2);
        }
    }
}
'@

$wsUrl = $Server.Trim()
if ($wsUrl -match '^https://') {
    $wsUrl = 'wss://' + $wsUrl.Substring(8)
} elseif ($wsUrl -match '^http://') {
    $wsUrl = 'ws://' + $wsUrl.Substring(7)
}
$wsUrl = $wsUrl.TrimEnd('/')
if ($wsUrl -notmatch '/ws$') {
    $wsUrl = $wsUrl + '/ws'
}

function Send-Json {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Socket,
        [hashtable]$Payload
    )
    $json = $Payload | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [System.Threading.CancellationToken]::None
    ).Wait()
}

Write-Host ''
Write-Host 'Remote Bridge Windows Agent' -ForegroundColor Cyan
Write-Host "Server: $wsUrl"
Write-Host 'Keep the target Windows application focused; this console may stay in the background.' -ForegroundColor DarkGray
Write-Host ''

while ($true) {
    $socket = $null
    try {
        $socket = [System.Net.WebSockets.ClientWebSocket]::new()
        $socket.ConnectAsync(
            [Uri]$wsUrl,
            [System.Threading.CancellationToken]::None
        ).Wait()

        Send-Json -Socket $socket -Payload @{
            type = 'hello'
            role = 'agent'
            token = $Token
            name = 'Windows Agent'
        }

        $buffer = New-Object byte[] 16384
        $builder = New-Object System.Text.StringBuilder
        $segment = [System.ArraySegment[byte]]::new($buffer)

        while ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $result = $socket.ReceiveAsync(
                $segment,
                [System.Threading.CancellationToken]::None
            ).Result

            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                break
            }

            [void]$builder.Append(
                [System.Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count)
            )
            if (-not $result.EndOfMessage) { continue }

            $raw = $builder.ToString()
            [void]$builder.Clear()
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }

            try {
                $message = $raw | ConvertFrom-Json
            } catch {
                continue
            }

            switch ($message.type) {
                'ready' {
                    Write-Host '[agent] connected' -ForegroundColor Green
                }
                'agent-text' {
                    $id = [string]$message.id
                    $text = [string]$message.text
                    Write-Host ('[agent] input: ' + $text)
                    try {
                        [RemoteBridgeTyper]::TypeText($text)
                        Send-Json -Socket $socket -Payload @{
                            type = 'agent-result'
                            id = $id
                            ok = $true
                        }
                    } catch {
                        Send-Json -Socket $socket -Payload @{
                            type = 'agent-result'
                            id = $id
                            ok = $false
                            error = $_.Exception.Message
                        }
                    }
                }
                'error' {
                    Write-Host ('[agent] server error: ' + $message.message) -ForegroundColor Red
                }
            }
        }
    } catch {
        Write-Host ('[agent] disconnected: ' + $_.Exception.Message) -ForegroundColor Yellow
    } finally {
        if ($socket) { $socket.Dispose() }
    }

    Start-Sleep -Seconds $ReconnectSeconds
}
