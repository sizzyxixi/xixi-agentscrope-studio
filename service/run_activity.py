"""Measured per-turn execution time; approval waiting does not count."""
from dataclasses import dataclass, field
import time
import uuid

@dataclass
class RunClock:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    started_at: int = field(default_factory=lambda: int(time.time() * 1000))
    elapsed_ms: int = 0
    status: str = 'running'
    segment_at: int | None = field(default_factory=lambda: int(time.time() * 1000))
    segment_mono: float | None = field(default_factory=lambda: time.monotonic())
    ended_at: int | None = None
    message_ids: set[str] = field(default_factory=set)

    def snapshot(self):
        elapsed = self.elapsed_ms
        if self.segment_mono is not None:
            elapsed += max(0, round((time.monotonic() - self.segment_mono) * 1000))
        return {'id': self.id, 'startedAt': self.started_at, 'elapsedMs': elapsed,
                'sampledAt': int(time.time() * 1000), 'status': self.status,
                'endedAt': self.ended_at}

    def settle(self, status):
        if self.segment_mono is not None:
            self.elapsed_ms = self.snapshot()['elapsedMs']
        self.segment_at = self.segment_mono = None
        self.status = status
        if status != 'requires-action':
            self.ended_at = int(time.time() * 1000)

    def resume(self):
        self.status = 'running'
        self.segment_at = int(time.time() * 1000)
        self.segment_mono = time.monotonic()
        self.ended_at = None
