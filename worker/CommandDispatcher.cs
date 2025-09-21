using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Perform3D.Worker;

public class CommandDispatcher
{
    private readonly Perform3DSession _session;
    private readonly ResultMapper _resultMapper;
    private readonly Dictionary<string, Func<JsonElement, object>> _handlers;

    public CommandDispatcher(Perform3DSession session, ResultMapper resultMapper)
    {
        _session = session;
        _resultMapper = resultMapper;
        _handlers = InitializeHandlers();
    }

    private Dictionary<string, Func<JsonElement, object>> InitializeHandlers()
    {
        return new Dictionary<string, Func<JsonElement, object>>
        {
            ["connect"] = HandleConnect,
            ["disconnect"] = HandleDisconnect,
            ["open"] = HandleOpen,
            ["new_from_template"] = HandleNewFromTemplate,
            ["save"] = HandleSave,
            ["save_as"] = HandleSaveAs,
            ["close"] = HandleClose,
            ["set_model_info"] = HandleSetModelInfo,
            ["add_nodes"] = HandleAddNodes,
            ["add_elements"] = HandleAddElements,
            ["add_material"] = HandleAddMaterial,
            ["add_cross_section"] = HandleAddCrossSection,
            ["add_component"] = HandleAddComponent,
            ["assign_property"] = HandleAssignProperty,
            ["define_load_pattern"] = HandleDefineLoadPattern,
            ["set_nodal_load"] = HandleSetNodalLoad,
            ["define_series"] = HandleDefineSeries,
            ["run_series"] = HandleRunSeries,
            ["get_node_disp"] = HandleGetNodeDisp,
            ["get_support_reaction"] = HandleGetSupportReaction,
            ["get_element_shear"] = HandleGetElementShear,
            ["get_component_usage"] = HandleGetComponentUsage,
            ["get_pushover_curve"] = HandleGetPushoverCurve,
            ["get_time_history"] = HandleGetTimeHistory,
            ["export_table"] = HandleExportTable,
        };
    }

    public object Dispatch(string command, JsonElement args)
    {
        if (!_handlers.TryGetValue(command, out var handler))
        {
            throw new WorkerCommandException("UNKNOWN_COMMAND", $"Command '{command}' not supported");
        }

        return handler(args);
    }

    private object HandleConnect(JsonElement args)
    {
        _session.Connect();
        var version = _session.GetVersion();
        return new { version, connected = true };
    }

    private object HandleDisconnect(JsonElement args)
    {
        _session.Disconnect();
        return new { connected = false };
    }

    private object HandleOpen(JsonElement args)
    {
        var path = GetRequiredString(args, "path");
        _session.OpenModel(path);
        return new { ok = true, path };
    }

    private object HandleNewFromTemplate(JsonElement args)
    {
        var templatePath = GetRequiredString(args, "templatePath");
        var newPath = GetRequiredString(args, "newPath");
        _session.NewFromTemplate(templatePath, newPath);
        return new { ok = true, path = newPath };
    }

    private object HandleSave(JsonElement args)
    {
        _session.SaveModel();
        return new { ok = true };
    }

    private object HandleSaveAs(JsonElement args)
    {
        var path = GetRequiredString(args, "path");
        _session.SaveModelAs(path);
        return new { ok = true, path };
    }

    private object HandleClose(JsonElement args)
    {
        _session.CloseModel();
        return new { ok = true };
    }

    private object HandleSetModelInfo(JsonElement args)
    {
        var model = _session.GetModel();

        if (args.TryGetProperty("title", out var titleProp) && titleProp.ValueKind == JsonValueKind.String)
        {
            model.Title = titleProp.GetString();
        }

        if (args.TryGetProperty("units", out var unitsProp) && unitsProp.ValueKind == JsonValueKind.Object)
        {
            if (unitsProp.TryGetProperty("length", out var lengthProp))
                model.Units.Length = lengthProp.GetString();
            if (unitsProp.TryGetProperty("force", out var forceProp))
                model.Units.Force = forceProp.GetString();
        }

        return new { ok = true };
    }

    private object HandleAddNodes(JsonElement args)
    {
        var model = _session.GetModel();
        var nodes = model.Nodes;

        if (!args.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
            throw new WorkerCommandException("INVALID_ARGS", "Missing or invalid 'items' array");

        int count = 0;
        foreach (var item in items.EnumerateArray())
        {
            var id = GetRequiredInt(item, "id");
            var x = GetRequiredDouble(item, "x");
            var y = GetRequiredDouble(item, "y");
            var z = GetRequiredDouble(item, "z");

            int result = nodes.Add(id, x, y, z);
            CheckResult(result, $"Failed to add node {id}");
            count++;
        }

        return new { count, ok = true };
    }

