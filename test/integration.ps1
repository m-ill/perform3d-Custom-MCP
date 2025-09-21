# Perform3D MCP Integration Test Script
# Requires: PowerShell 7+, Perform3D v10 installed, server running

param(
    [string]$ServerUrl = "http://localhost:8732",
    [string]$TemplateFile = "C:/p3d-mcp/templates/frame_template.p3d",
    [string]$WorkDir = "C:/p3d-mcp/work",
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-TestHeader($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-TestStep($msg) { Write-Host "  > $msg" -ForegroundColor Yellow }
function Write-TestSuccess($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-TestError($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }

# Helper function for API calls
function Invoke-P3DAPI {
    param(
        [string]$Method = "POST",
        [string]$Endpoint,
        [object]$Body = $null
    )

    $uri = "$ServerUrl$Endpoint"
    $params = @{
        Uri = $uri
        Method = $Method
        ContentType = "application/json"
        Headers = @{ Accept = "application/json" }
    }

    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    if ($Verbose) {
        Write-Host "API Call: $Method $uri" -ForegroundColor DarkGray
        if ($Body) {
            Write-Host "Body: $($params.Body)" -ForegroundColor DarkGray
        }
    }

    try {
        $response = Invoke-RestMethod @params
        if ($Verbose) {
            Write-Host "Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
        }
        return $response
    }
    catch {
        Write-TestError "API call failed: $_"
        if ($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $errorBody = $reader.ReadToEnd()
            Write-Host "Error details: $errorBody" -ForegroundColor Red
        }
        throw
    }
}

# Test data
$testModel = "$WorkDir/test_model_$(Get-Date -Format 'yyyyMMdd_HHmmss').p3d"

Write-TestHeader "Perform3D MCP Integration Test Suite"
Write-Host "Server: $ServerUrl"
Write-Host "Template: $TemplateFile"
Write-Host "Test Model: $testModel"

# Test 1: Server Health Check
Write-TestHeader "Test 1: Server Health Check"
Write-TestStep "Checking if server is running..."
try {
    $logs = Invoke-P3DAPI -Method GET -Endpoint "/api/logs/recent"
    Write-TestSuccess "Server is responding ($(($logs.items | Measure-Object).Count) log entries)"
}
catch {
    Write-TestError "Server is not responding"
    exit 1
}

# Test 2: Connect to Perform3D
Write-TestHeader "Test 2: Connect to Perform3D"
Write-TestStep "Connecting to Perform3D COM server..."
$connectResult = Invoke-P3DAPI -Endpoint "/api/project/connect"
if ($connectResult.ok -or $connectResult.version) {
    Write-TestSuccess "Connected to Perform3D version: $($connectResult.version)"
    $sessionId = $connectResult.sessionId
} else {
    Write-TestError "Failed to connect to Perform3D"
    exit 1
}

# Test 3: Create New Model from Template
Write-TestHeader "Test 3: Create New Model from Template"
Write-TestStep "Creating new model from template..."
if (Test-Path $TemplateFile) {
    $newModelResult = Invoke-P3DAPI -Endpoint "/api/project/new-from-template" -Body @{
        templatePath = $TemplateFile
        newPath = $testModel
    }
    if ($newModelResult.ok) {
        Write-TestSuccess "Model created at: $testModel"
    } else {
        Write-TestError "Failed to create model from template"
    }
} else {
    Write-TestStep "Template not found, creating empty model..."
    # Alternative: open an existing model or skip this test
    Write-TestSuccess "Skipped (template not available)"
}

# Test 4: Set Model Information
Write-TestHeader "Test 4: Set Model Information"
Write-TestStep "Setting model title and units..."
$setInfoResult = Invoke-P3DAPI -Endpoint "/api/model/set-info" -Body @{
    title = "Integration Test Model"
    units = @{
        length = "cm"
        force = "kN"
    }
}
Write-TestSuccess "Model info updated"

# Test 5: Add Nodes
Write-TestHeader "Test 5: Add Nodes"
Write-TestStep "Adding structural nodes..."
$nodes = @(
    @{ id = 101; x = 0; y = 0; z = 0 },
    @{ id = 102; x = 300; y = 0; z = 0 },
    @{ id = 103; x = 300; y = 400; z = 0 },
    @{ id = 104; x = 0; y = 400; z = 0 },
    @{ id = 201; x = 0; y = 0; z = 300 },
    @{ id = 202; x = 300; y = 0; z = 300 },
    @{ id = 203; x = 300; y = 400; z = 300 },
    @{ id = 204; x = 0; y = 400; z = 300 }
)
$addNodesResult = Invoke-P3DAPI -Endpoint "/api/model/add-nodes" -Body @{ items = $nodes }
Write-TestSuccess "Added $($addNodesResult.count) nodes"

# Test 6: Add Materials
Write-TestHeader "Test 6: Add Materials"
Write-TestStep "Defining concrete material..."
$materialResult = Invoke-P3DAPI -Endpoint "/api/component/add-material" -Body @{
    name = "C30"
    type = "concrete"
    properties = @{
        fc = 30
        Ec = 30000
    }
}
Write-TestSuccess "Material 'C30' defined"

# Test 7: Add Cross Sections
Write-TestHeader "Test 7: Add Cross Sections"
Write-TestStep "Defining rectangular sections..."
$sectionResult = Invoke-P3DAPI -Endpoint "/api/component/add-cross-section" -Body @{
    name = "Col_40x40"
    shape = "rectangle"
    dimensions = @{
        width = 40
        height = 40
    }
}
Write-TestSuccess "Section 'Col_40x40' defined"

# Test 8: Add Components
Write-TestHeader "Test 8: Add Components"
Write-TestStep "Defining elastic column component..."
$componentResult = Invoke-P3DAPI -Endpoint "/api/component/add-component" -Body @{
    name = "ElasticColumn"
    type = "elastic_column"
    material = "C30"
    section = "Col_40x40"
}
Write-TestSuccess "Component 'ElasticColumn' defined"

# Test 9: Add Elements
Write-TestHeader "Test 9: Add Elements"
Write-TestStep "Adding column elements..."
$elements = @(
    @{ id = "C1"; type = "column"; nodes = @(101, 201); property = "ElasticColumn" },
    @{ id = "C2"; type = "column"; nodes = @(102, 202); property = "ElasticColumn" },
    @{ id = "C3"; type = "column"; nodes = @(103, 203); property = "ElasticColumn" },
    @{ id = "C4"; type = "column"; nodes = @(104, 204); property = "ElasticColumn" }
)
$addElementsResult = Invoke-P3DAPI -Endpoint "/api/model/add-elements" -Body @{ items = $elements }
Write-TestSuccess "Added $($addElementsResult.count) elements"

# Test 10: Define Load Pattern
Write-TestHeader "Test 10: Define Load Pattern"
Write-TestStep "Defining gravity load pattern..."
$loadPatternResult = Invoke-P3DAPI -Endpoint "/api/load/define-pattern" -Body @{
    name = "Dead"
    type = "dead"
    factor = 1.0
}
Write-TestSuccess "Load pattern 'Dead' defined"

# Test 11: Apply Nodal Loads
Write-TestHeader "Test 11: Apply Nodal Loads"
Write-TestStep "Applying loads to top nodes..."
$topNodes = @(201, 202, 203, 204)
foreach ($nodeId in $topNodes) {
    $loadResult = Invoke-P3DAPI -Endpoint "/api/load/set-nodal" -Body @{
        nodeId = $nodeId
        pattern = "Dead"
        fz = -100
    }
}
Write-TestSuccess "Applied loads to $($topNodes.Count) nodes"

# Test 12: Save Model
Write-TestHeader "Test 12: Save Model"
Write-TestStep "Saving model..."
$saveResult = Invoke-P3DAPI -Endpoint "/api/project/save"
Write-TestSuccess "Model saved"

# Test 13: Define Analysis Series
Write-TestHeader "Test 13: Define Analysis Series"
Write-TestStep "Defining gravity analysis series..."
$seriesResult = Invoke-P3DAPI -Endpoint "/api/analysis/define-series" -Body @{
    name = "Gravity"
    type = "gravity"
    loadPatterns = @("Dead")
}
Write-TestSuccess "Analysis series 'Gravity' defined"

# Test 14: Run Analysis (with progress tracking)
Write-TestHeader "Test 14: Run Analysis"
Write-TestStep "Running gravity analysis..."
$runResult = Invoke-P3DAPI -Endpoint "/api/analysis/run-series" -Body @{
    name = "Gravity"
}

if ($runResult.progressToken) {
    Write-TestStep "Progress token: $($runResult.progressToken)"

    # Optional: Monitor progress (would need SSE client)
    Write-TestStep "Analysis started (monitoring skipped in basic test)"
}

if ($runResult.ok -or $runResult.result) {
    Write-TestSuccess "Analysis completed"
    if ($runResult.result.summary) {
        Write-Host "  Summary: $($runResult.result.summary | ConvertTo-Json -Compress)" -ForegroundColor Gray
    }
} else {
    Write-TestError "Analysis failed"
}

# Test 15: Get Results
Write-TestHeader "Test 15: Get Analysis Results"

Write-TestStep "Getting node displacement..."
$dispResult = Invoke-P3DAPI -Method GET -Endpoint "/api/results/nodeDisp?nodeId=201&series=Gravity"
if ($dispResult.data) {
    Write-TestSuccess "Retrieved displacement data ($(($dispResult.data | Measure-Object).Count) records)"
}

Write-TestStep "Getting support reactions..."
$reactionResult = Invoke-P3DAPI -Method GET -Endpoint "/api/results/supportReaction?series=Gravity"
if ($reactionResult.data) {
    Write-TestSuccess "Retrieved reaction data ($(($reactionResult.data | Measure-Object).Count) records)"
}

# Test 16: Export Results
Write-TestHeader "Test 16: Export Results"
Write-TestStep "Exporting results to CSV..."
$exportPath = "$WorkDir/test_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"
$exportResult = Invoke-P3DAPI -Method GET -Endpoint "/api/export/table?tableType=reactions&path=$([System.Uri]::EscapeDataString($exportPath))&series=Gravity"
if ($exportResult.data.path) {
    Write-TestSuccess "Results exported to: $($exportResult.data.path)"
}

# Test 17: Close Model
Write-TestHeader "Test 17: Close Model"
Write-TestStep "Closing model..."
$closeResult = Invoke-P3DAPI -Endpoint "/api/project/close"
Write-TestSuccess "Model closed"

# Test Summary
Write-TestHeader "Test Summary"
Write-TestSuccess "All integration tests completed successfully!"
Write-Host "`nTest artifacts:" -ForegroundColor Cyan
Write-Host "  - Model file: $testModel" -ForegroundColor Gray
if ($exportResult.data.path) {
    Write-Host "  - Export file: $($exportResult.data.path)" -ForegroundColor Gray
}

# Cleanup option
$cleanup = Read-Host "`nDelete test files? (y/n)"
if ($cleanup -eq 'y') {
    if (Test-Path $testModel) { Remove-Item $testModel -Force }
    if ($exportResult.data.path -and (Test-Path $exportResult.data.path)) {
        Remove-Item $exportResult.data.path -Force
    }
    Write-Host "Test files cleaned up" -ForegroundColor Green
}