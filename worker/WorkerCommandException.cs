using System;

namespace Perform3D.Worker;

public class WorkerCommandException : Exception
{
    public string Code { get; }

    public WorkerCommandException(string code, string message) : base(message)
    {
        Code = code;
    }
}