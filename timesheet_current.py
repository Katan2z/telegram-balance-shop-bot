CURRENT_PERIOD = "current"


def build_rows(rows, now_func):
    out = []
    for row in rows:
        out.append({
            "employee_profile_id": row["profile_id"],
            "period": CURRENT_PERIOD,
            "hours": row["hours"],
            "updated_at": now_func(),
        })
    return out
