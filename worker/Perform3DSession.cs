using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace Perform3D.Worker;

public sealed class Perform3DSession : IDisposable
{
    private dynamic? _app;
    private dynamic? _model;
    private readonly object _lock = new();
    private bool _disposed;

    public bool IsConnected => _app != null;
    public bool IsModelOpen => _model != null;

    public void Connect()
    {
        lock (_lock)
        {
            if (_app != null)
                throw new WorkerCommandException("ALREADY_CONNECTED", "Already connected to Perform3D");

            try
            {
                var type = Type.GetTypeFromProgID("Perform3Dv1.Application");
                if (type == null)
                    throw new WorkerCommandException("P3D_NOT_INSTALLED", "Perform3D COM server not registered");

                _app = Activator.CreateInstance(type);
                if (_app == null)
                    throw new WorkerCommandException("P3D_CREATE_FAILED", "Failed to create Perform3D instance");

                _app.Visible = false;
            }
            catch (COMException ex)
            {
                throw new WorkerCommandException("COM_ERROR", $"COM error: {ex.Message}");
            }
        }
    }

    public void Disconnect()
    {
        lock (_lock)
        {
            if (_model != null)
            {
                Marshal.ReleaseComObject(_model);
                _model = null;
            }

            if (_app != null)
            {
                try
                {
                    _app.Quit();
                }
                catch { }
                finally
                {
                    Marshal.ReleaseComObject(_app);
                    _app = null;
                }
            }
        }
    }

    public string GetVersion()
    {
        EnsureConnected();
        return _app.Version ?? "Unknown";
    }

    public void OpenModel(string path)
    {
        EnsureConnected();

        if (_model != null)
            CloseModel();

        int result = _app.OpenModel(path);
        CheckResult(result, "Failed to open model");

        _model = _app.ActiveModel;
        if (_model == null)
            throw new WorkerCommandException("MODEL_NOT_LOADED", "Model opened but not accessible");
    }

    public void NewFromTemplate(string templatePath, string newPath)
    {
        EnsureConnected();

        if (_model != null)
            CloseModel();

        int result = _app.NewFromTemplate(templatePath, newPath);
        CheckResult(result, "Failed to create model from template");

        _model = _app.ActiveModel;
        if (_model == null)
            throw new WorkerCommandException("MODEL_NOT_LOADED", "Model created but not accessible");
    }

    public void SaveModel()
    {
        EnsureModelOpen();
        int result = _model.Save();
        CheckResult(result, "Failed to save model");
    }

    public void SaveModelAs(string path)
    {
        EnsureModelOpen();
        int result = _model.SaveAs(path);
        CheckResult(result, "Failed to save model as");
    }

    public void CloseModel()
    {
        if (_model != null)
        {
            try
            {
                _model.Close();
            }
            finally
            {
                Marshal.ReleaseComObject(_model);
                _model = null;
            }
        }
    }

    public dynamic GetModel()
    {
        EnsureModelOpen();
        return _model!;
    }

    public dynamic GetApp()
    {
        EnsureConnected();
        return _app!;
    }

    private void EnsureConnected()
    {
        if (_app == null)
            throw new WorkerCommandException("NOT_CONNECTED", "Not connected to Perform3D");
    }

    private void EnsureModelOpen()
    {
        EnsureConnected();
        if (_model == null)
            throw new WorkerCommandException("NO_MODEL", "No model is open");
    }

    private static void CheckResult(int result, string errorMessage)
    {
        if (result != 0)
        {
            var code = result switch
            {
                -1 => "INVALID_PATH",
                -2 => "FILE_NOT_FOUND",
                -3 => "ACCESS_DENIED",
                -4 => "INVALID_MODEL",
                -5 => "VERSION_MISMATCH",
                _ => "API_ERROR"
            };
            throw new WorkerCommandException(code, $"{errorMessage} (code: {result})");
        }
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            Disconnect();
            _disposed = true;
        }
    }
}