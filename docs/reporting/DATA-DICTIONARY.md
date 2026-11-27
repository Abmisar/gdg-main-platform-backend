# Reporting data dictionary

All days use Asia/Riyadh. Facts use disjoint groups with at least five distinct people per published row. Multiple awards or messages for one person count once toward the threshold. A missing group means unknown or suppressed. Published sums and rates describe visible cohorts only. Saved imports preserve a point in time and need refreshing after erasure.

| View | Grain and columns | Freshness |
|---|---|---|
| dim_date | One Gregorian `day` (date key). `gregorian_year` is the civil year. `hijri` is an Umm al-Qura calendar display label. `semester` is academic starting year plus term number. | Calendar extended at 02:00 through two years ahead, beginning in 2000 |
| dim_committee | One committee. `committee_id` is its key, `committee_code` its registry abbreviation, `committee_name` its organizational label and `parent_committee_id` the parent key (blank for roots). | Live |
| dim_event | One published, completed or cancelled event. `event_id` is the key and `committee_id` identifies the organizer. `name`, `event_type` and `location` are owner-reviewed catalog labels, blank until approved or after a label changes. `start_day` and `end_day` are local dates, `capacity` is the seat limit and `status` is the event lifecycle state. | Live |
| dim_member_pseudo | One retained member in a publishable cohort. `pseudo_id` is an HMAC-SHA256 identifier. `join_semester` comes from join date and may be unknown. `role_group` groups active global assignments versus ordinary members. Suppression uses the full semester/role combination. | New keys nightly at 02:00, source deletions and cohort visibility live |
| dim_application_status | One application `status` code (PENDING, APPROVED or REJECTED). | Live |
| fact_applications | One submission `day` and current overall `status`. `applications` counts requests. | Live |
| fact_decisions | One `day`, `committee_id` (blank for global roles) and current option `decision`. Day is decision date or, while pending, submission date. `decisions` counts requested options. An application can request multiple options. | Live |
| fact_registrations | One `event_id`, current registration `status` and combination of `offered` (approval timestamp present), `confirmed` (confirmation timestamp present) and `attended` (check-in timestamp present). `registrations` counts people registered for that event. WAITLISTED measures the current queue. | Live |
| fact_attendance | Checked-in subset of the same published registration cells. `event_id`, `status`, `offered` and `confirmed` have the definitions above. `check_ins` counts checked-in registrations. | Live |
| fact_points | One `committee_id` (blank for global awards), award `day` and signed award size `points_delta`. `awards` counts ledger entries of that size. | Live |
| fact_membership_changes | One observed `day`, `committee_id` and `movement` (joined, left, switch in or switch out). `members` counts changed assignments. A net addition and removal for the same member between observations counts as a switch on each affected side. | Daily 02:00 observations, rolling one year |
| fact_retention | One source `semester`, consecutive `next_semester` and Boolean `retained`. `members` counts source roster members by presence on the next roster. Both terms need observations. | Daily 02:00, latest observed active roster per term, academic starting years from current civil year minus two |
| fact_email_delivery | One creation `day`, registration email `kind` and latest delivery `state`. `deliveries` counts logical outbox rows. Retries update the same row. | Live |

The reporting calendar assumes August–December is term 1 and January–July is term 2. The Lead should confirm these boundaries before official semester comparisons. The first roster run establishes a baseline. Membership changes between observations can cancel out. Missed nights lengthen the observation interval. Erased members disappear from retained cohorts through foreign-key cascades, so historical figures can change.

College and level have no approved structured source. Branch, major and gender are encrypted. The model has no applicant answers, contact fields, reviewer identities or per-person activity trail. The member dimension supports independent headcounts. Aggregate facts have no member-level relationship. Event retention rollups are excluded to avoid publishing a second total from which hidden cells could be inferred.
