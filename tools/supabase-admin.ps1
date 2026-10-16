param(
  [ValidateSet('query','auth-read','auth-update','migrate','test','reset-password')][string]$Action = 'query',
  [string]$Path,
  [string]$UserId
)
$ErrorActionPreference = 'Stop'
# Uses the CLI credential already stored by `supabase login`. Never writes credentials to disk.
if (-not ('HamacarCredential' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HamacarCredential {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Credential {
    public uint Flags, Type; public string TargetName, Comment; public long LastWritten;
    public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist, AttributeCount;
    public IntPtr Attributes; public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool Read(string target, uint type, uint flags, out IntPtr pointer);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr pointer);
  public static string Token() {
    IntPtr p; if(!Read("Supabase CLI:supabase",1,0,out p)) throw new Exception("Ejecute supabase login primero.");
    try { var c=Marshal.PtrToStructure<Credential>(p); var b=new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob,b,0,b.Length); return System.Text.Encoding.UTF8.GetString(b).TrimEnd('\0');
    } finally { CredFree(p); }
  }
}
'@
}
$headers = @{ Authorization = 'Bearer ' + [HamacarCredential]::Token() }
$base = 'https://api.supabase.com/v1/projects/imuawsrkrrhzhaxyfmcy'
if ($Action -eq 'reset-password') {
  if ($UserId -notmatch '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$') { throw 'Indicá el UUID exacto de Authentication > Users.' }
  $securePassword = Read-Host 'Nueva contraseña (mínimo 12 caracteres; entrada oculta)' -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $newPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ($newPassword.Length -lt 12) { throw 'Usá al menos 12 caracteres.' }
    $keys = Invoke-RestMethod -Uri "$base/api-keys?reveal=true" -Headers $headers
    $serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
    $adminHeaders = @{ Authorization = 'Bearer ' + $serviceKey; apikey = $serviceKey }
    $body = @{ password = $newPassword } | ConvertTo-Json -Compress
    try { $null = Invoke-RestMethod -Method Put -Uri "https://imuawsrkrrhzhaxyfmcy.supabase.co/auth/v1/admin/users/$UserId" -Headers $adminHeaders -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)) }
    catch { throw 'Supabase no confirmó el cambio de contraseña. Revisá el UUID y el acceso administrativo.' }
    $body = @{ query = "update hamacar.app_sessions set revoked_at=now() where user_id='$UserId'::uuid and revoked_at is null;" } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Method Post -Uri "$base/database/query" -Headers $headers -ContentType 'application/json' -Body $body
    Write-Output 'Contraseña actualizada y sesiones de Hamacar revocadas. Entregala a su titular por un canal privado.'
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $newPassword = $null; $body = $null; $serviceKey = $null; $keys = $null; $adminHeaders = $null
    $securePassword.Dispose()
  }
} elseif ($Action -eq 'test') {
  $keys = Invoke-RestMethod -Uri "$base/api-keys?reveal=true" -Headers $headers
  $serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
  if (-not $serviceKey) { throw 'No se encontró la clave administrativa para las pruebas.' }
  $previousKey = $env:HAMACAR_TEST_SERVICE_KEY
  $previousToken = $env:HAMACAR_TEST_MANAGEMENT_TOKEN
  try {
    $env:HAMACAR_TEST_SERVICE_KEY = $serviceKey
    $env:HAMACAR_TEST_MANAGEMENT_TOKEN = $headers.Authorization.Substring(7)
    & ./node_modules/node/bin/node.exe $Path
    if ($LASTEXITCODE -ne 0) { throw 'Falló la prueba de integración. Revisar la evidencia sin credenciales.' }
  } finally {
    $env:HAMACAR_TEST_SERVICE_KEY = $previousKey
    $env:HAMACAR_TEST_MANAGEMENT_TOKEN = $previousToken
    $serviceKey = $null
  }
} elseif ($Action -eq 'auth-read') {
  $result = Invoke-RestMethod -Uri "$base/config/auth" -Headers $headers
  $result | Select-Object disable_signup,external_email_enabled,mailer_autoconfirm,smtp_host,site_url,uri_allow_list,jwt_exp,password_min_length | ConvertTo-Json
} elseif ($Action -eq 'auth-update') {
  $null = Invoke-RestMethod -Uri "$base/config/auth" -Method Patch -Headers $headers -ContentType 'application/json' -Body (Get-Content -LiteralPath $Path -Raw)
  Write-Output 'Configuración Auth aplicada.'
} else {
  $sql = Get-Content -LiteralPath $Path -Raw
  if ($Action -eq 'migrate') {
    $version = [IO.Path]::GetFileName($Path).Split('_')[0]
    if ($version -notmatch '^\d{14}$') { throw 'Versión de migración inválida.' }
    $name = [IO.Path]::GetFileNameWithoutExtension($Path).Substring(15).Replace("'", "''")
    # The SQL and its ledger entry commit together. Applied files are immutable.
    $sql = "begin; set local lock_timeout = '5s'; set local statement_timeout = '60s';`n" +
      "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);`n" +
      "do `$`$ begin if exists(select 1 from supabase_migrations.schema_migrations where version='$version') then raise exception 'Migración ya aplicada'; end if; end `$`$;`n" +
      $sql + "`ninsert into supabase_migrations.schema_migrations(version,name,statements) values('$version','$name',array['Applied from versioned repository migration']); commit;"
  }
  $body = @{ query = $sql } | ConvertTo-Json -Depth 10 -Compress
  Invoke-RestMethod -Uri "$base/database/query" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 30
}
