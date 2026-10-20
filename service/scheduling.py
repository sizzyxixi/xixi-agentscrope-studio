"""Timezone-aware calendar recurrence shared by validation and the scheduler."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

FREQUENCIES = {'once', 'hourly', 'interval', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'}


def parse_time(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError()
        return result
    except (ValueError, TypeError, AttributeError):
        raise ValueError('请选择带有时区的首次运行时间。') from None


def normalize_schedule(config):
    frequency = config.get('frequency', 'daily')
    if frequency not in FREQUENCIES:
        raise ValueError('请选择有效的重复频率。')
    try:
        zone = ZoneInfo(config.get('timezone', 'Asia/Shanghai'))
    except (ZoneInfoNotFoundError, TypeError):
        raise ValueError('任务时区无效。') from None
    first = parse_time(config.get('start_at') or config.get('next_run', ''))
    due = parse_time(config.get('next_run', ''))
    result = dict(config, frequency=frequency, timezone=zone.key,
                  start_at=first.astimezone(timezone.utc).isoformat(),
                  next_run=due.astimezone(timezone.utc).isoformat())
    if frequency == 'interval':
        count = config.get('interval_value', 1)
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 10000:
            raise ValueError('间隔需为 1–10000 的整数。')
        if config.get('interval_unit', 'hours') not in {'minutes', 'hours', 'days'}:
            raise ValueError('间隔单位无效。')
        result.update(interval_value=count, interval_unit=config.get('interval_unit', 'hours'))
    if frequency in {'weekly', 'biweekly'}:
        days = config.get('weekdays', [first.astimezone(zone).weekday()])
        if not isinstance(days, list) or not days or any(type(day) is not int or day not in range(7) for day in days):
            raise ValueError('请至少选择一个星期。')
        result['weekdays'] = sorted(set(days))
    if config.get('end_date'):
        try:
            end = datetime.strptime(config['end_date'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            raise ValueError('有效期日期无效。') from None
        if end < first.astimezone(zone).date():
            raise ValueError('有效期不能早于首次执行日期。')
    else:
        result['end_date'] = ''
    return result


def within_validity(config, when):
    return not config.get('end_date') or when.astimezone(ZoneInfo(config.get('timezone', 'Asia/Shanghai'))).date().isoformat() <= config['end_date']


def next_occurrence(config, after, inclusive=False):
    """Return the next valid occurrence; skip nonexistent calendar dates and DST gaps."""
    zone = ZoneInfo(config.get('timezone', 'Asia/Shanghai'))
    anchor = parse_time(config.get('start_at') or config['next_run']).astimezone(zone)
    floor = after.astimezone(timezone.utc)
    if not inclusive:
        floor += timedelta(microseconds=1)
    frequency = config['frequency']
    if frequency == 'once':
        candidate = anchor.astimezone(timezone.utc)
        return candidate if candidate >= floor and within_validity(config, candidate) else None
    if frequency in {'hourly', 'interval'}:
        delta = timedelta(hours=1) if frequency == 'hourly' else timedelta(**{config['interval_unit']: config['interval_value']})
        origin = anchor.astimezone(timezone.utc)
        count = max(0, (floor - origin) // delta)
        candidate = origin + delta * count
        if candidate < floor:
            candidate += delta
        return candidate if within_validity(config, candidate) else None
    start = max(anchor.date(), floor.astimezone(zone).date())
    for offset in range(366 * 12):
        day = start + timedelta(days=offset)
        if config.get('end_date') and day.isoformat() > config['end_date']:
            return None
        if frequency in {'weekly', 'biweekly'}:
            weeks = ((day - timedelta(days=day.weekday())) - (anchor.date() - timedelta(days=anchor.weekday()))).days // 7
            if day.weekday() not in config.get('weekdays', [anchor.weekday()]) or (frequency == 'biweekly' and weeks % 2):
                continue
        if frequency == 'monthly' and day.day != anchor.day:
            continue
        if frequency == 'yearly' and (day.month, day.day) != (anchor.month, anchor.day):
            continue
        local = datetime.combine(day, anchor.timetz(), tzinfo=zone)
        candidate = local.astimezone(timezone.utc)
        if candidate.astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
            continue
        if candidate >= floor and local >= anchor:
            return candidate
    return None
