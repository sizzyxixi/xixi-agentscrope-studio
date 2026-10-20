"""Account-scoped message channels, durable inbox/outbox, and SDK supervision."""
from __future__ import annotations
import asyncio
from contextlib import suppress
import json
import os
from pathlib import Path
import sys
import time
import uuid
from cryptography.fernet import Fernet, InvalidToken
from .store import AuthUser, utc_now
from .channel_platforms import PlatformAPI, ChannelError, DeliveryUnknown, RateLimited

PLATFORMS = {'dingtalk': '钉钉', 'feishu': '飞书'}
TEST_TEXT = '这是一条来自 xixi agent studio 的渠道连接测试消息。'


class ChannelService:
    def __init__(self, runtime, capabilities, api=None):
        self.runtime, self.capabilities, self.store = runtime, capabilities, runtime.store
        self.api = api or PlatformAPI()
        self.supervisors, self.processes, self.jobs, self.locks = {}, {}, {}, {}
        self.send_locks = {}
        self.execution_limit = asyncio.Semaphore(8)
        self.closing = False
        self._cipher = None
        self._schema()

    def _schema(self):
        with self.store._lock:
            self.store._conn.executescript('''
            CREATE TABLE IF NOT EXISTS channel_bindings (
              id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL,
              name TEXT NOT NULL, config_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
              state TEXT NOT NULL DEFAULT 'disabled', error TEXT NOT NULL DEFAULT '',
              last_received TEXT NOT NULL DEFAULT '', last_sent TEXT NOT NULL DEFAULT '',
              updated_at TEXT NOT NULL, UNIQUE(user_id,platform));
            CREATE TABLE IF NOT EXISTS channel_secrets (binding_id TEXT PRIMARY KEY, cipher TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS channel_access (
              id TEXT PRIMARY KEY, binding_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
              sender_id TEXT NOT NULL, chat_id TEXT NOT NULL, is_group INTEGER NOT NULL,
              status TEXT NOT NULL, created_at TEXT NOT NULL,
              UNIQUE(binding_id,tenant_id,sender_id,chat_id));
            CREATE TABLE IF NOT EXISTS channel_sessions (
              session_id TEXT PRIMARY KEY, binding_id TEXT NOT NULL, user_id TEXT NOT NULL,
              tenant_id TEXT NOT NULL,sender_id TEXT NOT NULL,chat_id TEXT NOT NULL,
              agent_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE IF NOT EXISTS channel_messages (
              id TEXT PRIMARY KEY,binding_id TEXT NOT NULL,event_id TEXT NOT NULL,
              session_id TEXT NOT NULL DEFAULT '',text TEXT NOT NULL,route_cipher TEXT NOT NULL,
              scope_json TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL, UNIQUE(binding_id,event_id));
            CREATE TABLE IF NOT EXISTS channel_outbox (
              id TEXT PRIMARY KEY,binding_id TEXT NOT NULL,message_id TEXT NOT NULL,
              delivery_key TEXT NOT NULL UNIQUE,route_cipher TEXT NOT NULL,text TEXT NOT NULL,
              status TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
            ''')
            self.store._conn.commit()

    def cipher(self):
        if self._cipher is None:
            key = os.getenv('AGENTSCOPE_CHANNEL_KEY')
            if not key:
                path = Path(self.store.db_path).parent / 'channel.key'
                if not path.exists():
                    try:
                        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    except FileExistsError:
                        pass
                    else:
                        with os.fdopen(fd, 'wb') as target:
                            target.write(Fernet.generate_key())
                key = path.read_bytes()
            try:
                self._cipher = Fernet(key)
            except (ValueError, TypeError):
                raise ChannelError('渠道加密密钥无效，请检查 AGENTSCOPE_CHANNEL_KEY。') from None
        return self._cipher

    def encrypt(self, value):
        return self.cipher().encrypt(value.encode()).decode()

    def decrypt(self, value):
        try:
            return self.cipher().decrypt(value.encode()).decode()
        except InvalidToken:
            raise ChannelError('无法解密渠道凭证，请恢复原有 channel.key 或重新保存凭证。') from None

    def rows(self, sql, args=()):
        with self.store._lock:
            return [dict(row) for row in self.store._conn.execute(sql, args).fetchall()]

    def write(self, sql, args=()):
        with self.store._lock:
            cursor = self.store._conn.execute(sql, args)
            self.store._conn.commit()
            return cursor.rowcount

    def get(self, user_id, binding_id):
        rows = self.rows('SELECT * FROM channel_bindings WHERE id=? AND user_id=?', (binding_id, user_id))
        if not rows:
            raise ChannelError('渠道不存在或无权访问。')
        row = rows[0]
        row['config'] = json.loads(row.pop('config_json'))
        row['enabled'] = bool(row['enabled'])
        row['has_secret'] = bool(self.rows('SELECT 1 FROM channel_secrets WHERE binding_id=?', (binding_id,)))
        row.pop('user_id')
        return row

    def owner(self, binding_id):
        rows = self.rows('SELECT u.id,u.username FROM users u JOIN channel_bindings b ON b.user_id=u.id WHERE b.id=?', (binding_id,))
        if not rows:
            raise ChannelError('渠道账号不存在。')
        return AuthUser(**rows[0])

    def secret(self, binding_id):
        rows = self.rows('SELECT cipher FROM channel_secrets WHERE binding_id=?', (binding_id,))
        if not rows:
            raise ChannelError('请填写应用 Secret。')
        return self.decrypt(rows[0]['cipher'])

    def list(self, user_id):
        ids = self.rows('SELECT id FROM channel_bindings WHERE user_id=? ORDER BY updated_at DESC', (user_id,))
        return [self.get(user_id, row['id']) for row in ids]

    def scope(self, user_id, config):
        model_id = config.get('model_id', '')
        if not model_id or not self.store.get_model_setting(user_id, model_id):
            raise ChannelError('请选择当前账号已配置的模型。')
        agent_id = config.get('agent_id', 'main')
        scope = {'model_id': model_id, 'agent_id': agent_id, 'skill_ids': [], 'mcp_ids': []}
        if agent_id != 'main':
            agent = self.capabilities.get(user_id, agent_id)
            if agent['kind'] != 'agent' or not agent['enabled']:
                raise ChannelError('智能体不存在或已停用。')
            scope.update(agent_name=agent['name'], agent_prompt=agent['content'], agent_avatar=agent['config'].get('avatar', '✦'), agent_config=agent['config'])
        for key, kind in [('mcp_ids', 'mcp')]:
            values = config.get(key, [])
            if not isinstance(values, list) or len(values) > 3 or any(not isinstance(value, str) for value in values) or len(set(values)) != len(values):
                raise ChannelError('MCP 最多选择 3 个，且不能重复。')
            for value in values:
                item = self.capabilities.get(user_id, value)
                if item['kind'] != kind or not item['enabled']:
                    raise ChannelError('所选能力不存在或已停用。')
            scope[key] = values
        return scope

    async def save(self, user_id, platform, body):
        if platform not in PLATFORMS:
            raise ChannelError('该渠道暂未支持。')
        config = body.get('config', {})
        if not isinstance(config, dict):
            raise ChannelError('渠道配置格式无效。')
        scope = self.scope(user_id, config)
        name = str(body.get('name', '')).strip()
        app_id = str(config.get('app_id', '')).strip()
        if not name or len(name) > 100 or not app_id or len(app_id) > 200:
            raise ChannelError('请填写配置名称和有效的应用 ID。')
        previous = self.rows('SELECT id FROM channel_bindings WHERE user_id=? AND platform=?', (user_id, platform))
        binding_id = previous[0]['id'] if previous else uuid.uuid4().hex
        secret = body.get('secret', '')
        if not isinstance(secret, str) or len(secret) > 4096:
            raise ChannelError('Secret 格式无效。')
        if not secret and not previous:
            raise ChannelError('首次配置必须填写 Secret。')
        normalized = {key: scope[key] for key in ('agent_id', 'model_id', 'skill_ids', 'mcp_ids')}
        normalized.update(app_id=app_id, prefix=str(config.get('prefix', ''))[:100],
                          robot_code=str(config.get('robot_code', ''))[:200],
                          dm_enabled=config.get('dm_enabled', True) is True,
                          group_enabled=config.get('group_enabled', True) is True,
                          require_mention=config.get('require_mention', True) is True,
                          at_sender=config.get('at_sender', True) is True)
        app_changed = False
        if previous:
            old = self.get(user_id, binding_id)
            if old['enabled']:
                raise ChannelError('请先停用渠道，再修改配置；当前运行任务会继续完成。')
            if old['config']['app_id'] != app_id and not secret:
                raise ChannelError('更换应用 ID 时请同时填写对应的 Secret。')
            if old['config']['app_id'] != app_id:
                # A new bot must never inherit approvals or chat mappings from the old bot.
                app_changed = True
        encrypted = self.encrypt(secret) if secret else None
        with self.store._lock:
            if app_changed:
                self.store._conn.execute('DELETE FROM channel_access WHERE binding_id=?', (binding_id,))
                self.store._conn.execute('UPDATE channel_sessions SET active=0 WHERE binding_id=?', (binding_id,))
            self.store._conn.execute('''INSERT INTO channel_bindings
              (id,user_id,platform,name,config_json,enabled,state,updated_at) VALUES (?,?,?,?,?,0,'disabled',?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name,config_json=excluded.config_json,error='',state='disabled',updated_at=excluded.updated_at''',
              (binding_id, user_id, platform, name, json.dumps(normalized), utc_now()))
            if encrypted:
                self.store._conn.execute('INSERT OR REPLACE INTO channel_secrets VALUES (?,?)', (binding_id, encrypted))
            self.store._conn.commit()
        self.api.invalidate(platform, app_id)
        return self.get(user_id, binding_id)

    def state(self, binding_id, state, error=''):
        self.write('UPDATE channel_bindings SET state=?,error=?,updated_at=? WHERE id=?', (state, error[:300], utc_now(), binding_id))

    async def validate(self, user_id, binding_id):
        binding = self.get(user_id, binding_id)
        try:
            secret = self.secret(binding_id)
            token = await self.api.token(binding['platform'], binding['config']['app_id'], secret, force=True)
            if binding['platform'] == 'feishu':
                data = await self.api.request('https://open.feishu.cn/open-apis/bot/v3/info', method='GET', headers={'Authorization': f'Bearer {token}'})
                bot_id = data.get('bot', {}).get('open_id', '')
                if not bot_id:
                    raise ChannelError('未找到飞书机器人，请在自建应用中启用机器人能力并发布。')
                config = {**binding['config'], 'platform_bot_id': bot_id}
                self.write('UPDATE channel_bindings SET config_json=? WHERE id=?', (json.dumps(config), binding_id))
            return {'ok': True, 'message': '凭证校验通过；启用后才能建立连接，完整收发仍需配置平台权限与事件订阅。'}
        except ChannelError as error:
            self.state(binding_id, 'configuration_error', str(error))
            raise

    async def enable(self, user_id, binding_id):
        binding = self.get(user_id, binding_id)
        self.scope(user_id, binding['config'])
        duplicate = [row for row in self.rows('SELECT id,config_json FROM channel_bindings WHERE platform=? AND enabled=1 AND id!=?', (binding['platform'], binding_id))
                     if json.loads(row['config_json']).get('app_id') == binding['config']['app_id']]
        if duplicate:
            raise ChannelError('该机器人已被其他启用实例占用，请先停用原连接。')
        await self.validate(user_id, binding_id)
        # Recheck after network I/O: two concurrent enables must not race.
        with self.store._lock:
            for row in self.store._conn.execute('SELECT config_json FROM channel_bindings WHERE platform=? AND enabled=1 AND id!=?', (binding['platform'], binding_id)):
                if json.loads(row['config_json']).get('app_id') == binding['config']['app_id']:
                    raise ChannelError('该机器人已被其他启用实例占用。')
            self.store._conn.execute("UPDATE channel_bindings SET enabled=1,state='connecting',error='' WHERE id=?", (binding_id,))
            self.store._conn.commit()
        self.start_worker(binding_id)
        return self.get(user_id, binding_id)

    def start_worker(self, binding_id):
        if binding_id not in self.supervisors or self.supervisors[binding_id].done():
            self.supervisors[binding_id] = asyncio.create_task(self.supervise(binding_id))

    async def disable(self, user_id, binding_id):
        self.get(user_id, binding_id)
        self.write("UPDATE channel_bindings SET enabled=0,state='disabled',error='' WHERE id=?", (binding_id,))
        task = self.supervisors.pop(binding_id, None)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        return self.get(user_id, binding_id)

    async def supervise(self, binding_id):
        delay = 2
        while not self.closing:
            user = self.owner(binding_id)
            binding = self.get(user.id, binding_id)
            if not binding['enabled']:
                return
            process = None
            try:
                self.state(binding_id, 'connecting' if delay == 2 else 'reconnecting')
                process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'service.channel_worker',
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=1024 * 1024,
                    cwd=str(Path(__file__).resolve().parents[1]))
                self.processes[binding_id] = process
                payload = {'platform': binding['platform'], 'app_id': binding['config']['app_id'], 'secret': self.secret(binding_id), 'bot_id': binding['config'].get('platform_bot_id', '')}
                process.stdin.write((json.dumps(payload) + '\n').encode())
                await process.stdin.drain()
                connected_once = False
                started = time.monotonic()
                while True:
                    line = await asyncio.wait_for(process.stdout.readline(), timeout=35)
                    if not line:
                        raise ChannelError('SDK 接收进程已退出，请检查 SDK、应用发布和平台订阅配置。')
                    message = json.loads(line)
                    if message.get('type') == 'status':
                        state = message.get('state')
                        if state == 'connected':
                            connected_once = True
                            delay = 2
                        if state in {'connected', 'connecting', 'reconnecting'}:
                            self.state(binding_id, state)
                        if not connected_once and time.monotonic() - started > 45:
                            raise ChannelError('长连接尚未建立，请检查机器人发布、Stream/事件订阅与网络。')
                    elif message.get('type') == 'message':
                        event = message.get('event', {})
                        await self.receive(user.id, binding_id, event)
                        process.stdin.write((json.dumps({'ack': message.get('ack_id')}) + '\n').encode())
                        await process.stdin.drain()
                    elif message.get('type') == 'error':
                        raise ChannelError('SDK 连接失败，请检查应用发布、平台订阅和网络；不会显示凭证或连接票据。')
            except asyncio.CancelledError:
                raise
            except Exception:
                self.state(binding_id, 'connection_failed', '连接异常，正在退避重试。请检查应用发布、事件订阅、SDK 安装和网络。')
            finally:
                if process and process.returncode is None:
                    process.terminate()
                    with suppress(asyncio.TimeoutError):
                        await asyncio.wait_for(process.wait(), 3)
                    if process.returncode is None:
                        process.kill()
                        await process.wait()
                self.processes.pop(binding_id, None)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

    async def startup(self):
        self.write("UPDATE channel_messages SET status='interrupted',detail='服务重启，未自动重新执行。' WHERE status IN ('running','waiting_approval')")
        self.write("UPDATE channel_outbox SET status='unknown',detail='服务重启时发送结果不明，请核对平台会话。' WHERE status='sending'")
        for row in self.rows('SELECT id FROM channel_bindings WHERE enabled=1'):
            self.start_worker(row['id'])
        for row in self.rows("SELECT id FROM channel_messages WHERE status='queued'"):
            self.schedule(row['id'])
        for row in self.rows("SELECT id FROM channel_outbox WHERE status='pending'"):
            self.track('send-' + row['id'], self.deliver(row['id']))

    async def close(self):
        self.closing = True
        tasks = list(self.supervisors.values()) + list(self.jobs.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.supervisors.clear()
        self.jobs.clear()
        await self.api.close()

    def track(self, key, coro):
        task = asyncio.create_task(coro)
        self.jobs[key] = task
        def complete(done):
            if self.jobs.get(key) is done:
                self.jobs.pop(key, None)
            if not done.cancelled():
                # Consume exceptions without logging plaintext SDK errors or credentials.
                done.exception()
        task.add_done_callback(complete)
        return task

    def schedule(self, message_id):
        return self.track(message_id, self.process(message_id))

    async def receive(self, user_id, binding_id, event):
        binding = self.get(user_id, binding_id)
        if not binding['enabled'] or event.get('is_bot'):
            return
        config = binding['config']
        group = event.get('group') is True
        if not config.get('group_enabled' if group else 'dm_enabled', True):
            return
        if group and config.get('require_mention', True) and not event.get('mentioned'):
            return
        event_id, sender, tenant, chat = (str(event.get(key) or '')[:500] for key in ('event_id', 'sender_id', 'tenant_id', 'chat_id'))
        if not event_id or not sender or not chat or not tenant:
            return
        access = self.rows('SELECT * FROM channel_access WHERE binding_id=? AND tenant_id=? AND sender_id=? AND chat_id=?', (binding_id, tenant, sender, chat))
        if not access:
            if self.rows("SELECT COUNT(*) AS total FROM channel_access WHERE binding_id=? AND status='pending'", (binding_id,))[0]['total'] < 100:
                self.write("INSERT OR IGNORE INTO channel_access VALUES (?,?,?,?,?,?,'pending',?)", (uuid.uuid4().hex, binding_id, tenant, sender, chat, int(group), utc_now()))
                # No private message body is persisted or sent to a model before authorization.
            return
        if access[0]['status'] != 'allowed':
            return
        if self.rows('SELECT 1 FROM channel_messages WHERE binding_id=? AND event_id=?', (binding_id, event_id)):
            return
        route = {key: event.get(key) for key in ('tenant_id','sender_id','chat_id','group','webhook','webhook_expires')}
        route['app_id'] = config['app_id']
        text = str(event.get('text', '')).strip()
        try:
            scope = self.scope(user_id, config)
        except ValueError:
            self.state(binding_id, 'configuration_error', '智能体、模型或工具引用已失效，请更新配置。')
            return
        existing = self.rows('SELECT * FROM channel_sessions WHERE binding_id=? AND tenant_id=? AND sender_id=? AND chat_id=? AND active=1', (binding_id, tenant, sender, chat))
        session = existing[0] if existing else None
        if session and (session['agent_id'] != scope['agent_id'] or not self.rows('SELECT 1 FROM sessions WHERE id=? AND user_id=?', (session['session_id'], user_id))):
            self.write('UPDATE channel_sessions SET active=0 WHERE session_id=?', (session['session_id'],))
            session = None
        if text == '/new':
            if session:
                self.write('UPDATE channel_sessions SET active=0 WHERE session_id=?', (session['session_id'],))
            session = None
        if not session:
            sid = 'channel-' + uuid.uuid4().hex
            self.store.ensure_session(sid, user_id)
            self.write('UPDATE sessions SET title=? WHERE id=?', (f'{PLATFORMS[binding["platform"]]} · {binding["name"]} · {sender[-8:]}', sid))
            self.write('INSERT INTO channel_sessions VALUES (?,?,?,?,?,?,?,1)', (sid, binding_id, user_id, tenant, sender, chat, scope['agent_id']))
        else:
            sid = session['session_id']
        message_id = uuid.uuid4().hex
        if not self.write("INSERT OR IGNORE INTO channel_messages VALUES (?,?,?,?,?,?,?,'queued','',?)", (message_id, binding_id, event_id, sid, text[:24000], self.encrypt(json.dumps(route)), json.dumps(scope), utc_now())):
            return
        self.write('UPDATE channel_bindings SET last_received=? WHERE id=?', (utc_now(), binding_id))
        if text == '/stop':
            await self.stop_session(user_id, sid)
            self.finish(message_id, 'success', '已请求停止。')
            self.queue_send(binding_id, message_id, route, '已停止当前会话的运行。', 'command')
        elif text in {'/help', '/new'} or event.get('kind') != 'text':
            response = '已新建会话，请发送任务。' if text == '/new' else '支持文本对话。/new 新开会话；/stop 停止当前运行；/help 使用说明。'
            self.finish(message_id, 'success', '已处理渠道命令。')
            self.queue_send(binding_id, message_id, route, response, 'command')
        elif not text:
            self.finish(message_id, 'ignored', '空消息')
        elif len(text) > 24000:
            self.finish(message_id, 'failed', '消息过长')
            self.queue_send(binding_id, message_id, route, '消息超过 24000 字符，请分段发送。', 'error')
        elif self.rows("SELECT COUNT(*) AS total FROM channel_messages WHERE session_id=? AND status IN ('running','queued','waiting_approval')", (sid,))[0]['total'] > 10:
            self.finish(message_id, 'failed', '会话队列已满')
            self.queue_send(binding_id, message_id, route, '当前会话任务较多，请稍后再试。', 'error')
        else:
            self.schedule(message_id)

    def finish(self, message_id, status, detail=''):
        self.write('UPDATE channel_messages SET status=?,detail=? WHERE id=?', (status, detail[:300], message_id))

    async def process(self, message_id):
        rows = self.rows('SELECT * FROM channel_messages WHERE id=?', (message_id,))
        if not rows:
            return
        message = rows[0]
        sid = message['session_id']
        async with self.locks.setdefault(sid, asyncio.Lock()), self.execution_limit:
            try:
                user = self.owner(message['binding_id'])
                binding = self.get(user.id, message['binding_id'])
                if not binding['enabled']:
                    self.finish(message_id, 'interrupted', '渠道已停用，未开始执行。')
                    return
                if self.rows("SELECT 1 FROM channel_messages WHERE session_id=? AND status='waiting_approval'", (sid,)):
                    self.finish(message_id, 'failed', '当前会话等待工具确认，请先在网页处理。')
                    self.queue_send(message['binding_id'], message_id, json.loads(self.decrypt(message['route_cipher'])), '当前会话正在等待工具确认，请先在网页处理。', 'busy')
                    return
                route = json.loads(self.decrypt(message['route_cipher']))
                allowed = self.rows("SELECT 1 FROM channel_access WHERE binding_id=? AND tenant_id=? AND sender_id=? AND chat_id=? AND status='allowed'", (message['binding_id'], route['tenant_id'], route['sender_id'], route['chat_id']))
                if not allowed or route.get('app_id') != binding['config']['app_id']:
                    self.finish(message_id, 'interrupted', '发送者授权或机器人配置已变更。')
                    return
                scope = json.loads(message['scope_json'])
                # Revalidate references at execution time; keep the message's agent prompt snapshot.
                self.scope(user.id, scope)
                self.capabilities.set_session_config(user.id, sid, scope)
                self.finish(message_id, 'running')
                events = []
                async with asyncio.timeout(600):
                    async for frame in self.runtime.stream(sid, message['text'], user=user):
                        event = json.loads(next((line[6:] for line in frame.splitlines() if line.startswith('data: ')), '{}'))
                        events.append(event)
                await self.complete_message(message, events)
            except asyncio.CancelledError:
                self.finish(message_id, 'interrupted', '任务已停止或服务关闭。')
                raise
            except Exception:
                self.finish(message_id, 'failed', '执行失败，请在网页会话中查看模型和工具配置。')
                self.queue_send(message['binding_id'], message_id, json.loads(self.decrypt(message['route_cipher'])), '执行失败，请在网页查看模型、工具配置或重新发起任务。', 'error')

    async def complete_message(self, message, events, approved=True):
        route = json.loads(self.decrypt(message['route_cipher']))
        message_id, binding_id = message['id'], message['binding_id']
        pending = any(event.get('type') == 'approval_required' for event in events)
        if pending:
            self.finish(message_id, 'waiting_approval', '请在网页会话中确认工具调用。')
            text = f'此操作需要在网页确认。请打开「{PLATFORMS[self.get(self.owner(binding_id).id, binding_id)["platform"]]}」来源的会话（{message["session_id"][-8:]}）。'
            self.queue_send(binding_id, message_id, route, text, 'approval')
            return
        done = next((event for event in reversed(events) if event.get('type') == 'done'), None)
        failed = not done or done.get('level') == 'warning' or done.get('title') == 'Waiting for model settings'
        text = ''.join(str(event.get('text', '')) for event in events if event.get('type') == 'token').strip()
        if not approved:
            text = '操作已取消，未继续执行。'
        elif failed:
            text = '本次执行未完成，请到网页查看会话详情。'
        elif not text:
            text = '任务已完成，请到网页查看完整结果。'
        self.finish(message_id, 'failed' if failed else 'success')
        self.queue_send(binding_id, message_id, route, text, 'final')

    async def after_approval(self, user_id, session_id, approved, events):
        if not self.rows('SELECT 1 FROM channel_sessions WHERE session_id=? AND user_id=?', (session_id, user_id)):
            return
        rows = self.rows("SELECT * FROM channel_messages WHERE session_id=? AND status='waiting_approval' ORDER BY created_at LIMIT 1", (session_id,))
        if rows:
            await self.complete_message(rows[0], events, approved)

    def owns_session(self, user_id, session_id):
        return bool(self.rows('SELECT 1 FROM channel_sessions WHERE session_id=? AND user_id=?', (session_id, user_id)))

    async def stop_session(self, user_id, session_id):
        if not self.owns_session(user_id, session_id):
            raise ChannelError('渠道会话不存在或无权访问。')
        rows = self.rows("SELECT id FROM channel_messages WHERE session_id=? AND status IN ('queued','running','waiting_approval')", (session_id,))
        tasks = [self.jobs[row['id']] for row in rows if row['id'] in self.jobs and self.jobs[row['id']] is not asyncio.current_task()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.write("UPDATE channel_messages SET status='interrupted',detail='用户停止运行。' WHERE session_id=? AND status IN ('queued','running','waiting_approval')", (session_id,))
        self.runtime.sessions.pop(session_id, None)

    def queue_send(self, binding_id, message_id, route, text, suffix):
        user = self.owner(binding_id)
        prefix = self.get(user.id, binding_id)['config'].get('prefix', '')
        text = (prefix + '\n' if prefix else '') + text
        for index, offset in enumerate(range(0, len(text), 3000)):
            key = f'{message_id}:{suffix}:{index}'
            oid, now = uuid.uuid4().hex, utc_now()
            if self.write("INSERT OR IGNORE INTO channel_outbox VALUES (?,?,?,?,?,?,'pending','',0,?,?)", (oid, binding_id, message_id, key, self.encrypt(json.dumps(route)), text[offset:offset+3000], now, now)):
                self.track('send-' + oid, self.deliver(oid))

    async def deliver(self, outbox_id):
        rows = self.rows('SELECT * FROM channel_outbox WHERE id=?', (outbox_id,))
        if not rows:
            return
        item = rows[0]
        async with self.send_locks.setdefault(item['binding_id'], asyncio.Lock()):
            if not self.write("UPDATE channel_outbox SET status='sending',updated_at=? WHERE id=? AND status='pending'", (utc_now(), outbox_id)):
                return
            for attempt in range(3):
                self.write('UPDATE channel_outbox SET attempts=attempts+1 WHERE id=?', (outbox_id,))
                try:
                    user = self.owner(item['binding_id'])
                    binding = self.get(user.id, item['binding_id'])
                    route = json.loads(self.decrypt(item['route_cipher']))
                    if route.get('app_id') and route['app_id'] != binding['config']['app_id']:
                        raise ChannelError('机器人应用已变更，停止向旧目标发送。')
                    if not item['message_id'].startswith('test-'):
                        access = self.rows("SELECT 1 FROM channel_access WHERE binding_id=? AND tenant_id=? AND sender_id=? AND chat_id=? AND status='allowed'", (item['binding_id'], route.get('tenant_id'), route.get('sender_id'), route.get('chat_id')))
                        if not access:
                            raise ChannelError('接收者的渠道访问授权已撤销。')
                    await self.api.send(binding, self.secret(item['binding_id']), route, item['text'])
                    self.write("UPDATE channel_outbox SET status='sent',detail='',updated_at=? WHERE id=?", (utc_now(), outbox_id))
                    self.write('UPDATE channel_bindings SET last_sent=? WHERE id=?', (utc_now(), item['binding_id']))
                    return
                except RateLimited as error:
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    detail, state = str(error), 'failed'
                except DeliveryUnknown as error:
                    detail, state = str(error), 'unknown'
                except (ChannelError, ValueError):
                    detail, state = '发送失败，请检查凭证、目标、回复地址有效期与平台发送权限。', 'failed'
                except Exception:
                    detail, state = '发送异常，结果需核对；未自动重复发送。', 'unknown'
                self.write('UPDATE channel_outbox SET status=?,detail=?,updated_at=? WHERE id=?', (state, detail, utc_now(), outbox_id))
                return

    async def test_send(self, user_id, binding_id, target, group=False):
        binding = self.get(user_id, binding_id)
        if not binding['enabled'] or binding['state'] != 'connected':
            raise ChannelError('请先启用渠道并等待长连接建立。')
        if not isinstance(target, str) or not target.strip() or len(target) > 500:
            raise ChannelError('请填写明确的接收目标。')
        if binding['platform'] == 'dingtalk' and not binding['config'].get('robot_code'):
            raise ChannelError('主动测试发送需要 Robot Code 及对应机器人发送权限。')
        message_id = 'test-' + uuid.uuid4().hex
        route = {'chat_id': target.strip(), 'sender_id': target.strip(), 'group': group}
        self.queue_send(binding_id, message_id, route, TEST_TEXT, 'test')
        tasks = [self.jobs['send-' + row['id']] for row in self.rows('SELECT id FROM channel_outbox WHERE message_id=?', (message_id,)) if 'send-' + row['id'] in self.jobs]
        await asyncio.gather(*tasks, return_exceptions=True)
        rows = self.rows('SELECT status,detail FROM channel_outbox WHERE message_id=?', (message_id,))
        return {'ok': bool(rows) and all(row['status'] == 'sent' for row in rows), 'deliveries': rows}

    def access(self, user_id, binding_id):
        self.get(user_id, binding_id)
        return self.rows('SELECT id,tenant_id,sender_id,chat_id,is_group,status,created_at FROM channel_access WHERE binding_id=? ORDER BY created_at DESC LIMIT 100', (binding_id,))

    def update_access(self, user_id, binding_id, access_id, status):
        self.get(user_id, binding_id)
        if status not in {'allowed', 'blocked'}:
            raise ChannelError('访问权限无效。')
        if not self.write('UPDATE channel_access SET status=? WHERE id=? AND binding_id=?', (status, access_id, binding_id)):
            raise ChannelError('授权申请不存在。')
        return self.access(user_id, binding_id)

    def add_access(self, user_id, binding_id, body):
        self.get(user_id, binding_id)
        values = [str(body.get(key, '')).strip() for key in ('tenant_id', 'sender_id', 'chat_id')]
        if any(not value or len(value) > 500 or '*' in value for value in values):
            raise ChannelError('请填写租户、发送者和会话标识，不能使用通配符。')
        self.write("INSERT INTO channel_access VALUES (?,?,?,?,?,?,'allowed',?) ON CONFLICT(binding_id,tenant_id,sender_id,chat_id) DO UPDATE SET status='allowed'",
                   (uuid.uuid4().hex, binding_id, *values, int(body.get('is_group') is True), utc_now()))
        return self.access(user_id, binding_id)

    def diagnostics(self, user_id, binding_id):
        binding = self.get(user_id, binding_id)
        return {'binding': binding,
                'messages': self.rows('SELECT id,session_id,status,detail,created_at FROM channel_messages WHERE binding_id=? ORDER BY created_at DESC LIMIT 30', (binding_id,)),
                'deliveries': self.rows('SELECT id,status,detail,attempts,created_at FROM channel_outbox WHERE binding_id=? ORDER BY created_at DESC LIMIT 30', (binding_id,))}
