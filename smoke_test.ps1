$body = @{
    customerName = 'Automated Test 2'
    phone = '+1999999999'
    email = 'auto2@example.com'
    address = 'Test Address 2'
    lat = 0
    lng = 0
    scrapTypes = @(@{ type = 'Metal Scrap'; quantity = 3 })
    preferredDate = '2025-08-30'
    preferredTime = 'afternoon'
    instructions = 'Smoke test'
}
$bodyJson = $body | ConvertTo-Json -Depth 5
try {
    $resp = Invoke-RestMethod -Uri 'http://localhost:3000/api/requests' -Method Post -ContentType 'application/json' -Body $bodyJson -TimeoutSec 15
    Write-Output 'POST response:'
    $resp | ConvertTo-Json -Depth 5
    $id = $resp.id
    if (-not $id) {
        Write-Output 'No id returned; searching for created request...'
        $all = Invoke-RestMethod -Uri 'http://localhost:3000/api/requests' -UseBasicParsing
        $found = $all | Where-Object { $_.customerName -eq 'Automated Test 2' } | Select-Object -First 1
        $id = $found.id
    }
    Write-Output "Using id: $id"
    $update = @{ status = 'Assigned'; dealerId = 1 } | ConvertTo-Json
    $put = Invoke-RestMethod -Uri "http://localhost:3000/api/requests/$id" -Method Put -ContentType 'application/json' -Body $update -TimeoutSec 15
    Write-Output 'PUT response:'
    $put | ConvertTo-Json -Depth 5
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
