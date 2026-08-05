$headers = @{
  'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3hrZWJidW91eGh0cXRkdHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTcwNDgsImV4cCI6MjA5NDg5MzA0OH0.uWzPvdd7k1CDhLFt8oA7mm-FIePSFD6VhPYJcAkRjps';
  'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta3hrZWJidW91eGh0cXRkdHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTcwNDgsImV4cCI6MjA5NDg5MzA0OH0.uWzPvdd7k1CDhLFt8oA7mm-FIePSFD6VhPYJcAkRjps';
  'Prefer' = 'count=exact'
}
$response = Invoke-WebRequest -Uri 'https://nmkxkebbuouxhtqtdtys.supabase.co/rest/v1/ceagesp?select=id&limit=1' -Headers $headers -Method Head
$count = $response.Headers['Content-Range']
Write-Output "Content-Range header: $count"
