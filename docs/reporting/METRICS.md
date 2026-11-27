# Committee measures

Use Import mode. Load each query under its view name. Create single-direction, one-to-many relationships from committee ID to event, points, decisions and changes; event ID to registrations and attendance; application status to applications; date day to each daily fact and event start day. Use separate role-playing date tables or inactive relationships for event end day. Keep retention and member cohorts separate. Apply event status = completed for attendance, conversion and no-show comparisons. Format ratios as percentages. Blanks include suppressed populations. Add “visible cohorts only” to report titles.

Create each expression as a separate Power BI measure.

```dax
Registrations = SUM(fact_registrations[registrations])
Check-ins = CALCULATE([Registrations], fact_registrations[attended] = TRUE())
Confirmed seats = CALCULATE([Registrations], fact_registrations[confirmed] = TRUE())
Attendance rate = DIVIDE(CALCULATE([Registrations], fact_registrations[confirmed] = TRUE(), fact_registrations[attended] = TRUE()), [Confirmed seats])
No-show rate = DIVIDE(CALCULATE([Registrations], fact_registrations[confirmed] = TRUE(), fact_registrations[status] = "NO_CHECK_IN"), [Confirmed seats])
Registration conversion = DIVIDE([Check-ins], [Registrations])
Committee activity = DISTINCTCOUNT(dim_event[event_id])
Semester retention =
VAR Outcomes = CALCULATE(DISTINCTCOUNT(fact_retention[retained]), REMOVEFILTERS(fact_retention[retained]))
VAR Cohort = CALCULATE(SUM(fact_retention[members]), REMOVEFILTERS(fact_retention[retained]))
RETURN IF(HASONEVALUE(fact_retention[semester]) && Outcomes = 2, DIVIDE(CALCULATE(SUM(fact_retention[members]), fact_retention[retained] = TRUE()), Cohort))
Award count = SUM(fact_points[awards])
Net points = SUMX(fact_points, fact_points[points_delta] * fact_points[awards])
Applications = SUM(fact_applications[applications])
Decided applications = CALCULATE([Applications], fact_applications[status] IN {"APPROVED", "REJECTED"})
Approved applications = CALCULATE([Applications], fact_applications[status] = "APPROVED")
Approval among decided = DIVIDE([Approved applications], [Decided applications])
Offers = CALCULATE([Registrations], fact_registrations[offered] = TRUE())
Waitlisted now = CALCULATE([Registrations], fact_registrations[status] = "WAITLISTED")
```

Attendance uses confirmed seats with a recorded check-in. No-shows use the explicit NO_CHECK_IN classification among confirmed seats. Excuses and cancellations can make these percentages add to less than 100%. Conversion includes all visible registration states. For retention, display the source and comparison terms and flag an in-progress comparison term. A suppressed outcome makes the displayed ratio incomplete. Publish a retention rate only when both outcome groups are visible. The points distribution is a histogram of award sizes weighted by award count. Application funnel stages are submitted, decided and approved among retained submissions grouped by submission date. Option decisions belong on a separate chart.

## Starter report

1. Event overview: completed events by committee and semester, seat limits, registrations, offers, confirmations and check-ins. Add attendance and no-show cards with denominators.
2. Membership: semester cohorts, observed committee movements and retention. Show switch-ins or switch-outs separately to avoid counting a transfer twice.
3. Recruitment and operations: application funnel, decision outcomes, points histogram and delivery-state counts. Show report refresh time and the suppression rule on every page.
