"""SSE keepalives and cancellation independent of model token delivery."""
import asyncio
from contextlib import aclosing
from collections.abc import AsyncIterator, Awaitable, Callable


async def interruptible_sse(
    source: AsyncIterator[str], stop: asyncio.Event,
    is_stopped: Callable[[], Awaitable[bool]] | None = None,
    *, heartbeat_seconds: float = 10, poll_seconds: float = 2,
) -> AsyncIterator[str]:
    async def watch_stop():
        while not stop.is_set():
            if is_stopped and await is_stopped():
                stop.set()
                return
            await asyncio.sleep(poll_seconds)

    # Comments keep proxies alive without creating assistant text or restarting clocks.
    yield ': connected\n\n'
    watcher = asyncio.create_task(watch_stop()) if is_stopped else None
    stop_wait = asyncio.create_task(stop.wait())
    next_frame = None
    try:
        async with aclosing(source):
            try:
                next_frame = asyncio.create_task(anext(source))
                while not stop.is_set():
                    pending = {next_frame, stop_wait}
                    if watcher:
                        pending.add(watcher)
                    ready, _ = await asyncio.wait(pending, timeout=heartbeat_seconds, return_when=asyncio.FIRST_COMPLETED)
                    if stop.is_set():
                        break
                    if watcher and watcher in ready:
                        watcher.result()  # Surface storage failures; never silently lose stop delivery.
                        break
                    if next_frame not in ready:
                        yield ': keepalive\n\n'
                        continue
                    try:
                        frame = next_frame.result()
                    except StopAsyncIteration:
                        break
                    yield frame
                    next_frame = asyncio.create_task(anext(source))
            finally:
                # Cancel the in-flight model read before closing its async generator.
                if next_frame and not next_frame.done():
                    next_frame.cancel()
                    await asyncio.gather(next_frame, return_exceptions=True)

    finally:
        tasks = [task for task in (next_frame, stop_wait, watcher) if task]
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
