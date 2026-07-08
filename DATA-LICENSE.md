# Data License

The **source code** of the Chronas API is licensed under the [MIT License](LICENSE).

The **historical data** served by this API is licensed under the
**[Creative Commons Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)**.

## What "data" means here

This includes, but is not limited to:

- Province and area geometry — e.g. `GET /v1/metadata?type=g&f=provinces`
- Per-year political/cultural data (ruler, culture, religion, capital, population,
  and related entity metadata) — e.g. `GET /v1/areas/{year}`, `GET /v1/metadata/...`
- Markers and other historical records exposed via the public API

## Why CC BY-SA 4.0

Chronas data is substantially derived from **Wikipedia / Wikimedia** and other
community sources published under CC BY-SA. As a derivative work, this data
inherits the **attribution** and **share-alike** obligations of those sources.
CC BY-SA 4.0 is the same license Wikipedia itself uses, so it keeps the data
chain compatible.

## What you can do

You are free to:

- **Share** — copy and redistribute the data in any medium or format
- **Adapt** — remix, transform, and build upon the data for any purpose,
  including commercially

Under the following terms:

- **Attribution** — You must give appropriate credit to **Chronas**
  (https://chronas.org), provide a link to this license, and indicate if
  changes were made.
- **ShareAlike** — If you remix, transform, or build upon the data, you must
  distribute your contributions under CC BY-SA 4.0 (or a compatible license).
- **Underlying sources** — Where the data derives from Wikipedia or other
  sources, please also honor those sources' attribution requirements.

## Using the API

You may either cache a local copy of the data or call the public API directly.
If you call the API directly, please be considerate of rate limits (the API is
throttled) and cache responses where possible. For heavy or automated use, a
locally cached copy is strongly preferred.

## Attribution example

> Historical data © [Chronas](https://chronas.org), licensed under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
> Derived in part from Wikipedia (CC BY-SA).

## Questions

Open an issue at https://github.com/Chronasorg/chronas-api/issues or reach out
via https://chronas.org.
