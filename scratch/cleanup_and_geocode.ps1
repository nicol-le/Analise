# Define paths
$csvPath = "assets/data/dadostoneladaano.csv"
$coordsPath = "assets/data/city_coords.json"
$kelvinsUrl = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json"

Write-Host "1. Decoding double-UTF-8 in CSV..."
$rawText = [System.IO.File]::ReadAllText($csvPath, [System.Text.Encoding]::UTF8)
$bytes = [System.Text.Encoding]::GetEncoding("windows-1252").GetBytes($rawText)
$decodedText = [System.Text.Encoding]::UTF8.GetString($bytes)

# Save cleaned CSV back to disk as standard UTF-8
[System.IO.File]::WriteAllText($csvPath, $decodedText, [System.Text.Encoding]::UTF8)
Write-Host "CSV successfully cleaned and saved to $csvPath."

Write-Host "2. Downloading Brazilian municipalities dataset..."
$municipios = Invoke-RestMethod -Uri $kelvinsUrl
Write-Host "Downloaded $($municipios.Length) municipalities from Kelvins repo."

# Index Kelvins municipios by normalized key for fast lookup
# Key format: "MUNICIPIO|UF" (all normalized to uppercase, stripped of accents)
$geoLookup = @{}
foreach ($m in $municipios) {
    # Normalize name (remove accents, to uppercase)
    $normalizedName = $m.nome.Normalize([System.Text.NormalizationForm]::FormD)
    $normalizedName = [regex]::Replace($normalizedName, '\p{M}', '')
    $normalizedName = $normalizedName.ToUpper().Trim()
    
    $key = "$normalizedName|$($m.uf)"
    $geoLookup[$key] = @{
        latitude = $m.latitude
        longitude = $m.longitude
    }
}

Write-Host "3. Parsing unique cities from CSV..."
$lines = $decodedText -split "`r?`n"
$uniqueCities = @{}

# Skip header (line 0)
for ($i = 1; $i -lt $lines.Length; $i++) {
    $line = $lines[$i]
    if (-not $line.Trim()) { continue }
    
    # Parse CSV line manually to handle quotes
    # Format: ANO,PRODUTO,MUNICIPIO,UF,VL_TONELADA
    $parts = $line -split ','
    if ($parts.Length -ge 4) {
        $municipio = $parts[2].Trim()
        $uf = $parts[3].Trim()
        
        # Key in CSV
        $key = "$municipio|$uf"
        $uniqueCities[$key] = @{
            municipio = $municipio
            uf = $uf
        }
    }
}

Write-Host "Found $($uniqueCities.Count) unique cities in the CSV."

Write-Host "4. Matching CSV cities with coordinates..."
$outputCoords = @{}
$matchedCount = 0
$fallbackCount = 0

# State capitals coordinates for fallbacks (matching api.js)
$stateCapitals = @{
    "SP" = @{ latitude = -23.5505; longitude = -46.6333 }
    "MG" = @{ latitude = -19.9208; longitude = -43.9378 }
    "PR" = @{ latitude = -25.4284; longitude = -49.2733 }
    "RS" = @{ latitude = -30.0346; longitude = -51.2177 }
    "SC" = @{ latitude = -27.5954; longitude = -48.5480 }
    "BA" = @{ latitude = -12.9777; longitude = -38.5016 }
    "GO" = @{ latitude = -16.6869; longitude = -49.2648 }
    "PE" = @{ latitude = -8.0476; longitude = -34.8770 }
    "CE" = @{ latitude = -3.7319; longitude = -38.5267 }
    "RJ" = @{ latitude = -22.9068; longitude = -43.1729 }
    "ES" = @{ latitude = -20.3155; longitude = -40.3128 }
    "MT" = @{ latitude = -15.6010; longitude = -56.0979 }
    "MS" = @{ latitude = -20.4486; longitude = -54.6295 }
    "PA" = @{ latitude = -1.4558; longitude = -48.4902 }
    "MA" = @{ latitude = -2.5307; longitude = -44.3068 }
    "PB" = @{ latitude = -7.1195; longitude = -34.8450 }
    "RN" = @{ latitude = -5.7945; longitude = -35.2110 }
    "AL" = @{ latitude = -9.6658; longitude = -35.7353 }
    "SE" = @{ latitude = -10.9472; longitude = -37.0731 }
    "PI" = @{ latitude = -5.0920; longitude = -42.8038 }
    "TO" = @{ latitude = -10.2491; longitude = -48.3243 }
    "AM" = @{ latitude = -3.1190; longitude = -60.0217 }
    "RO" = @{ latitude = -8.7619; longitude = -63.9039 }
    "AC" = @{ latitude = -9.9754; longitude = -67.8249 }
    "AP" = @{ latitude = 0.0355;  longitude = -51.0705 }
    "RR" = @{ latitude = 2.8235;  longitude = -60.6758 }
    "DF" = @{ latitude = -15.7942; longitude = -47.8822 }
}

foreach ($cityKey in $uniqueCities.Keys) {
    $city = $uniqueCities[$cityKey]
    
    # Normalize for matching
    $normalizedName = $city.municipio.Normalize([System.Text.NormalizationForm]::FormD)
    $normalizedName = [regex]::Replace($normalizedName, '\p{M}', '')
    $normalizedName = $normalizedName.ToUpper().Trim()
    
    $lookupKey = "$normalizedName|$($city.uf)"
    
    if ($geoLookup.Contains($lookupKey)) {
        $outputCoords[$cityKey] = @{
            municipio = $city.municipio
            uf = $city.uf
            latitude = $geoLookup[$lookupKey].latitude
            longitude = $geoLookup[$lookupKey].longitude
        }
        $matchedCount++
    } else {
        # Fallback to state capital
        $uf = $city.uf
        if ($stateCapitals.Contains($uf)) {
            $outputCoords[$cityKey] = @{
                municipio = $city.municipio
                uf = $city.uf
                latitude = $stateCapitals[$uf].latitude
                longitude = $stateCapitals[$uf].longitude
                isFallback = $true
            }
            $fallbackCount++
        } else {
            # Absolute fallback to center of Brazil
            $outputCoords[$cityKey] = @{
                municipio = $city.municipio
                uf = $city.uf
                latitude = -14.2350
                longitude = -51.9253
                isFallback = $true
            }
            $fallbackCount++
        }
    }
}

Write-Host "Matched: $matchedCount cities."
Write-Host "Fallback to state capitals: $fallbackCount cities."

# Write output as JSON
$json = ConvertTo-Json $outputCoords -Depth 5
[System.IO.File]::WriteAllText($coordsPath, $json, [System.Text.Encoding]::UTF8)
Write-Host "Saved city coordinates lookup to $coordsPath."
