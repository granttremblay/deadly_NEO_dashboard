# Deadly NEO Dashboard

An animated, Earth-centered dashboard for known near-Earth objects at least 0.5 km across using NASA/JPL Small-Body Database orbit elements.

## Data

The data snapshot is generated from the NASA/JPL SBDB Query API:

- Near-Earth asteroids are included when `diameter >= 0.5 km`, or when no measured diameter is listed and `H <= 19.255`.
- Near-Earth comets are included when `diameter >= 0.5 km`.
- `H <= 19.255` is derived from the CNEOS convention that a 1 km spherical NEA corresponds to absolute magnitude 17.75 when assuming a mean albedo of 14%.

This is a visualization of osculating two-body orbits, not an impact prediction system. MOID values come from SBDB and are useful context, but an actual impact assessment requires full numerical propagation and uncertainty analysis.

## Run

```bash
npm run fetch:data
npm run serve
```

Then open [http://localhost:5173](http://localhost:5173).

## GitHub Pages

This repository is ready to deploy as a static GitHub Pages site. The included GitHub Actions workflow publishes the repository root whenever `main` is pushed.

For the repository settings, set **Pages** to deploy from **GitHub Actions**. The site will be available at:

```text
https://granttremblay.github.io/deadly_NEO_dashboard/
```

## Sources

- NASA/JPL SBDB Query API: https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html
- NASA/JPL SBDB filter parameters: https://ssd-api.jpl.nasa.gov/doc/sbdb_filter.html
- NASA/JPL CNEOS discovery statistics and sizing convention: https://cneos.jpl.nasa.gov/stats/