    private object HandleAddElements(JsonElement args)
    {
        var model = _session.GetModel();
        var elements = model.Elements;

        if (!args.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
            throw new WorkerCommandException("INVALID_ARGS", "Missing or invalid 'items' array");

        int count = 0;
        foreach (var item in items.EnumerateArray())
        {
            var id = GetRequiredString(item, "id");
            var type = GetRequiredString(item, "type");
            var nodes = GetRequiredIntArray(item, "nodes");
            var property = item.TryGetProperty("property", out var prop) ? prop.GetString() : null;

            int result = type.ToLower() switch
            {
                "beam" => elements.AddBeam(id, nodes[0], nodes[1], property),
                "column" => elements.AddColumn(id, nodes[0], nodes[1], property),
                "brace" => elements.AddBrace(id, nodes[0], nodes[1], property),
                "wall" => elements.AddWall(id, nodes, property),
                "slab" => elements.AddSlab(id, nodes, property),
                _ => throw new WorkerCommandException("INVALID_ELEMENT_TYPE", $"Unknown element type: {type}")
            };

            CheckResult(result, $"Failed to add element {id}");
            count++;
        }

        return new { count, ok = true };
    }

    private object HandleAddMaterial(JsonElement args)
    {
        var model = _session.GetModel();
        var materials = model.Materials;

        var name = GetRequiredString(args, "name");
        var type = GetRequiredString(args, "type");
        var props = args.GetProperty("properties");

        dynamic material;
        switch (type.ToLower())
        {
            case "elastic":
                material = materials.AddElastic(name);
                if (props.TryGetProperty("E", out var e))
                    material.E = e.GetDouble();
                if (props.TryGetProperty("nu", out var nu))
                    material.Nu = nu.GetDouble();
                break;

            case "concrete":
                material = materials.AddConcrete(name);
                if (props.TryGetProperty("fc", out var fc))
                    material.Fc = fc.GetDouble();
                if (props.TryGetProperty("Ec", out var ec))
                    material.Ec = ec.GetDouble();
                break;

            case "steel":
                material = materials.AddSteel(name);
                if (props.TryGetProperty("Fy", out var fy))
                    material.Fy = fy.GetDouble();
                if (props.TryGetProperty("E", out var es))
                    material.E = es.GetDouble();
                break;

            default:
                throw new WorkerCommandException("INVALID_MATERIAL_TYPE", $"Unknown material type: {type}");
        }

        return new { ok = true, name };
    }

    private object HandleAddCrossSection(JsonElement args)
    {
        var model = _session.GetModel();
        var sections = model.CrossSections;

        var name = GetRequiredString(args, "name");
        var shape = GetRequiredString(args, "shape");
        var dimensions = args.GetProperty("dimensions");

        dynamic section;
        switch (shape.ToLower())
        {
            case "rectangle":
                var width = GetRequiredDouble(dimensions, "width");
                var height = GetRequiredDouble(dimensions, "height");
                section = sections.AddRectangle(name, width, height);
                break;

            case "circle":
                var diameter = GetRequiredDouble(dimensions, "diameter");
                section = sections.AddCircle(name, diameter);
                break;

            case "i-shape":
                section = sections.AddIShape(name);
                if (dimensions.TryGetProperty("bf_top", out var bft))
                    section.BfTop = bft.GetDouble();
                if (dimensions.TryGetProperty("tf_top", out var tft))
                    section.TfTop = tft.GetDouble();
                if (dimensions.TryGetProperty("tw", out var tw))
                    section.Tw = tw.GetDouble();
                if (dimensions.TryGetProperty("h", out var h))
                    section.H = h.GetDouble();
                break;

            default:
                throw new WorkerCommandException("INVALID_SECTION_SHAPE", $"Unknown section shape: {shape}");
        }

        return new { ok = true, name };
    }

    private object HandleAddComponent(JsonElement args)
    {
        var model = _session.GetModel();
        var components = model.Components;

        var name = GetRequiredString(args, "name");
        var type = GetRequiredString(args, "type");
        var material = GetRequiredString(args, "material");
        var section = args.TryGetProperty("section", out var sec) ? sec.GetString() : null;

        dynamic component;
        switch (type.ToLower())
        {
            case "elastic_beam":
                component = components.AddElasticBeam(name, material, section);
                break;

            case "elastic_column":
                component = components.AddElasticColumn(name, material, section);
                break;

            case "inelastic_beam":
                component = components.AddInelasticBeam(name, material, section);
                if (args.TryGetProperty("hinges", out var hinges))
                {
                    // Configure plastic hinges
                }
                break;

            default:
                throw new WorkerCommandException("INVALID_COMPONENT_TYPE", $"Unknown component type: {type}");
        }

