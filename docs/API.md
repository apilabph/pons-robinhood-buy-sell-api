# Legacy local inspector API

Local development base URL: `http://127.0.0.1:8788`. All amounts/block numbers that may exceed JavaScript's safe integer range are strings. This page documents the retained loopback inspector. The new public Worker uses /api routes; see ../openapi.json and README.md for those endpoints and settlement setup status.

| Method and path | Request | Result |
| --- | --- | --- |
| `GET /health` | None | Process liveness, not RPC readiness |
| `GET /v1/capabilities` | None | Version, chain 4663, implemented and disabled capabilities |
| `POST /v1/market` | JSON object with only `token` | Factory registration, stage and snapshot; V1 WETH pool identity checks or V2 curve identity checks |

Addresses must be nonzero EVM addresses with valid mixed-case checksums or lowercase spelling. JSON bodies are limited to 4096 bytes. Other fields, including signing material and RPC URLs, are rejected. Four concurrent inspections are allowed; the fifth returns 429. This local limit is not a public service quota.

V1 `poolFeeUnits` uses a denominator of 1,000,000: `10000` means 1%. It is not our planned 25-bps service charge. V2 `quoteAsset` may be the zero address for native ETH or an ERC20 address; `quoteAssetWithinPlannedScope` does not mean a trade route has been implemented. The inspector does not quote or calculate total taxes.

`snapshot.number`, `snapshot.hash` and `snapshot.timestamp` identify the observed block. All contract reads use its explicit number. A final header read checks that the block did not change; snapshots older than 120 seconds or more than 30 seconds in the future are rejected. These checks trust the configured RPC and do not independently prove blockchain consensus or source/bytecode equivalence. Codehash pins record an observed deployment, not an audit certificate.

Errors have shape `{"error":{"code":"UNKNOWN_TOKEN","message":"..."}}`:

| HTTP | Example codes | Action |
| --- | --- | --- |
| 400 | `INVALID_TOKEN`, `INVALID_JSON`, `INVALID_REQUEST` | Fix the input; never supply wallet secrets |
| 404 | `UNKNOWN_TOKEN`, `NOT_FOUND` | Token/endpoint not supported by this inspector |
| 413 / 415 | `BODY_TOO_LARGE`, `CONTENT_TYPE` | Send a small JSON request |
| 422 | `UNSUPPORTED_PAIR` | V1 inspection currently handles WETH pairs |
| 429 | `BUSY` | Retry later with backoff |
| 502 | `WRONG_CHAIN`, `CONTRACT_CHANGED`, `POOL_MISMATCH`, `CURVE_MISMATCH`, `UNKNOWN_PHASE`, `INCONSISTENT_STAGE` | Stop and investigate configuration/protocol changes |
| 502 | `STALE_BLOCK`, `SNAPSHOT_CHANGED`, `RPC_TIMEOUT`, `RPC_UNAVAILABLE` | Retry the read with bounded backoff; never treat a failed read as permission to trade |
| 500 | `INTERNAL_ERROR` | Unexpected application failure; no provider secrets are returned |

The server binds only to loopback. Authentication, global rate limiting, production load testing and persistent infrastructure are not implemented. Do not expose this prototype directly to the Internet.
