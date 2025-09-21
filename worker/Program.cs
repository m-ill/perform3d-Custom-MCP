using System.Text.Json;
using System.Threading;

var options = new JsonSerializerOptions
{
    PropertyNameCaseInsensitive = true,
};

string? line;
while ((line = Console.ReadLine()) != null)
{
    if (string.IsNullOrWhiteSpace(line))
    {
        continue;
    }

    CommandEnvelope? envelope;
    try
    {
        envelope = JsonSerializer.Deserialize<CommandEnvelope>(line, options);
        if (envelope is null)
        {
            continue;
        }
    }
    catch (JsonException ex)
    {
        WriteLog("error", $"Failed to parse command: {ex.Message}");
        continue;
    }

    try
    {
        var result = HandleCommand(envelope);
        var response = new CommandResponse
        {
            Id = envelope.Id,
            Ok = true,
            Data = result,
        };
        WriteJson(response);
    }
    catch (WorkerCommandException wex)
    {
        var response = new CommandResponse
        {
            Id = envelope.Id,
            Ok = false,
            Error = new CommandError { Code = wex.Code, Message = wex.Message },
        };
        WriteJson(response);
    }
    catch (Exception ex)
    {
        var response = new CommandResponse
        {
            Id = envelope.Id,
            Ok = false,
            Error = new CommandError { Code = "UNKNOWN", Message = ex.Message },
        };
        WriteJson(response);
    }
}

static object HandleCommand(CommandEnvelope envelope)
{
    var args = envelope.Args;
    switch (envelope.Cmd)
    {
        case "connect":
            return new { version = "10.0.0-dev" };
        case "open":
        case "new_from_template":
        case "save":
        case "close":
        case "set_model_info":
        case "add_material":
        case "add_cross_section":
        case "add_component":
        case "assign_property":
        case "define_load_pattern":
        case "set_nodal_load":
        case "define_series":
            return new { ok = true };
        case "add_nodes":
        {
            var count = GetArrayLength(args, "items");
            return new { count };
        }
        case "add_elements":
        {
            var count = GetArrayLength(args, "items");
            return new { count };
        }
        case "run_series":
        {
            var token = args.TryGetProperty("progressToken", out var tokenProp) && tokenProp.ValueKind == JsonValueKind.String
                ? tokenProp.GetString()!
                : Guid.NewGuid().ToString();

            PublishProgress(token, "validating", 0.1, "Validating inputs");
            Thread.Sleep(250);
            PublishProgress(token, "running", 0.5, "Running analysis (stub)");
            Thread.Sleep(250);
            PublishProgress(token, "post-processing", 0.9, "Post processing results");
            Thread.Sleep(250);
            PublishProgress(token, "done", 1.0, "Analysis complete (stub)");

            return new { ok = true, summary = "Analysis completed (stub)", progressToken = token };
        }
        case "get_node_disp":
            return new { head = new[] { "t", "ux", "uy", "uz" }, data = new[] { new[] { "0.0", "0", "0", "0" } } };
        case "get_support_reaction":
            return new { head = new[] { "node", "fx", "fy", "fz" }, data = new[] { new[] { "1", "0", "0", "-200" } } };
        case "get_element_shear":
            return new { head = new[] { "element", "shear" }, data = new[] { new[] { "E1", "46.8" } } };
        case "get_component_usage":
            return new { head = new[] { "component", "usage" }, data = new[] { new[] { "Col_Elastic", "0.72" } } };
        case "get_pushover_curve":
            return new { x = new[] { 0, 1, 2 }, y = new[] { 0, 10, 18 } };
        case "get_time_history":
            return new { t = new[] { 0, 0.1, 0.2 }, v = new[] { 0, 0.05, -0.03 } };
        case "export_table":
            return new { path = "C:/p3d-mcp/work/export_stub.csv" };
        default:
            throw new WorkerCommandException("UNKNOWN_COMMAND", $"Command '{envelope.Cmd}' not implemented in stub worker.");
    }
}

static int GetArrayLength(JsonElement args, string property)
{
    if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty(property, out var items) && items.ValueKind == JsonValueKind.Array)
    {
        return items.GetArrayLength();
    }
    return 0;
}

static void PublishProgress(string token, string stage, double value, string message)
{
    var payload = new ProgressEnvelope
    {
        Type = "progress",
        Token = token,
        Stage = stage,
        Value = value,
        Message = message,
    };
    WriteJson(payload);
}

static void WriteLog(string level, string message)
{
    var payload = new LogEnvelope
    {
        Type = "log",
        Level = level,
        Message = message,
    };
    WriteJson(payload);
}

static void WriteJson<T>(T payload)
{
    var json = JsonSerializer.Serialize(payload);
    Console.Out.WriteLine(json);
    Console.Out.Flush();
}

record CommandEnvelope(string Id, string Cmd, JsonElement Args);

record CommandResponse
{
    public string Id { get; init; } = string.Empty;
    public bool Ok { get; init; }
    public object? Data { get; init; }
    public CommandError? Error { get; init; }
}

record CommandError
{
    public string Code { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
}

record ProgressEnvelope
{
    public string Type { get; init; } = "progress";
    public string Token { get; init; } = string.Empty;
    public string Stage { get; init; } = string.Empty;
    public double Value { get; init; }
    public string? Message { get; init; }
}

record LogEnvelope
{
    public string Type { get; init; } = "log";
    public string Level { get; init; } = "info";
    public string Message { get; init; } = string.Empty;
}

class WorkerCommandException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