        return new { ok = true, name };
    }

    private object HandleAssignProperty(JsonElement args)
    {
        var model = _session.GetModel();
        var elements = model.Elements;

        var elementIds = GetRequiredStringArray(args, "elements");
        var property = GetRequiredString(args, "property");

        int count = 0;
        foreach (var id in elementIds)
        {
            var element = elements.GetById(id);
            if (element != null)
            {
                element.Property = property;
                count++;
            }
        }

        return new { count, ok = true };
    }

    private object HandleDefineLoadPattern(JsonElement args)
    {
        var model = _session.GetModel();
        var loadPatterns = model.LoadPatterns;

        var name = GetRequiredString(args, "name");
        var type = GetRequiredString(args, "type");
        var factor = args.TryGetProperty("factor", out var f) ? f.GetDouble() : 1.0;

        int result = loadPatterns.Add(name, type, factor);
        CheckResult(result, $"Failed to define load pattern {name}");

        return new { ok = true, name };
    }

    private object HandleSetNodalLoad(JsonElement args)
    {
        var model = _session.GetModel();
        var loads = model.NodalLoads;

        var nodeId = GetRequiredInt(args, "nodeId");
        var pattern = GetRequiredString(args, "pattern");
        var fx = args.TryGetProperty("fx", out var fxp) ? fxp.GetDouble() : 0;
        var fy = args.TryGetProperty("fy", out var fyp) ? fyp.GetDouble() : 0;
        var fz = args.TryGetProperty("fz", out var fzp) ? fzp.GetDouble() : 0;

        int result = loads.SetLoad(pattern, nodeId, fx, fy, fz, 0, 0, 0);
        CheckResult(result, $"Failed to set nodal load at node {nodeId}");

        return new { ok = true };
    }

    private object HandleDefineSeries(JsonElement args)
    {
        var model = _session.GetModel();
        var series = model.AnalysisSeries;

        var name = GetRequiredString(args, "name");
        var type = GetRequiredString(args, "type");

        dynamic seriesObj;
        switch (type.ToLower())
        {
            case "gravity":
                seriesObj = series.AddGravity(name);
                break;

            case "pushover":
                seriesObj = series.AddPushover(name);
                if (args.TryGetProperty("controlNode", out var cn))
                    seriesObj.ControlNode = cn.GetInt32();
                if (args.TryGetProperty("direction", out var dir))
                    seriesObj.Direction = dir.GetString();
                break;

            case "time_history":
                seriesObj = series.AddTimeHistory(name);
                if (args.TryGetProperty("duration", out var dur))
                    seriesObj.Duration = dur.GetDouble();
                if (args.TryGetProperty("dt", out var dt))
                    seriesObj.TimeStep = dt.GetDouble();
                break;

            default:
                throw new WorkerCommandException("INVALID_SERIES_TYPE", $"Unknown analysis series type: {type}");
        }

        if (args.TryGetProperty("loadPatterns", out var patterns) && patterns.ValueKind == JsonValueKind.Array)
        {
            foreach (var pattern in patterns.EnumerateArray())
            {
                seriesObj.AddLoadPattern(pattern.GetString());
            }
        }

        return new { ok = true, name };
    }

    private object HandleRunSeries(JsonElement args)
    {
        var name = GetRequiredString(args, "name");
        var token = args.TryGetProperty("progressToken", out var tokenProp) && tokenProp.ValueKind == JsonValueKind.String
            ? tokenProp.GetString()!
            : Guid.NewGuid().ToString();

        var model = _session.GetModel();
        var series = model.AnalysisSeries.GetByName(name);
        if (series == null)
            throw new WorkerCommandException("SERIES_NOT_FOUND", $"Analysis series '{name}' not found");

        // Set up progress reporting
        var progressReporter = new ProgressReporter(token);

        // Run analysis with progress reporting
        progressReporter.Report("initializing", 0.05, "Initializing analysis");

        int result = series.Initialize();
        CheckResult(result, "Failed to initialize analysis");

        progressReporter.Report("checking", 0.1, "Checking model consistency");
        result = model.CheckModel();
        CheckResult(result, "Model check failed");

        progressReporter.Report("solving", 0.2, "Starting analysis");

        // Run the actual analysis
        // Note: Real API might have async methods or events for progress
        result = series.Run();

        if (result == 0)
        {
            progressReporter.Report("converging", 0.8, "Analysis converged");
            progressReporter.Report("post-processing", 0.9, "Post-processing results");
            progressReporter.Report("complete", 1.0, "Analysis complete");

            var summary = new
            {
                steps = series.CompletedSteps,
                converged = true,
                maxDisp = series.MaxDisplacement,
                maxDrift = series.MaxDrift
            };

            return new { ok = true, summary, progressToken = token };
        }
        else
        {
            progressReporter.Report("failed", 0.5, $"Analysis failed at step {series.CompletedSteps}");
            throw new WorkerCommandException("ANALYSIS_FAILED", $"Analysis failed (code: {result})");
        }
    }

