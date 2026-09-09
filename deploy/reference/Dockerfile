# Reference Dockerfile for the Gateway host. See README.md in this
# directory for what this is and, just as importantly, what it isn't.
#
# Build from the REPO ROOT (not this directory), because Gateway.Host has
# project references to Gateway.Core and packs/itsm that live outside this
# folder:
#   docker build -f deploy/reference/Dockerfile -t nowcompanion-gateway .
#
# NOT verified by actually running `docker build` (no Docker in the
# environment this was written in) - only `dotnet build`/`dotnet publish`
# were verified locally. Treat this as unverified until someone with
# Docker runs it once.

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY global.json Directory.Build.props Directory.Packages.props ./
COPY gateway/Gateway.Core/Gateway.Core.csproj gateway/Gateway.Core/
COPY gateway/packs/itsm/Gateway.Packs.Itsm.csproj gateway/packs/itsm/
COPY gateway/Gateway.Host/Gateway.Host.csproj gateway/Gateway.Host/
RUN dotnet restore gateway/Gateway.Host/Gateway.Host.csproj

COPY gateway/Gateway.Core/ gateway/Gateway.Core/
COPY gateway/packs/itsm/ gateway/packs/itsm/
COPY gateway/Gateway.Host/ gateway/Gateway.Host/
RUN dotnet publish gateway/Gateway.Host/Gateway.Host.csproj \
    -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Gateway.Host.dll"]
