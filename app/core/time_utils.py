from datetime import UTC, datetime
from zoneinfo import ZoneInfo
import zoneinfo


def get_current_time() -> datetime:
    return datetime.now(UTC)


def get_system_datetime_context(tz_name: str | None = None) -> str:
    """Return a formatted string representing the current system date, time, weekday, and timezone."""
    now: datetime
    if tz_name:
        try:
            now = datetime.now(ZoneInfo(tz_name))
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            now = datetime.now().astimezone()
    else:
        now = datetime.now().astimezone()

    tz_str = now.strftime("%Z (%z)").strip()
    day_of_week = now.strftime("%A")
    date_str = now.strftime("%B %d, %Y")
    time_str = now.strftime("%H:%M:%S")

    return (
        f"Current system date and time:\n"
        f"- Date: {date_str}\n"
        f"- Day of the week: {day_of_week}\n"
        f"- Time: {time_str}\n"
        f"- Timezone: {tz_str}"
    )



def get_system_datetime_context(tz_name: str | None = None) -> str:
    """Return a formatted string representing the current system date, time, weekday, and timezone."""
    now: datetime
    if tz_name:
        try:
            now = datetime.now(ZoneInfo(tz_name))
        except (zoneinfo.ZoneInfoNotFoundError, ValueError):
            now = datetime.now().astimezone()
    else:
        now = datetime.now().astimezone()

    tz_str = now.strftime("%Z (%z)").strip()
    day_of_week = now.strftime("%A")
    date_str = now.strftime("%B %d, %Y")
    time_str = now.strftime("%H:%M:%S")

    return (
        f"Current system date and time:\n"
        f"- Date: {date_str}\n"
        f"- Day of the week: {day_of_week}\n"
        f"- Time: {time_str}\n"
        f"- Timezone: {tz_str}"
    )