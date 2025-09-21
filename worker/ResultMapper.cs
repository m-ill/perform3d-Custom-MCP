using System;
using System.Collections.Generic;
using System.Linq;

namespace Perform3D.Worker;

public class ResultMapper
{
    public object GetNodeDisplacement(dynamic model, int nodeId, string series, int step)
    {
        var results = model.Results;
        var displacement = results.GetNodeDisplacement(series, step, nodeId);

        if (displacement == null)
            throw new WorkerCommandException("NO_RESULTS", $"No displacement results for node {nodeId}");

        var data = new List<object[]>();

        if (step == -1)
        {
            // Return all steps
            var stepCount = results.GetStepCount(series);
            for (int i = 0; i <= stepCount; i++)
            {
                var disp = results.GetNodeDisplacement(series, i, nodeId);
                data.Add(new object[] {
                    i.ToString(),
                    disp.Ux.ToString("F6"),
                    disp.Uy.ToString("F6"),
                    disp.Uz.ToString("F6"),
                    disp.Rx.ToString("F6"),
                    disp.Ry.ToString("F6"),
                    disp.Rz.ToString("F6")
                });
            }
        }
        else
        {
            data.Add(new object[] {
                step.ToString(),
                displacement.Ux.ToString("F6"),
                displacement.Uy.ToString("F6"),
                displacement.Uz.ToString("F6"),
                displacement.Rx.ToString("F6"),
                displacement.Ry.ToString("F6"),
                displacement.Rz.ToString("F6")
            });
        }

        return new
        {
            head = new[] { "step", "ux", "uy", "uz", "rx", "ry", "rz" },
            data = data.ToArray()
        };
    }

    public object GetSupportReactions(dynamic model, string series, int step)
    {
        var results = model.Results;
        var reactions = results.GetReactions(series, step);

        if (reactions == null)
            throw new WorkerCommandException("NO_RESULTS", "No reaction results available");

        var data = new List<object[]>();

        foreach (var reaction in reactions)
        {
            if (Math.Abs(reaction.Fx) > 1e-6 || Math.Abs(reaction.Fy) > 1e-6 ||
                Math.Abs(reaction.Fz) > 1e-6 || Math.Abs(reaction.Mx) > 1e-6 ||
                Math.Abs(reaction.My) > 1e-6 || Math.Abs(reaction.Mz) > 1e-6)
            {
                data.Add(new object[] {
                    reaction.NodeId.ToString(),
                    reaction.Fx.ToString("F3"),
                    reaction.Fy.ToString("F3"),
                    reaction.Fz.ToString("F3"),
                    reaction.Mx.ToString("F3"),
                    reaction.My.ToString("F3"),
                    reaction.Mz.ToString("F3")
                });
            }
        }

        return new
        {
            head = new[] { "node", "fx", "fy", "fz", "mx", "my", "mz" },
            data = data.ToArray()
        };
    }

    public object GetElementShear(dynamic model, string? elementId, string series, int step)
    {
        var results = model.Results;
        var elements = model.Elements;

        var data = new List<object[]>();

        if (string.IsNullOrEmpty(elementId))
        {
            // Get shear for all beam/column elements
            foreach (var element in elements.GetAll())
            {
                if (element.Type == "Beam" || element.Type == "Column")
                {
                    var forces = results.GetElementForces(series, step, element.Id);
                    if (forces != null)
                    {
                        data.Add(new object[] {
                            element.Id,
                            forces.V2.ToString("F3"),
                            forces.V3.ToString("F3")
                        });
                    }
                }
            }
        }
        else
        {
            var forces = results.GetElementForces(series, step, elementId);
            if (forces == null)
                throw new WorkerCommandException("NO_RESULTS", $"No force results for element {elementId}");

            data.Add(new object[] {
                elementId,
                forces.V2.ToString("F3"),
                forces.V3.ToString("F3")
            });
        }

        return new
        {
            head = new[] { "element", "V2", "V3" },
            data = data.ToArray()
        };
    }

    public object GetComponentUsage(dynamic model, string series, int step)
    {
        var results = model.Results;
        var components = model.Components;

        var data = new List<object[]>();

        foreach (var component in components.GetAll())
        {
            var usage = results.GetComponentUsage(series, step, component.Name);
            if (usage != null)
            {
                data.Add(new object[] {
                    component.Name,
                    component.Type,
                    usage.MaxUsage.ToString("F3"),
                    usage.Location,
                    usage.LimitState
                });
            }
        }

        // Sort by usage descending
        data = data.OrderByDescending(d => double.Parse((string)d[2])).ToList();

        return new
        {
            head = new[] { "component", "type", "usage", "location", "limit_state" },
            data = data.ToArray()
        };
    }

    public object GetPushoverCurve(dynamic model, string series)
    {
        var results = model.Results;
        var pushover = results.GetPushoverCurve(series);

        if (pushover == null)
            throw new WorkerCommandException("NO_RESULTS", $"No pushover results for series {series}");

        var x = new List<double>();
        var y = new List<double>();

        foreach (var point in pushover.Points)
        {
            x.Add(point.Displacement);
            y.Add(point.BaseShear);
        }

        return new
        {
            x = x.ToArray(),
            y = y.ToArray(),
            units = new { x = "in", y = "kips" },
            metadata = new
            {
                targetDisp = pushover.TargetDisplacement,
                yieldPoint = pushover.YieldPoint,
                ultimatePoint = pushover.UltimatePoint,
                ductility = pushover.Ductility
            }
        };
    }

    public object GetTimeHistory(dynamic model, string series, string resultType, string? id)
    {
        var results = model.Results;
        dynamic history;

        switch (resultType.ToLower())
        {
            case "displacement":
                if (string.IsNullOrEmpty(id))
                    throw new WorkerCommandException("INVALID_ARGS", "Node ID required for displacement history");

                history = results.GetNodeDisplacementHistory(series, int.Parse(id));
                if (history == null)
                    throw new WorkerCommandException("NO_RESULTS", $"No displacement history for node {id}");

                return new
                {
                    t = history.Time,
                    ux = history.Ux,
                    uy = history.Uy,
                    uz = history.Uz,
                    units = new { t = "sec", disp = "in" }
                };

            case "acceleration":
                if (string.IsNullOrEmpty(id))
                    throw new WorkerCommandException("INVALID_ARGS", "Node ID required for acceleration history");

                history = results.GetNodeAccelerationHistory(series, int.Parse(id));
                if (history == null)
                    throw new WorkerCommandException("NO_RESULTS", $"No acceleration history for node {id}");

                return new
                {
                    t = history.Time,
                    ax = history.Ax,
                    ay = history.Ay,
                    az = history.Az,
                    units = new { t = "sec", acc = "g" }
                };

            case "base_shear":
                history = results.GetBaseShearHistory(series);
                if (history == null)
                    throw new WorkerCommandException("NO_RESULTS", "No base shear history available");

                return new
                {
                    t = history.Time,
                    vx = history.Vx,
                    vy = history.Vy,
                    units = new { t = "sec", force = "kips" }
                };

            case "drift":
                history = results.GetDriftHistory(series);
                if (history == null)
                    throw new WorkerCommandException("NO_RESULTS", "No drift history available");

                return new
                {
                    t = history.Time,
                    maxDrift = history.MaxDrift,
                    story = history.CriticalStory,
                    units = new { t = "sec", drift = "%" }
                };

            default:
                throw new WorkerCommandException("INVALID_RESULT_TYPE", $"Unknown result type: {resultType}");
        }
    }
}