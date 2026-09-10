var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/healthz", () => Results.StatusCode(500)); // TEMPORARY: A10a negative control - see docs/definition-of-done.md

app.Run();

public partial class Program
{
}
