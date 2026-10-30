import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from service.store import StudioStore
from service.web_search import resolve_search_key


class ModelEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = StudioStore(root / 'state.db', root)
        self.user, _ = self.store.create_user('envowner', 'testing123')
        self.other, _ = self.store.create_user('envother', 'testing123')
        self.model = self.store.create_model_setting(
            self.user.id, 'deepseek', 'Environment model', 'deepseek-flash',
            'https://api.deepseek.com', 'initial-fixture', True,
        )
        self.store._conn.execute(
            "UPDATE model_settings SET api_key='@environment' WHERE id=?", (self.model.id,),
        )
        self.store._conn.commit()
        self.variable = f'AGENTSCOPE_MODEL_API_KEY_{self.model.id.upper()}'

    def tearDown(self):
        self.store._conn.close()
        self.temp.cleanup()

    def test_resolution_search_and_update_keep_reference_and_account_scope(self):
        with patch.dict(os.environ, {self.variable: 'environment-fixture-secret'}):
            self.assertEqual(self.store.get_model_setting(self.user.id, self.model.id).api_key,
                             'environment-fixture-secret')
            self.assertEqual(resolve_search_key(self.store, self.user.id, self.model.id),
                             'environment-fixture-secret')
            self.assertIsNone(self.store.get_model_setting(self.other.id, self.model.id))
            with self.assertRaises(ValueError):
                resolve_search_key(self.store, self.other.id, self.model.id)
            public = self.store.list_model_settings(self.user.id)[0]
            self.assertTrue(public['hasApiKey'])
            self.assertNotIn('environment-fixture-secret', str(public))
            self.store.update_model_setting(self.user.id, self.model.id, 'deepseek',
                                            'Renamed', 'deepseek-flash',
                                            'https://api.deepseek.com', '')
            self.assertEqual(self.store._conn.execute(
                'SELECT api_key FROM model_settings WHERE id=?', (self.model.id,),
            ).fetchone()[0], '@environment')

    def test_missing_environment_fails_closed_without_global_fallback(self):
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': 'unrelated-server-secret'}):
            os.environ.pop(self.variable, None)
            self.assertFalse(self.store.list_model_settings(self.user.id)[0]['hasApiKey'])
            with self.assertRaisesRegex(ValueError, '环境凭据'):
                self.store.get_model_setting(self.user.id, self.model.id)
