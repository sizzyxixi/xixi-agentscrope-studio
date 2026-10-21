"""Exercise slow models and worker-independent stop delivery without real model calls."""
import asyncio
import tempfile
import unittest
from contextlib import aclosing
from pathlib import Path
from service.streaming import interruptible_sse
from service.store import StudioStore


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_heartbeats_while_model_waits_do_not_restart_the_source(self):
        started, closed = 0, asyncio.Event()
        stop = asyncio.Event()
        async def source():
            nonlocal started
            started += 1
            try:
                await asyncio.sleep(60)
                yield 'late answer'
            finally:
                closed.set()
        async with aclosing(interruptible_sse(source(), stop, heartbeat_seconds=.01)) as stream:
            self.assertEqual(await anext(stream), ': connected\n\n')
            self.assertEqual(await anext(stream), ': keepalive\n\n')
            self.assertEqual(await anext(stream), ': keepalive\n\n')
            stop.set()
            with self.assertRaises(StopAsyncIteration):
                await asyncio.wait_for(anext(stream), .5)
        self.assertTrue(closed.is_set())
        self.assertEqual(started, 1)

    async def test_disconnect_closes_in_flight_model_read(self):
        closed = asyncio.Event()
        async def source():
            try:
                yield 'first'
                await asyncio.sleep(60)
            finally:
                closed.set()
        stream = interruptible_sse(source(), asyncio.Event(), heartbeat_seconds=60)
        await anext(stream)
        self.assertEqual(await anext(stream), 'first')
        pending = asyncio.create_task(anext(stream))
        await asyncio.sleep(.01)
        pending.cancel()
        await asyncio.gather(pending, return_exceptions=True)
        await stream.aclose()
        self.assertTrue(closed.is_set())

    async def test_sdk_that_swallows_cancellation_cannot_publish_late_answer(self):
        stop = asyncio.Event()
        async def source():
            yield 'first'
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                yield 'late answer after stop'
        async with aclosing(interruptible_sse(source(), stop)) as stream:
            await anext(stream)
            self.assertEqual(await anext(stream), 'first')
            pending = asyncio.create_task(anext(stream))
            await asyncio.sleep(.01)
            stop.set()
            with self.assertRaises(StopAsyncIteration):
                await asyncio.wait_for(pending, .5)

    async def test_stop_from_another_worker_is_durable_and_scoped_to_request(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.db'
            first, second = StudioStore(path,Path(folder)), StudioStore(path,Path(folder))
            first.ensure_session('chat','owner')
            stop=asyncio.Event()
            closed=asyncio.Event()
            async def source():
                try:
                    yield 'first'
                    await asyncio.sleep(60)
                finally:
                    closed.set()
            async def check():
                return first.stream_stop_requested('chat','current')
            try:
                second.request_stream_stop('chat','previous')
                async with aclosing(interruptible_sse(source(),stop,check,poll_seconds=.01)) as stream:
                    await anext(stream)
                    self.assertEqual(await anext(stream),'first')
                    second.request_stream_stop('chat','current')
                    with self.assertRaises(StopAsyncIteration):
                        await asyncio.wait_for(anext(stream), .5)
                self.assertTrue(closed.is_set())
                self.assertFalse(first.stream_stop_requested('other-chat','current'))
                self.assertFalse(first.stream_stop_requested('chat','next'))
            finally:
                first._conn.close();second._conn.close()
