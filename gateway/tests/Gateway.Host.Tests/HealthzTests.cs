using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Gateway.Host.Tests;

public class HealthzTests
{
    [Fact]
    public async Task Healthz_Returns_Ok()
    {
        await using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/healthz");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
