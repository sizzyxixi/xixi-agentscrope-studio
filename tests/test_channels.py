import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx
from service.channels import ChannelService
from service.channel_platforms import PlatformAPI, ChannelError, DeliveryUnknown
from service.capabilities import ConsoleCapabilities
from service.runtime import AgentScopeRuntime, sse
from service.store import StudioStore


class FakeAPI:
    def __init__(self): self.sent = []; self.failure = None
    async def token(self, *args, **kwargs): return 'fixture-token'
    async def request(self, *args, **kwargs): return {'code': 0, 'bot': {'open_id': 'bot-fixture'}}
    def invalidate(self, *args): pass
    async def close(self): pass
    async def send(self, binding, secret, route, text):
        if self.failure: raise self.failure
        self.sent.append((binding['id'], route, text))
        return {'ok': True}


class ChannelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root/'state.sqlite3', root)
        self.cap = ConsoleCapabilities(self.store)
        self.runtime = AgentScopeRuntime(self.store)
        self.runtime.capabilities = self.cap
        self.cap.runtime = self.runtime
        self.user, self.token = self.store.create_user('channeluser', 'testpass123')
        self.other, _ = self.store.create_user('channelother', 'testpass456')
        self.model = self.store.create_model_setting(self.user.id, 'ollama', 'test', 'qwen3', 'http://127.0.0.1:11434/v1', '', True)
        self.api = FakeAPI()
        self.channels = ChannelService(self.runtime, self.cap, self.api)
        self.calls = []
        self.frames = [{'type':'token','text':'fixture answer'}, {'type':'done'}]
        self.gate = None
        async def stream(session_id, message, **kwargs):
            self.calls.append((session_id, message, kwargs))
            if self.gate: await self.gate.wait()
            for frame in self.frames: yield sse(frame['type'], frame)
        self.runtime.stream = stream
        self.body = {'name':'测试飞书', 'secret':'fixture-secret', 'config':{'app_id':'app-fixture', 'model_id':self.model.id, 'agent_id':'main', 'skill_ids':[], 'mcp_ids':[]}}
        self.binding = await self.channels.save(self.user.id, 'feishu', self.body)
        self.enable_locally()
        self.event = {'event_id':'msg-one','tenant_id':'tenant-one','sender_id':'sender-one','chat_id':'chat-one','group':False,'mentioned':False,'is_bot':False,'kind':'text','text':'hello'}

    def enable_locally(self):
        self.channels.write("UPDATE channel_bindings SET enabled=1,state='connected' WHERE id=?", (self.binding['id'],))

    async def authorize(self, event=None):
        event = event or self.event
        await self.channels.receive(self.user.id, self.binding['id'], event)
        access = self.channels.access(self.user.id, self.binding['id'])
        item = next(row for row in access if row['sender_id'] == event['sender_id'] and row['chat_id'] == event['chat_id'])
        self.channels.update_access(self.user.id, self.binding['id'], item['id'], 'allowed')

    async def drain(self):
        for _ in range(20):
            tasks = list(self.channels.jobs.values())
            if not tasks: return
            await asyncio.gather(*tasks, return_exceptions=False)
            await asyncio.sleep(0)

    async def asyncTearDown(self):
        await self.channels.close()
        await self.cap.close()
        self.store._conn.close()
        self.temp.cleanup()

    async def test_credentials_are_encrypted_masked_and_persisted(self):
        binding = self.channels.get(self.user.id, self.binding['id'])
        self.assertTrue(binding['has_secret'])
        self.assertNotIn('fixture-secret', json.dumps(binding))
        encrypted = self.channels.rows('SELECT cipher FROM channel_secrets')[0]['cipher']
        self.assertNotIn('fixture-secret', encrypted)
        self.assertEqual(self.channels.secret(binding['id']), 'fixture-secret')
        self.assertEqual((Path(self.temp.name)/'channel.key').stat().st_mode & 0o777, 0o600)
        other = ChannelService(self.runtime, self.cap, FakeAPI())
        self.assertEqual(other.secret(binding['id']), 'fixture-secret')
        await other.close()

    async def test_account_isolation_and_invalid_model(self):
        self.assertEqual(self.channels.list(self.other.id), [])
        for fn in (lambda:self.channels.get(self.other.id,self.binding['id']),lambda:self.channels.access(self.other.id,self.binding['id']),lambda:self.channels.diagnostics(self.other.id,self.binding['id'])):
            with self.assertRaises(ChannelError): fn()
        with self.assertRaises(ChannelError): await self.channels.save(self.other.id,'feishu',self.body)
        with self.assertRaises(ChannelError): await self.channels.save(self.user.id,'slack',self.body)

    async def test_save_disabled_retains_secret_and_blocks_app_change_without_secret(self):
        await self.channels.disable(self.user.id,self.binding['id'])
        saved=await self.channels.save(self.user.id,'feishu',{**self.body,'secret':''})
        self.assertFalse(saved['enabled'])
        self.assertEqual(self.channels.secret(saved['id']),'fixture-secret')
        with self.assertRaises(ChannelError): await self.channels.save(self.user.id,'feishu',{**self.body,'secret':'','config':{**self.body['config'],'app_id':'new-app'}})

    async def test_unauthorized_messages_never_invoke_model_or_store_content(self):
        await self.channels.receive(self.user.id,self.binding['id'],self.event)
        await self.drain()
        self.assertEqual(self.calls,[])
        self.assertEqual(self.channels.rows('SELECT * FROM channel_messages'),[])
        access=self.channels.access(self.user.id,self.binding['id'])
        self.assertEqual(access[0]['status'],'pending')
        self.assertNotIn('hello',json.dumps(access))

    async def test_dedup_and_execution_scope_and_delivery(self):
        await self.authorize()
        await self.channels.receive(self.user.id,self.binding['id'],self.event)
        await self.channels.receive(self.user.id,self.binding['id'],self.event)
        await self.drain()
        self.assertEqual(len(self.calls),1)
        self.assertEqual(len(self.api.sent),1)
        self.assertEqual(self.api.sent[0][2],'fixture answer')
        sid=self.calls[0][0]
        self.assertEqual(self.cap.session_config(self.user.id,sid)['model_id'],self.model.id)
        self.assertIsNone(self.cap.session_config(self.other.id,sid))
        self.assertEqual(self.channels.rows('SELECT status FROM channel_messages')[0]['status'],'success')

    async def test_group_mentions_and_sender_sessions_are_isolated(self):
        group={**self.event,'group':True,'mentioned':False,'chat_id':'group-one'}
        await self.channels.receive(self.user.id,self.binding['id'],group)
        self.assertEqual(self.channels.access(self.user.id,self.binding['id']),[])
        group['mentioned']=True
        await self.authorize(group)
        await self.channels.receive(self.user.id,self.binding['id'],group)
        other={**group,'sender_id':'sender-two','event_id':'msg-two'}
        await self.authorize(other)
        await self.channels.receive(self.user.id,self.binding['id'],other)
        await self.drain()
        self.assertEqual(len({call[0] for call in self.calls}),2)

    async def test_bot_and_disabled_channel_messages_are_ignored(self):
        await self.channels.receive(self.user.id,self.binding['id'],{**self.event,'is_bot':True})
        await self.channels.disable(self.user.id,self.binding['id'])
        await self.channels.receive(self.user.id,self.binding['id'],self.event)
        self.assertEqual(self.channels.access(self.user.id,self.binding['id']),[])

    async def test_unknown_send_result_is_not_retried_or_regenerated(self):
        self.api.failure=DeliveryUnknown('结果不明')
        await self.authorize()
        await self.channels.receive(self.user.id,self.binding['id'],self.event)
        await self.drain()
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.channels.rows('SELECT status,attempts FROM channel_outbox')[0],{'status':'unknown','attempts':1})

    async def test_revoked_recipient_does_not_receive_queued_result(self):
        await self.authorize()
        permission=self.channels.access(self.user.id,self.binding['id'])[0]
        self.channels.update_access(self.user.id,self.binding['id'],permission['id'],'blocked')
        self.channels.queue_send(self.binding['id'],'delivery-fixture',{**self.event,'app_id':'app-fixture'},'private result','final')
        await self.drain()
        self.assertEqual(self.api.sent,[])
        self.assertEqual(self.channels.rows('SELECT status FROM channel_outbox')[0]['status'],'failed')

    async def test_supervisor_acknowledges_after_persistence_and_stops_child(self):
        await self.authorize()
        channels=self.channels
        class Pipe:
            def __init__(self): self.acks=[]
            def write(self, data):
                value=json.loads(data)
                if 'ack' in value:
                    self.acks.append((value['ack'],bool(channels.rows('SELECT 1 FROM channel_messages WHERE event_id=?',('msg-one',)))))
            async def drain(self): pass
        class Process:
            def __init__(self):
                self.stdin=Pipe(); self.stdout=asyncio.StreamReader(); self.returncode=None
            def terminate(self): self.returncode=0
            def kill(self): self.returncode=-9
            async def wait(self): return self.returncode
        process=Process()
        process.stdout.feed_data((json.dumps({'type':'status','state':'connected'})+'\n').encode())
        process.stdout.feed_data((json.dumps({'type':'message','event':self.event,'ack_id':'transport-ack'})+'\n').encode())
        async def spawn(*args, **kwargs):
            self.assertNotIn('fixture-secret',' '.join(str(arg) for arg in args))
            return process
        with patch('service.channels.asyncio.create_subprocess_exec',side_effect=spawn):
            task=asyncio.create_task(self.channels.supervise(self.binding['id']))
            for _ in range(50):
                if process.stdin.acks: break
                await asyncio.sleep(.001)
            self.assertEqual(process.stdin.acks,[('transport-ack',True)])
            self.assertEqual(self.channels.get(self.user.id,self.binding['id'])['state'],'connected')
            task.cancel();await asyncio.gather(task,return_exceptions=True)
            self.assertEqual(process.returncode,0)
        await self.drain()

    async def test_approval_notice_and_resume_deliver_to_original_chat(self):
        self.frames=[{'type':'approval_required'},{'type':'done'}]
        await self.authorize()
        await self.channels.receive(self.user.id,self.binding['id'],self.event)
        await self.drain()
        row=self.channels.rows('SELECT * FROM channel_messages')[0]
        self.assertEqual(row['status'],'waiting_approval')
        self.assertIn('网页确认',self.api.sent[0][2])
        await self.channels.after_approval(self.user.id,row['session_id'],True,[{'type':'token','text':'confirmed result'},{'type':'done'}])
        await self.drain()
        self.assertEqual(self.api.sent[-1][1]['chat_id'],'chat-one')
        self.assertEqual(self.api.sent[-1][2],'confirmed result')
        await self.channels.after_approval(self.user.id,row['session_id'],True,[{'type':'done'}])
        await self.drain()
        self.assertEqual(len(self.api.sent),2)

    async def test_new_and_stop_commands_do_not_call_model(self):
        await self.authorize()
        await self.channels.receive(self.user.id,self.binding['id'],{**self.event,'text':'/new'})
        await self.drain()
        self.assertEqual(self.calls,[])
        self.gate=asyncio.Event()
        await self.channels.receive(self.user.id,self.binding['id'],{**self.event,'event_id':'long-run'})
        await asyncio.sleep(.01)
        await self.channels.receive(self.user.id,self.binding['id'],{**self.event,'event_id':'stop','text':'/stop'})
        await self.drain()
        self.assertIn('interrupted',[row['status'] for row in self.channels.rows('SELECT status FROM channel_messages')])

    async def test_changed_app_cannot_inherit_authorizations(self):
        await self.authorize()
        await self.channels.disable(self.user.id,self.binding['id'])
        await self.channels.save(self.user.id,'feishu',{**self.body,'config':{**self.body['config'],'app_id':'new-app'},'secret':'new-secret'})
        self.assertEqual(self.channels.access(self.user.id,self.binding['id']),[])

    async def test_enable_checks_conflicts_and_starts_only_after_validation(self):
        await self.channels.disable(self.user.id,self.binding['id'])
        with patch.object(self.channels,'start_worker') as start:
            binding=await self.channels.enable(self.user.id,self.binding['id'])
            self.assertEqual(binding['state'],'connecting')
            start.assert_called_once_with(self.binding['id'])
        model=self.store.create_model_setting(self.other.id,'ollama','other','qwen3','http://127.0.0.1:11434/v1','',True)
        second=await self.channels.save(self.other.id,'feishu',{**self.body,'config':{**self.body['config'],'model_id':model.id}})
        with self.assertRaises(ChannelError): await self.channels.enable(self.other.id,second['id'])

    async def test_test_send_requires_connected_status_and_target(self):
        with self.assertRaises(ChannelError): await self.channels.test_send(self.user.id,self.binding['id'],'')
        result=await self.channels.test_send(self.user.id,self.binding['id'],'oc-test')
        self.assertTrue(result['ok'])
        self.assertIn('测试消息',self.api.sent[-1][2])
        await self.channels.disable(self.user.id,self.binding['id'])
        with self.assertRaises(ChannelError): await self.channels.test_send(self.user.id,self.binding['id'],'oc-test')


