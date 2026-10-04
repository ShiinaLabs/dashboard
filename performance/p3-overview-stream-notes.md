# P3 Overview streaming measurement

Captured 2026-10-04 against the local production build with `MOCK_DATA=1`, authenticated mock session, and Chromium 153.0.8010.12. The production build and performance capture are local mock measurements; they are not production network measurements.

| Profile | RTT | Down / up | Cold application requests | GraphQL posts | HTML / JS / CSS | Total transferred | DCL | App shell | Overview ready |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Normal | 0 ms | unlimited | 0 | 0 | 164,895 / 838,717 / 97,607 B | 1,124,706 B | 55 ms | 77 ms | 77 ms |
| High latency | 300 ms | unlimited | 0 | 0 | 164,895 / 650,093 / 97,607 B | 912,595 B | 951 ms | 346 ms | 1,104 ms |
| Weak | 300 ms | 1,024 / 256 Kbps | 0 | 0 | 164,895 / 170,966 / 97,607 B | 433,468 B | 5,630 ms | 409 ms | 5,654 ms |

Timing values are observed samples, not CI thresholds. The weak profile shows that transferred code and its parse/load path dominate the time to hydrated `[data-overview-ready="true"]`; the SSR document already includes the resolved Overview content. The document response contained `data-app-shell`, `data-overview-ready`, and React's streamed-boundary completion script. Since the mock read model resolved before the first document chunk on this run, this capture proves the content is present in the server response but does not quantify time spent in the skeleton fallback.
