# Phase 1C — Portal Performance SQL Report

Read-only queries against `public.portal_performance_events`.

**PII rule / กฎ PII:** Never select `metadata->>'token'`, `line_user_id`, full `employee_id` lists, GPS, photo URLs, or raw error stack traces. Use only `event_name`, `route`, `error_code`, `duration_ms`, and aggregates. The interactive dashboard at `/attendance/portal-performance` already enforces this.

> Tip: paste these into Lovable Cloud → SQL Editor. All queries are SELECT-only.

---

## 1. Latency p50 / p75 / p95 — last 24h and 7d

```sql
WITH win AS (
  SELECT '24h'::text AS label, NOW() - INTERVAL '24 hours' AS since
  UNION ALL
  SELECT '7d', NOW() - INTERVAL '7 days'
)
SELECT
  win.label,
  e.event_name,
  COUNT(*) AS samples,
  ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY e.duration_ms))::int AS p50_ms,
  ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY e.duration_ms))::int AS p75_ms,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY e.duration_ms))::int AS p95_ms
FROM public.portal_performance_events e
JOIN win ON e.created_at >= win.since
WHERE e.event_name IN ('portal_ready','liff_init_done','token_validate_success')
  AND e.duration_ms IS NOT NULL
GROUP BY win.label, e.event_name
ORDER BY win.label, e.event_name;
```

**Targets / เกณฑ์:** `portal_ready` p95 < 2500 ms, `liff_init_done` p95 < 1500 ms, `token_validate_success` p95 < 800 ms.

---

## 2. `token_validate_failed` grouped by `error_code` (last 24h)

```sql
SELECT
  COALESCE(error_code, 'unknown') AS error_code,
  COUNT(*) AS failures
FROM public.portal_performance_events
WHERE event_name = 'token_validate_failed'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY failures DESC;
```

**Read:** spikes in `expired`, `not_found`, or `already_used` are expected. Spikes in `network`, `unknown`, or `server_error` need investigation.

---

## 3. `checkin_submit_failed` grouped by `error_code` (last 24h)

```sql
SELECT
  COALESCE(error_code, 'unknown') AS error_code,
  COUNT(*) AS failures
FROM public.portal_performance_events
WHERE event_name = 'checkin_submit_failed'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY failures DESC;
```

**Pilot exit:** total failures / (failures + `checkin_submit_success`) < 3 %.

---

## 4. Slowest 20 `portal_ready` events (last 24h)

```sql
SELECT
  id,
  route,
  duration_ms,
  created_at AT TIME ZONE 'Asia/Bangkok' AS bangkok_time
FROM public.portal_performance_events
WHERE event_name = 'portal_ready'
  AND created_at >= NOW() - INTERVAL '24 hours'
  AND duration_ms IS NOT NULL
ORDER BY duration_ms DESC
LIMIT 20;
```

> No `employee_id`, no `metadata`. Cross-reference `id` only inside the QA bug template.

---

## 5. Events grouped by `route` (last 7d)

```sql
SELECT
  COALESCE(route, '(unknown)') AS route,
  event_name,
  COUNT(*) AS samples,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_ms
FROM public.portal_performance_events
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND duration_ms IS NOT NULL
GROUP BY 1, 2
ORDER BY route, event_name;
```

---

## 6. Daily trend — Asia/Bangkok day buckets

```sql
SELECT
  date_trunc('day', created_at AT TIME ZONE 'Asia/Bangkok')::date AS day_bkk,
  event_name,
  COUNT(*) AS samples,
  ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms))::int AS p50_ms,
  ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95_ms
FROM public.portal_performance_events
WHERE created_at >= NOW() - INTERVAL '14 days'
  AND event_name IN ('portal_ready','liff_init_done','token_validate_success','checkin_submit_success')
  AND duration_ms IS NOT NULL
GROUP BY 1, 2
ORDER BY day_bkk DESC, event_name;
```

---

## 7. Health summary — single-row dashboard query

```sql
WITH last24 AS (
  SELECT * FROM public.portal_performance_events
  WHERE created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
  COUNT(*) FILTER (WHERE event_name = 'portal_ready')                       AS portal_loads,
  COUNT(*) FILTER (WHERE event_name = 'token_validate_failed')              AS token_fails,
  COUNT(*) FILTER (WHERE event_name = 'checkin_submit_success')             AS checkins_ok,
  COUNT(*) FILTER (WHERE event_name = 'checkin_submit_failed')              AS checkins_fail,
  ROUND(percentile_cont(0.95) WITHIN GROUP (
    ORDER BY duration_ms) FILTER (WHERE event_name = 'portal_ready'))::int  AS p95_portal_ready_ms,
  ROUND(percentile_cont(0.95) WITHIN GROUP (
    ORDER BY duration_ms) FILTER (WHERE event_name = 'liff_init_done'))::int AS p95_liff_init_ms
FROM last24;
```

---

## How to read / วิธีอ่านผล

- **EN:** Compare p95 against the targets in §1. If `token_validate_failed` is dominated by `expired` or `not_found` you are likely fine — those mean users are clicking old links. Investigate `server_error`, `network`, `unknown`.
- **TH:** ดูค่า p95 เทียบกับเกณฑ์ในข้อ 1 ถ้า `token_validate_failed` ส่วนใหญ่เป็น `expired` หรือ `not_found` ถือว่าปกติ (ผู้ใช้กดลิงก์เก่า) ถ้าเจอ `server_error` หรือ `unknown` ให้แจ้งทีม dev ทันที

## Pilot exit scorecard

| Metric | Target | Source query |
|---|---|---|
| `portal_ready` p95 | < 2500 ms | §1 |
| `liff_init_done` p95 | < 1500 ms | §1 |
| `token_validate_success` p95 | < 800 ms | §1 |
| Token validate failure rate (excl. expired/not_found) | < 1 % | §2 |
| Check-in submit failure rate | < 3 % | §3 + §7 |
