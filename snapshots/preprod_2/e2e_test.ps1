try {
    Write-Output "Creating customer..."
    $cust = Invoke-RestMethod -Uri 'http://localhost:3000/api/users' -Method Post -ContentType 'application/json' -Body (@{ phone = '+1999999999' } | ConvertTo-Json)
    Write-Output "Customer:"
    $cust | ConvertTo-Json -Depth 5
    $custToken = $cust.token

    Write-Output "Creating admin..."
    $adm = Invoke-RestMethod -Uri 'http://localhost:3000/api/users' -Method Post -ContentType 'application/json' -Body (@{ phone = '+1888888888' } | ConvertTo-Json)
    Write-Output "Admin (initial):"
    $adm | ConvertTo-Json -Depth 5

    Write-Output "Assigning admin role to admin phone..."
    $assign = Invoke-RestMethod -Uri 'http://localhost:3000/api/users/assignRole' -Method Post -ContentType 'application/json' -Body (@{ phone = '1888888888'; role = 'admin' } | ConvertTo-Json)
    Write-Output "Assign response:"
    $assign | ConvertTo-Json -Depth 5

    Write-Output "Fetching admin to obtain token..."
    $adm2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/users?phone=1888888888' -Method Get
    Write-Output "Admin fetched:"
    $adm2 | ConvertTo-Json -Depth 5
    $adminToken = $adm2.token

    Write-Output "Posting a request as customer..."
    $body = @{
        customerName = 'Automated E2E'
        phone = '+1999999999'
        email = 'auto-e2e@example.com'
        address = 'Test Address E2E'
        lat = 12.34
        lng = 56.78
        scrapTypes = @(@{ type = 'Metal Scrap'; quantity = 3 })
        preferredDate = '2025-08-30'
        preferredTime = 'afternoon'
        instructions = 'E2E smoke'
    }
    $headers = @{ Authorization = "Bearer $custToken" }
    $resp = Invoke-RestMethod -Uri 'http://localhost:3000/api/requests' -Method Post -ContentType 'application/json' -Headers $headers -Body ($body | ConvertTo-Json -Depth 5)
    Write-Output 'POST response:'
    $resp | ConvertTo-Json -Depth 5
    $id = $resp.id
    if (-not $id) {
        Write-Output 'No id returned; searching for created request...'
        $all = Invoke-RestMethod -Uri 'http://localhost:3000/api/requests' -Method Get
        $found = $all | Where-Object { $_.customerName -eq 'Automated E2E' } | Select-Object -First 1
        $id = $found.id
    }
    Write-Output "Using id: $id"

    Write-Output "Assigning request as admin (status=Assigned, dealerId=1)..."
    $headersAdmin = @{ Authorization = "Bearer $adminToken"; 'Content-Type' = 'application/json' }
    $update = @{ status = 'Assigned'; dealerId = 1 }
    $put = Invoke-RestMethod -Uri "http://localhost:3000/api/requests/$id" -Method Put -ContentType 'application/json' -Headers $headersAdmin -Body ($update | ConvertTo-Json)
    Write-Output 'PUT response:'
    $put | ConvertTo-Json -Depth 5
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
