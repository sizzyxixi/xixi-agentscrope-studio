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
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 24:
            raise ValueError('间隔需为 1–24 的整数小时。')
        if config.get('interval_unit', 'hours') != 'hours':
            raise ValueError('间隔单位无效。')
        result.update(interval_value=count, interval_unit='hours', weekdays=list(range(7)))
    if frequency in {'weekly', 'biweekly'}:
        days = config.get('weekdays', list(range(7)) if frequency == 'interval' else [first.astimezone(zone).weekday()])
        if not isinstance(days, list) or not days or any(type(day) is not int or day not in range(7) for day in days):
            raise ValueError('请至少选择一个星期。')
        result['weekdays'] = sorted(set(days))
    clock = config.get('time', first.astimezone(zone).strftime('%H:%M'))
    try:
        datetime.strptime(clock, '%H:%M')
    except (ValueError, TypeError):
        raise ValueError('请选择有效的执行时间。') from None
    result['time'] = clock
    if frequency == 'monthly':
        days = config.get('month_days', [config.get('month_day', first.astimezone(zone).day)])
        if not isinstance(days, list) or not days or any(type(day) is not int or not 1 <= day <= 31 for day in days):
            raise ValueError('请至少选择一个有效日期（1–31日）。')
        result['month_days'] = sorted(set(days))
        # Retain the legacy field for clients that still read a single date.
        result['month_day'] = result['month_days'][0]
    if frequency == 'yearly':
        day = config.get('month_day', first.astimezone(zone).day)
        month = config.get('month', first.astimezone(zone).month)
        if type(day) is not int or not 1 <= day <= 31 or type(month) is not int or not 1 <= month <= 12:
            raise ValueError('请选择有效的月份和日期。')
        try:
            datetime(2000, month, day)
        except ValueError:
            raise ValueError('该月份不存在所选日期。') from None
        result.update(month_day=day, month=month)
    if config.get('end_at'):
        end_at = parse_time(config['end_at']).astimezone(timezone.utc)
        if end_at < first.astimezone(timezone.utc):
            raise ValueError('截止时间不能早于开始时间。')
        result['end_at'] = end_at.isoformat()
        result['end_date'] = end_at.astimezone(zone).date().isoformat()
    elif config.get('end_date'):
        try:
            end = datetime.strptime(config['end_date'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            raise ValueError('有效期日期无效。') from None
        if end < first.astimezone(zone).date():
            raise ValueError('有效期不能早于首次执行日期。')
        result['end_at'] = datetime.combine(end, datetime.max.time(), tzinfo=zone).astimezone(timezone.utc).isoformat()
    else:
        result['end_date'] = ''
        result['end_at'] = ''
    return result


def within_validity(config, when):
    if config.get('end_at'):
        return when.astimezone(timezone.utc) <= parse_time(config['end_at'])
    return not config.get('end_date') or when.astimezone(ZoneInfo(config.get('timezone', 'Asia/Shanghai'))).date().isoformat() <= config['end_date']


def schedule_status(item, now=None):
    config = item['config']
    now = now or datetime.now(timezone.utc)
    if config.get('ended') or not within_validity(config, now):
        return 'ended'
    # Legacy single runs were disabled by the scheduler without a completion flag.
    if not item['enabled'] and config.get('frequency') == 'once' and parse_time(config['next_run']) <= now:
        return 'ended'
    return 'active' if item['enabled'] else 'paused'


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
        # Retain the interval's original anchor; excluded weekdays skip ticks,
        # rather than restarting the interval at midnight.
        for _ in range(4096):
            if not within_validity(config, candidate):
                return None
            if frequency == 'hourly' or candidate.astimezone(zone).weekday() in config.get('weekdays', range(7)):
                return candidate
            try:
                local = candidate.astimezone(zone)
                tomorrow = datetime.combine(local.date() + timedelta(days=1), datetime.min.time(), tzinfo=zone).astimezone(timezone.utc)
                ticks = max(1, -(-(tomorrow - candidate) // delta))
                candidate += delta * ticks
            except (OverflowError, ValueError):
                return None
        return None
    start = max(anchor.date(), floor.astimezone(zone).date())
    for offset in range(366 * 12):
        try:
            day = start + timedelta(days=offset)
        except OverflowError:
            return None
        if config.get('end_date') and day.isoformat() > config['end_date']:
            return None
        if frequency in {'weekly', 'biweekly'}:
            weeks = ((day - timedelta(days=day.weekday())) - (anchor.date() - timedelta(days=anchor.weekday()))).days // 7
            if day.weekday() not in config.get('weekdays', [anchor.weekday()]) or (frequency == 'biweekly' and weeks % 2):
                continue
        if frequency == 'monthly' and day.day not in config.get('month_days', [config.get('month_day', anchor.day)]):
            continue
        if frequency == 'yearly' and (day.month, day.day) != (config.get('month', anchor.month), config.get('month_day', anchor.day)):
            continue
        clock = datetime.strptime(config.get('time', anchor.strftime('%H:%M')), '%H:%M').time()
        local = datetime.combine(day, clock, tzinfo=zone)
        candidate = local.astimezone(timezone.utc)
        if candidate.astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
            continue
        if candidate >= floor and local >= anchor and within_validity(config, candidate):
            return candidate
    return None
