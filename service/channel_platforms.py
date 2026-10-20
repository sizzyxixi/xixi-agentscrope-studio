"""Platform HTTP operations. Credentials and SDK callbacks stay outside the LLM."""
from __future__ import annotations
import json
import time
from urllib.parse import urlparse
import httpx


class ChannelError(ValueError):
    pass


class DeliveryUnknown(ChannelError):
    """A network failure after sending may already have reached the recipient."""


class RateLimited(ChannelError):
    pass


class PlatformAPI:
    def __init__(self, transport=None):
        self.http = httpx.AsyncClient(timeout=15, transport=transport, follow_redirects=False)
        self.tokens = {}

    async def close(self):
        await self.http.aclose()

    async def request(self, url, *, sending=False, **kwargs):
        try:
            response = await self.http.request(kwargs.pop("method", "POST"), url, **kwargs)
        except httpx.HTTPError as error:
            if sending:
                raise DeliveryUnknown('发送结果不明，请核对平台会话；未自动重复发送。') from error
            raise ChannelError('无法连接开放平台，请检查网络。') from error
        if response.status_code == 429:
            raise RateLimited('平台限流，请稍后重试。')
        if response.status_code >= 500 and sending:
            raise DeliveryUnknown('平台返回服务异常，发送结果需人工核对。')
        if response.status_code >= 400:
            raise ChannelError(f'平台请求失败（HTTP {response.status_code}），请检查应用权限与发布状态。')
        try:
            data = response.json()
        except ValueError:
            raise ChannelError('平台未返回有效响应。') from None
        code = data.get('code', data.get('errcode', 0))
        if code not in (0, '0', None):
            safe_code = ''.join(char for char in str(code)[:40] if char.isalnum() or char in '._-')
            raise ChannelError(f'平台拒绝请求（{safe_code}），请检查凭证、权限、事件订阅和应用可用范围。')
        return data

    async def token(self, platform, app_id, secret, *, force=False):
        key = (platform, app_id)
        cached = self.tokens.get(key)
        if not force and cached and cached[1] > time.time():
            return cached[0]
        if platform == 'feishu':
            data = await self.request('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', json={'app_id': app_id, 'app_secret': secret})
            token, ttl = data.get('tenant_access_token'), data.get('expire', 3600)
        else:
            data = await self.request('https://api.dingtalk.com/v1.0/oauth2/accessToken', json={'appKey': app_id, 'appSecret': secret})
            token, ttl = data.get('accessToken'), data.get('expireIn', 3600)
        if not token:
            raise ChannelError('凭证校验失败：平台未签发访问令牌。')
        self.tokens[key] = (token, time.time() + max(1, int(ttl) - 120))
        return token

    def invalidate(self, platform, app_id):
        self.tokens.pop((platform, app_id), None)

    async def send(self, binding, secret, route, text):
        config = binding['config']
        platform = binding['platform']
        if platform == 'dingtalk' and route.get('webhook') and route.get('webhook_expires', 0) > time.time():
            url = urlparse(route['webhook'])
            if url.scheme != 'https' or url.hostname not in {'oapi.dingtalk.com', 'api.dingtalk.com'} or url.username or url.password or url.port not in (None, 443):
                raise ChannelError('平台返回了不受支持的回复地址。')
            payload = {'msgtype': 'text', 'text': {'content': text}}
            if route.get('group') and config.get('at_sender', True) and route.get('sender_id'):
                payload['at'] = {'atUserIds': [route['sender_id']], 'isAtAll': False}
            return await self.request(route['webhook'], sending=True, json=payload)
        token = await self.token(platform, config['app_id'], secret)
        if platform == 'feishu':
            target = route.get('chat_id')
            if not target:
                raise ChannelError('缺少飞书 chat_id。')
            payload = {'receive_id': target, 'msg_type': 'text', 'content': json.dumps({'text': text}, ensure_ascii=False)}
            return await self.request('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', sending=True, headers={'Authorization': f'Bearer {token}'}, json=payload)
        robot = config.get('robot_code', '').strip()
        if not robot:
            raise ChannelError('临时回复地址已失效或不可用，请配置 Robot Code 和机器人发送权限。')
        payload = {'robotCode': robot, 'msgKey': 'sampleText', 'msgParam': json.dumps({'content': text}, ensure_ascii=False)}
        if route.get('group'):
            payload['openConversationId'] = route['chat_id']
            endpoint = 'groupMessages/send'
        else:
            payload['userIds'] = [route['sender_id']]
            endpoint = 'oToMessages/batchSend'
        return await self.request(f'https://api.dingtalk.com/v1.0/robot/{endpoint}', sending=True, headers={'x-acs-dingtalk-access-token': token}, json=payload)
