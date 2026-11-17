"""Authenticated embedding of the upstream AgentScope Service configuration UI API."""
from contextlib import asynccontextmanager
import re

from fastapi import Header, HTTPException
from starlette.responses import JSONResponse
from agentscope.app import create_app
from agentscope.app.deps import get_current_user_id
from agentscope.app.message_bus import InMemoryMessageBus
from agentscope.app.workspace_manager import LocalWorkspaceManager
from agentscope.app.rag.knowledge_base_manager import CollectionPerKbManager
from agentscope.app.rag.blob_store import LocalBlobStore
from agentscope.app._service._download_token import verify_download_token
from agentscope.rag import QdrantStore, TextParser, PDFParser, WordParser, ExcelParser, PPTParser

from .platform_catalog import PLATFORM_OWNER, PlatformCatalog, is_platform_admin


def build_official_service(store, require_user):
    catalog = PlatformCatalog(store)
    knowledge_root = store.db_path.parent / 'official-knowledge'
    # Official KB metadata lives in the official SQL schema; documents/vectors
    # use their own persistent directory, separate from personal knowledge.
    knowledge = CollectionPerKbManager(
        storage=catalog.storage,
        vector_store=QdrantStore(path=str(knowledge_root / 'vectors')),
    )
    app = create_app(
        storage=catalog.storage,
        message_bus=InMemoryMessageBus(),
        workspace_manager=LocalWorkspaceManager(basedir=str(store.db_path.parent / 'official-workspaces')),
        knowledge_base_manager=knowledge,
        blob_store=LocalBlobStore(knowledge_root / 'blobs'),
        knowledge_parsers=[TextParser(), PDFParser(), WordParser(), ExcelParser(), PPTParser()],
        # The existing runtime owns customer schedules and channels. This
        # index worker handles only documents in the separate official store.
        enable_scheduler=False,
        enable_channel_worker=False,
        enable_index_worker=True,
        title='XIXI · AgentScope Service',
    )

    async def administrator(authorization: str | None = Header(default=None)):
        user = require_user(authorization)
        if not is_platform_admin(user):
            raise HTTPException(403, '仅平台管理员可访问服务配置。')
        return PLATFORM_OWNER

    # Never trust the upstream example's caller-supplied X-User-ID header.
    app.dependency_overrides[get_current_user_id] = administrator

    @app.middleware('http')
    async def protect_all_routes(request, call_next):
        try:
            authorization = request.headers.get('authorization')
            route = request.scope['path'].removeprefix(request.scope.get('root_path', '')).rstrip('/')
            document = re.fullmatch(r'/knowledge_bases/([^/]+)/documents/([^/]+)', route)
            token = request.query_params.get('token')
            if not authorization and request.method == 'GET' and token and (document or route == '/workspace/files'):
                # Native previews cannot send a Bearer header. Accept only the
                # upstream signature, bound to this exact resource and owner.
                try:
                    owner = verify_download_token(app.state.download_secret, token, f'kb/{document[1]}/{document[2]}') if document else app.state.workspace_service.verify_download_token(token, request.query_params.get('path', ''))
                except ValueError as error:
                    raise HTTPException(401, '文件访问凭证无效或已过期。') from error
                if owner != PLATFORM_OWNER:
                    raise HTTPException(401, '文件访问凭证无效或已过期。')
            else:
                await administrator(authorization)
        except HTTPException as error:
            return JSONResponse({'detail': error.detail}, status_code=error.status_code)
        # A few upstream file routes read this header directly instead of the
        # overridden dependency. Supply it only after authentication above.
        request.scope['headers'] = [(key, value) for key, value in request.scope['headers'] if key.lower() != b'x-user-id'] + [(b'x-user-id', PLATFORM_OWNER.encode())]
        if request.method == 'DELETE' and request.url.path.rstrip('/').endswith('/agent/main'):
            return JSONResponse({'detail': '默认助手可以编辑，但不能删除。'}, status_code=409)
        return await call_next(request)

    @app.get('/platform/access')
    async def access(authorization: str | None = Header(default=None)):
        await administrator(authorization)
        user = require_user(authorization)
        return {'username': user.username, 'owner_id': PLATFORM_OWNER, 'agentscope_version': app.version}

    @asynccontextmanager
    async def lifecycle():
        # Starlette does not invoke the lifespan of a mounted sub-application.
        # Enter it explicitly, before any market/configuration requests run.
        await catalog.prepare_schema()
        try:
            async with app.router.lifespan_context(app):
                await catalog.seed()
                yield
        finally:
            await catalog.close()

    return app, catalog, lifecycle
