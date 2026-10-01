# Sanitized Pipedream v48 inspection record

Inspected in the authenticated Pipedream UI on September 30, 2026. This is a
human-readable reconstruction of the observed configuration, **not a native
workflow export**. Saved execution results were inspected; no new event was sent.
No connected credentials, spreadsheet identifier or private recipient is stored
here. Those values must be provided as deployment secrets.

Workflow: `updates about kayak - 4/4/2026, 5:21 PM`, project `kayakupdates`, v48.

1. HTTP webhook trigger: full request, return 200, no authentication.
2. Google Sheets **Add Single Row**: existing `kayak usage` spreadsheet,
   `Sheet1`, headers enabled. The saved test wrote A16:N16.
3. Pipedream **Send Yourself an Email**: subject
   `kayak played by IP {{steps.trigger.event.client_ip}}`; plain-text body
   `kayak played by IP {{steps.trigger.event.client_ip}} check out the google sheet`.

No additional code or filter step was observed.

| Column | Original value | Replacement |
|---|---|---|
| ip | trigger.client_ip | CF-Connecting-IP |
| timestamp | body.ts | body.ts |
| event | body.event | body.event |
| level | body.level | body.level |
| levelName | body.levelName | body.levelName |
| score | body.score | body.score |
| version | body.v | body.v |
| deviceType | body.deviceType | body.deviceType |
| screen | body.screen | body.screen |
| lang | body.lang | body.lang |
| tz | **body.platform (bug)** | **body.tz** |
| platform | body.platform | body.platform |
| ua | body.ua | body.ua |
| referrer | body.referrer | body.referrer |

Workflows retirement is March 31, 2027. Native export and private credential
migration remain deployment prerequisites; existing rows are preserved.
