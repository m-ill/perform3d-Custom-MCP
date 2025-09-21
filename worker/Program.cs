using System;
using System.Text.Json;
using System.Threading;
using Perform3D.Worker;

[STAThread]
static int Main(string[] args)
{
    // STA is required for COM interop with Perform3D
    Thread thread = new Thread(() => RunWorker());
    thread.SetApartmentState(ApartmentState.STA);
    thread.Start();
    thread.Join();
    return 0;
}

static void RunWorker()
{
    var options = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
    };

    using var session = new Perform3DSession();
    var resultMapper = new ResultMapper();
    var dispatcher = new CommandDispatcher(session, resultMapper);

    WriteLog("info", "Perform3D Worker started (COM-enabled)");

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
            var result = dispatcher.Dispatch(envelope.Cmd, envelope.Args);
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
            WriteLog("error", $"Unexpected error: {ex}");
            var response = new CommandResponse
            {
                Id = envelope.Id,
                Ok = false,
                Error = new CommandError { Code = "UNKNOWN", Message = ex.Message },
            };
            WriteJson(response);
        }
    }

    WriteLog("info", "Perform3D Worker shutting down");
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

record LogEnvelope
{
    public string Type { get; init; } = "log";
    public string Level { get; init; } = "info";
    public string Message { get; init; } = string.Empty;
}