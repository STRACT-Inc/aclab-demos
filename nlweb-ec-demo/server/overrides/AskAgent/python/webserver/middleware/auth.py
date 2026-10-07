# ACLAB override P4 of
# AskAgent/python/webserver/middleware/auth.py at nlweb-ai/NLWeb b423f15.
#
# Why this file replaces upstream: in production mode the upstream middleware accepts any
# non-empty bearer token ("If JWT validation fails, allow the token through for backward
# compatibility") and leaves /ask public. This demo puts the server behind a proxy that holds a
# shared secret. When NLWEB_SHARED_SECRET is set, every request except the health and static
# endpoints must carry exactly that bearer token; /ask is no longer public. When the variable is
# unset, the upstream behaviour is unchanged (local experiments).

"""Authentication middleware for aiohttp server"""

import hmac
import logging
import os
import time

import jwt
from aiohttp import web

from core.config import CONFIG
from core.utils.utils import sanitize_log

logger = logging.getLogger(__name__)

SHARED_SECRET_ENV = "NLWEB_SHARED_SECRET"
LOOPBACK_REMOTES = {'127.0.0.1', '::1'}

# Endpoints that stay open even when the shared secret is enforced (health checks, static UI)
ALWAYS_PUBLIC: set[str] = {'/', '/health', '/ready'}

# Public endpoints that don't require authentication (upstream behaviour, no shared secret)
PUBLIC_ENDPOINTS: set[str] = {
    '/',
    '/health',
    '/ready',
    '/oauth/callback',
    '/api/oauth/config',
    '/who',
    '/sites',
    # Static files
    '/static',
    '/html',
    # Allow public access to ask endpoint for now (can be changed)
    '/ask'
}


def _is_static(path: str) -> bool:
    return path.startswith('/static/') or path.startswith('/html/') or path == '/favicon.ico'


def _bearer(request: web.Request) -> str | None:
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def _unauthorized() -> web.Response:
    return web.json_response(
        {'error': 'Authentication required', 'type': 'auth_required'},
        status=401,
        headers={'WWW-Authenticate': 'Bearer'}
    )


@web.middleware
async def auth_middleware(request: web.Request, handler):
    """Handle authentication for protected endpoints"""

    path = request.path

    # ACLAB: shared-secret mode. Exact match only, constant-time comparison.
    # Loopback callers are the server's own who_and_search / multi-site path (hardcoded
    # http://localhost:8000); inside the container nothing else can reach that address.
    shared_secret = os.environ.get(SHARED_SECRET_ENV)
    if shared_secret:
        if path in ALWAYS_PUBLIC or _is_static(path) or request.remote in LOOPBACK_REMOTES:
            return await handler(request)
        token = _bearer(request)
        if not token or not hmac.compare_digest(token, shared_secret):
            logger.warning(f"Rejected request without valid shared secret: {sanitize_log(path)}")
            return _unauthorized()
        request['auth_token'] = token
        request['user'] = {
            'id': 'aclab_proxy',
            'name': 'ACLAB proxy',
            'email': None,
            'provider': 'shared_secret',
            'authenticated': True,
            'token': token
        }
        return await handler(request)

    # Upstream behaviour below (unchanged)
    is_public = path in PUBLIC_ENDPOINTS or _is_static(path)

    if is_public:
        return await handler(request)

    auth_token = _bearer(request)

    # Check cookie (for web UI)
    if not auth_token:
        auth_cookie = request.cookies.get('auth_token')
        if auth_cookie:
            auth_token = auth_cookie

    # Check query parameter (for SSE connections that can't set headers)
    if not auth_token and request.method == 'GET':
        auth_token = request.query.get('auth_token')

    config = request.app.get('config', {})
    mode = config.get('mode', 'production')

    if not auth_token and mode == 'development':
        logger.debug(f"No auth token for {sanitize_log(path)}, allowing in development mode")
        request['user'] = {'id': 'dev_user', 'authenticated': False}
        return await handler(request)

    if not auth_token:
        logger.warning(f"No auth token provided for protected endpoint: {sanitize_log(path)}")
        return _unauthorized()

    request['auth_token'] = auth_token

    user_id = 'authenticated_user'
    user_name = 'User'
    user_email = None
    provider = None

    if auth_token.startswith('e2e_'):
        parts = auth_token.split('_')
        if len(parts) >= 2:
            if len(parts) == 3 and parts[1] in ['test', 'token']:
                user_id = parts[2]
            elif len(parts) == 3:
                user_id = f"{parts[1]}_{parts[2]}"
            else:
                user_id = parts[1]
            user_name = user_id.replace('_', ' ').title()
    elif auth_token.startswith('test_token_'):
        user_id = auth_token.replace('test_token_', '')
        user_name = f"Test User {user_id}"
    else:
        try:
            jwt_secret = CONFIG.oauth_session_secret if hasattr(CONFIG, 'oauth_session_secret') else None
            if jwt_secret:
                payload = jwt.decode(auth_token, jwt_secret, algorithms=['HS256'])

                if payload.get('exp', 0) < time.time():
                    return web.json_response(
                        {'error': 'Token expired', 'type': 'token_expired'},
                        status=401
                    )

                user_id = payload.get('user_id', 'authenticated_user')
                user_name = payload.get('name', 'User')
                user_email = payload.get('email')
                provider = payload.get('provider')

        except jwt.InvalidTokenError as e:
            # Upstream keeps letting the token through here. Set NLWEB_SHARED_SECRET to avoid this path.
            logger.debug(f"JWT validation failed for token: {e}")

    request['user'] = {
        'id': user_id,
        'name': user_name,
        'email': user_email,
        'provider': provider,
        'authenticated': True,
        'token': auth_token
    }

    return await handler(request)
