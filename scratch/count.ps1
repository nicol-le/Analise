$headers = @{
  'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3hrZWJidW91eGh0cXRkdHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTcwNDgsImV4cCI6MjA5NDg5MzA0OH0.uWzPvdd7k1CDhLFt8oA7mm-FIePSFD6VhPYJcAkRjps';
  'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3hrZWJidW91eGh0cXRkdHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTcwNDgsImV4cCI6MjA5NDg5MzA0OH0.uWzPvdd7k1CDhLFt8oA7mm-FIePSFD6VhPYJcAkRjps'
}
$r = Invoke-RestMethod -Uri 'https://nmkxkebbuouxhtqtdtys.supabase.co/rest/v1/ceagesp?select=produto' -Headers $headers -Method Get
$prods = @()
if ($r) {
  foreach ($item in $r) {
    if ($item.produto -and $prods -notcontains $item.produto) {
      $prods += $item.produto
    }
  }
}
Write-Output "Total rows in query: $($r.Count)"
Write-Output "Unique products count: $($prods.Count)"
Write-Output "Products: $($prods -join ', ')"