class PlatformTests(unittest.IsolatedAsyncioTestCase):
    async def test_official_endpoints_and_payloads(self):
        requests=[]
        def handle(request):
            requests.append(request)
            if 'tenant_access_token' in request.url.path: return httpx.Response(200,json={'code':0,'tenant_access_token':'test-token','expire':7200})
            return httpx.Response(200,json={'code':0})
        api=PlatformAPI(httpx.MockTransport(handle))
        try:
            await api.send({'platform':'feishu','config':{'app_id':'id'}},'secret',{'chat_id':'oc-test'},'hello')
            self.assertEqual(requests[-1].url.host,'open.feishu.cn')
            payload=json.loads(requests[-1].content)
            self.assertEqual(json.loads(payload['content']),{'text':'hello'})
            self.assertEqual(payload['receive_id'],'oc-test')
        finally: await api.close()

    async def test_dingtalk_webhook_is_restricted_and_expiry_does_not_use_old_url(self):
        api=PlatformAPI(httpx.MockTransport(lambda request:httpx.Response(200,json={'errcode':0})))
        binding={'platform':'dingtalk','config':{'app_id':'test','robot_code':''}}
        try:
            with self.assertRaises(ChannelError): await api.send(binding,'secret',{'webhook':'http://127.0.0.1/private','webhook_expires':99999999999},'text')
            with self.assertRaises(ChannelError): await api.send(binding,'secret',{'webhook':'https://oapi.dingtalk.com/test','webhook_expires':1},'text')
        finally: await api.close()


class SDKPayloadTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        # lark-oapi creates a module-level event loop even for model-only imports.
        import lark_oapi.ws.client as ws
        if not ws.loop.is_running():
            ws.loop.close()

    def test_feishu_actual_sdk_event_only_counts_this_bot_mention(self):
        from lark_oapi.api.im.v1 import P2ImMessageReceiveV1
        from service.channel_worker import normalize_feishu
        payload={'header':{'tenant_key':'tenant'}, 'event':{'sender':{'sender_id':{'open_id':'sender'},'sender_type':'user','tenant_key':'tenant'},'message':{'message_id':'message','chat_id':'chat','chat_type':'group','message_type':'text','content':json.dumps({'text':'@_user_1 hello'}),'mentions':[{'key':'@_user_1','id':{'open_id':'different-user'},'name':'Someone'}]}}}
        event=P2ImMessageReceiveV1(payload)
        normalized=normalize_feishu(event,'our-bot')
        self.assertFalse(normalized['mentioned'])
        payload['event']['message']['mentions'][0]['id']['open_id']='our-bot'
        normalized=normalize_feishu(P2ImMessageReceiveV1(payload),'our-bot')
        self.assertTrue(normalized['mentioned'])
        self.assertEqual(normalized['text'],'hello')
        self.assertEqual(normalized['tenant_id'],'tenant')

    def test_dingtalk_actual_sdk_payload_maps_staff_and_webhook_expiry(self):
        import dingtalk_stream
        from service.channel_worker import normalize_dingtalk
        payload={'msgId':'msg','senderStaffId':'staff','senderCorpId':'corp','conversationId':'group','conversationType':'2','isInAtList':True,'msgtype':'text','text':{'content':' hello '},'sessionWebhook':'https://oapi.dingtalk.com/reply','sessionWebhookExpiredTime':2000000000000}
        parsed=dingtalk_stream.ChatbotMessage.from_dict(payload)
        self.assertEqual(parsed.sender_staff_id,'staff')
        normalized=normalize_dingtalk(payload)
        self.assertEqual(normalized['sender_id'],'staff')
        self.assertTrue(normalized['mentioned'])
        self.assertTrue(normalized['group'])
        self.assertEqual(normalized['text'],'hello')
        self.assertEqual(normalized['webhook_expires'],2000000000)


