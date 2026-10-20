"""Isolated official SDK receiver. NDJSON over pipes; no secrets in argv or logs.

Callbacks wait for the parent to persist an event before acknowledging it.
Each SDK owns its process/event loop, avoiding lark-oapi's module-global loop.
"""
from __future__ import annotations
import asyncio
import json
import logging
import sys
import threading
import time
import uuid


def normalize_dingtalk(raw):
    sender = str(raw.get('senderStaffId') or raw.get('senderId') or '')
    return {'event_id': raw.get('msgId', ''), 'sender_id': sender,
            'tenant_id': raw.get('senderCorpId') or raw.get('chatbotCorpId') or '',
            'chat_id': raw.get('conversationId') or sender, 'group': str(raw.get('conversationType')) == '2',
            'mentioned': raw.get('isInAtList') is True,
            'is_bot': bool(raw.get('isRobot')) or bool(raw.get('chatbotUserId') and raw.get('senderId') == raw.get('chatbotUserId')),
            'kind': raw.get('msgtype', ''), 'text': str((raw.get('text') or {}).get('content', '')).strip(),
            'webhook': raw.get('sessionWebhook', ''),
            'webhook_expires': float(raw.get('sessionWebhookExpiredTime') or 0) / 1000}


def normalize_feishu(data, bot_id):
    event = data.event
    message, sender = event.message, event.sender
    try:
        raw = json.loads(message.content or '{}')
    except ValueError:
        raw = {}
    text = raw.get('text', '') if isinstance(raw, dict) else ''
    mentions = message.mentions or []
    mentioned = bool(bot_id) and any(getattr(mention.id, 'open_id', '') == bot_id for mention in mentions)
    for mention in mentions:
        if bot_id and getattr(mention.id, 'open_id', '') == bot_id and mention.key:
            text = text.replace(mention.key, '').strip()
    return {'event_id': message.message_id,
            'tenant_id': getattr(data.header, 'tenant_key', '') or getattr(sender, 'tenant_key', '') or '',
            'sender_id': getattr(sender.sender_id, 'open_id', '') or '', 'chat_id': message.chat_id,
            'group': message.chat_type == 'group', 'mentioned': mentioned, 'is_bot': sender.sender_type != 'user',
            'kind': message.message_type, 'text': text}


def run():
    output = sys.stdout
    sys.stdout = sys.stderr
    logging.disable(logging.CRITICAL)
    config = json.loads(sys.stdin.readline())
    lock = threading.Lock()
    acknowledgements = {}

    def emit(value):
        with lock:
            output.write(json.dumps(value, ensure_ascii=False) + '\n')
            output.flush()

    def ack_reader():
        for line in sys.stdin:
            try:
                key = json.loads(line).get('ack')
                if key in acknowledgements:
                    acknowledgements[key].set()
            except (ValueError, TypeError):
                continue

    threading.Thread(target=ack_reader, daemon=True).start()

    def persist(event):
        event_id = event.get('event_id', '')
        if not event_id:
            raise ValueError('Missing platform message ID')
        ack_id = uuid.uuid4().hex
        done = threading.Event()
        acknowledgements[ack_id] = done
        try:
            emit({'type': 'message', 'event': event, 'ack_id': ack_id})
            if not done.wait(8):
                raise TimeoutError('Persistence acknowledgement timed out')
        finally:
            acknowledgements.pop(ack_id, None)

    def monitor(get_connection):
        previous = None
        was_connected = False
        while True:
            try:
                conn = get_connection()
                connected = conn is not None and getattr(getattr(conn, 'state', None), 'value', None) == 1
                was_connected = was_connected or connected
                state = 'connected' if connected else 'reconnecting' if was_connected else 'connecting'
                # Heartbeats contain no credentials, ticket URL, message content or SDK logs.
                emit({'type': 'status', 'state': state})
                previous = state
            except Exception:
                emit({'type': 'status', 'state': 'reconnecting' if was_connected else 'connecting'})
            time.sleep(5)

    if config['platform'] == 'dingtalk':
        import dingtalk_stream

        class Handler(dingtalk_stream.ChatbotHandler):
            async def process(self, callback):
                event = normalize_dingtalk(callback.data)
                try:
                    await asyncio.to_thread(persist, event)
                    return dingtalk_stream.AckMessage.STATUS_OK, 'ok'
                except Exception:
                    return dingtalk_stream.AckMessage.STATUS_SYSTEM_EXCEPTION, 'persist_failed'

        client = dingtalk_stream.DingTalkStreamClient(dingtalk_stream.Credential(config['app_id'], config['secret']))
        client.register_callback_handler(dingtalk_stream.ChatbotMessage.TOPIC, Handler())
        threading.Thread(target=monitor, args=(lambda: getattr(client, 'websocket', None),), daemon=True).start()
        client.start_forever()
    else:
        import lark_oapi as lark

        def on_message(data):
            persist(normalize_feishu(data, config.get('bot_id', '')))

        handler = lark.EventDispatcherHandler.builder('', '').register_p2_im_message_receive_v1(on_message).build()
        client = lark.ws.Client(config['app_id'], config['secret'], event_handler=handler, log_level=lark.LogLevel.ERROR)
        threading.Thread(target=monitor, args=(lambda: getattr(client, '_conn', None),), daemon=True).start()
        client.start()


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # Only exception class, never SDK exception text (which can contain tickets).
        sys.__stdout__.write(json.dumps({'type': 'error', 'code': type(error).__name__}) + '\n')
        sys.__stdout__.flush()
        sys.exit(1)
