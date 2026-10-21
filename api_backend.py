"""Root entrypoint makes Vercel use the demo pyproject dependencies."""
from service.main import app

__all__ = ['app']