class ChannelAPITests(unittest.TestCase):
    def setUp(self):
        import os
        self.temp=tempfile.TemporaryDirectory()
        root=Path(self.temp.name)
        self.store=StudioStore(root/'state.sqlite3',root)
        self.user,self.token=self.store.create_user('apitester','testpass123')
        self.other,self.other_token=self.store.create_user('apiother','testpass456')
        self.model=self.store.create_model_setting(self.user.id,'ollama','local','qwen3','http://127.0.0.1:11434/v1','',True)
        os.environ.setdefault('AGENTSCOPE_STATE_DB',str(root/'initial.sqlite3'))
        from service import main
        from fastapi.testclient import TestClient
        main.runtime=AgentScopeRuntime(self.store)
        main.capabilities=ConsoleCapabilities(self.store)
        main.runtime.capabilities=main.capabilities;main.capabilities.runtime=main.runtime
        main.runtime.channels=ChannelService(main.runtime,main.capabilities,FakeAPI())
        self.client=TestClient(main.app);self.client.__enter__()
        self.headers={'authorization':f'Bearer {self.token}'}
        self.other_headers={'authorization':f'Bearer {self.other_token}'}

    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.store._conn.close();self.temp.cleanup()

    def test_channel_apis_auth_manual_access_routing_and_secret_redaction(self):
        self.assertEqual(self.client.get('/console/channels').status_code,401)
        body={'name':'test bot','secret':'fixture-secret','config':{'app_id':'test-app','agent_id':'main','model_id':self.model.id}}
        response=self.client.put('/console/channels/feishu',headers=self.headers,json=body)
        self.assertEqual(response.status_code,200,response.text)
        binding=response.json()['binding']
        self.assertNotIn('fixture-secret',response.text)
        self.assertEqual(self.client.get('/console/channels',headers=self.other_headers).json()['bindings'],[])
        path=f"/console/channels/{binding['id']}"
        self.assertEqual(self.client.get(path+'/diagnostics',headers=self.other_headers).status_code,404)
        self.assertEqual(self.client.post(path+'/enable',headers=self.other_headers,json={}).status_code,400)
        added=self.client.post(path+'/access',headers=self.headers,json={'tenant_id':'tenant','sender_id':'actor','chat_id':'chat','is_group':True})
        self.assertEqual(added.status_code,200,added.text)
        access=added.json()['access'][0]
        revoked=self.client.put(path+'/access/'+access['id'],headers=self.headers,json={'status':'blocked'})
        self.assertEqual(revoked.json()['access'][0]['status'],'blocked')
        self.assertEqual(self.client.post(path+'/test-send',headers=self.headers,json={'target':'chat'}).status_code,400)
        self.assertTrue(self.client.post(path+'/validate',headers=self.headers,json={}).json()['ok'])