    private object HandleGetNodeDisp(JsonElement args)
    {
        var nodeId = GetRequiredInt(args, "nodeId");
        var series = GetRequiredString(args, "series");
        var step = args.TryGetProperty("step", out var s) ? s.GetInt32() : -1;

        return _resultMapper.GetNodeDisplacement(_session.GetModel(), nodeId, series, step);
    }

    private object HandleGetSupportReaction(JsonElement args)
    {
        var series = GetRequiredString(args, "series");
        var step = args.TryGetProperty("step", out var s) ? s.GetInt32() : -1;

        return _resultMapper.GetSupportReactions(_session.GetModel(), series, step);
    }

    private object HandleGetElementShear(JsonElement args)
    {
        var elementId = args.TryGetProperty("elementId", out var e) ? e.GetString() : null;
        var series = GetRequiredString(args, "series");
        var step = args.TryGetProperty("step", out var s) ? s.GetInt32() : -1;

        return _resultMapper.GetElementShear(_session.GetModel(), elementId, series, step);
    }

    private object HandleGetComponentUsage(JsonElement args)
    {
        var series = GetRequiredString(args, "series");
        var step = args.TryGetProperty("step", out var s) ? s.GetInt32() : -1;

        return _resultMapper.GetComponentUsage(_session.GetModel(), series, step);
    }

    private object HandleGetPushoverCurve(JsonElement args)
    {
        var series = GetRequiredString(args, "series");
        return _resultMapper.GetPushoverCurve(_session.GetModel(), series);
    }

    private object HandleGetTimeHistory(JsonElement args)
    {
        var series = GetRequiredString(args, "series");
        var resultType = GetRequiredString(args, "resultType");
        var id = args.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;

        return _resultMapper.GetTimeHistory(_session.GetModel(), series, resultType, id);
    }

    private object HandleExportTable(JsonElement args)
    {
        var tableType = GetRequiredString(args, "tableType");
        var path = GetRequiredString(args, "path");
        var series = args.TryGetProperty("series", out var s) ? s.GetString() : null;

        var model = _session.GetModel();
        var tables = model.Tables;

        int result = tables.ExportToCSV(tableType, path, series);
        CheckResult(result, $"Failed to export {tableType} table");

        return new { ok = true, path };
    }

    private static string GetRequiredString(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.String)
            throw new WorkerCommandException("INVALID_ARGS", $"Missing or invalid required property: {property}");
        return value.GetString()!;
    }

    private static int GetRequiredInt(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Number)
            throw new WorkerCommandException("INVALID_ARGS", $"Missing or invalid required property: {property}");
        return value.GetInt32();
    }

    private static double GetRequiredDouble(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Number)
            throw new WorkerCommandException("INVALID_ARGS", $"Missing or invalid required property: {property}");
        return value.GetDouble();
    }

    private static int[] GetRequiredIntArray(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Array)
            throw new WorkerCommandException("INVALID_ARGS", $"Missing or invalid required property: {property}");

        var result = new List<int>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Number)
                throw new WorkerCommandException("INVALID_ARGS", $"Invalid array element in {property}");
            result.Add(item.GetInt32());
        }
        return result.ToArray();
    }

    private static string[] GetRequiredStringArray(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Array)
            throw new WorkerCommandException("INVALID_ARGS", $"Missing or invalid required property: {property}");

        var result = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
                throw new WorkerCommandException("INVALID_ARGS", $"Invalid array element in {property}");
            result.Add(item.GetString()!);
        }
        return result.ToArray();
    }

    private static void CheckResult(int result, string errorMessage)
    {
        if (result != 0)
        {
            var code = result switch
            {
                -1 => "INVALID_INPUT",
                -2 => "NOT_FOUND",
                -3 => "ALREADY_EXISTS",
                -4 => "LIMIT_EXCEEDED",
                -5 => "INVALID_STATE",
                _ => "API_ERROR"
            };
            throw new WorkerCommandException(code, $"{errorMessage} (code: {result})");
        }
    }
}

public class ProgressReporter
{
    private readonly string _token;

    public ProgressReporter(string token)
    {
        _token = token;
    }

    public void Report(string stage, double value, string message)
    {
        var payload = new
        {
            type = "progress",
            token = _token,
            stage,
            value,
            message
        };

        var json = JsonSerializer.Serialize(payload);
        Console.Out.WriteLine(json);
        Console.Out.Flush();
    }
}