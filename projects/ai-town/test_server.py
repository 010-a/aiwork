import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import server


class TownTests(unittest.TestCase):
    def test_events_change_resources_and_do_not_mutate_input(self):
        with patch.dict(os.environ, {'TOWN_API_KEY': ''}):
            state = server.initial()
            ordinary = server.advance(state)['state']
            outage = server.advance(state, 'power')['state']
            harvest = server.advance(state, 'harvest')['state']
            self.assertLess(outage['resources']['power'], ordinary['resources']['power'])
            self.assertGreater(harvest['resources']['food'], ordinary['resources']['food'])
            self.assertEqual(state['turn'], 0)
            self.assertEqual(len(outage['residents'][0]['memory']), 1)
            self.assertEqual(len(outage['log']), 7)

    def test_long_simulation_is_bounded(self):
        with patch.dict(os.environ, {'TOWN_API_KEY': ''}):
            state = server.initial()
            for i in range(45):
                state = server.advance(state, ['power', 'rumor', 'harvest', 'festival'][i % 4])['state']
            server.validate(state)
            self.assertEqual(state['day'], 12)
            self.assertEqual(len(state['residents'][0]['memory']), 8)
            self.assertEqual(len(state['log']), 150)
            self.assertTrue(all(0 <= v <= 100 for v in state['resources'].values()))

    def test_ai_transport_and_explicit_fallback(self):
        class Model(BaseHTTPRequestHandler):
            malformed = False
            def log_message(self, *args):
                pass
            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                self.server.seen = payload
                content = 'invalid' if self.malformed else json.dumps({p[0]: '我们一起解决吧。' for p in server.PEOPLE})
                body = json.dumps({'choices': [{'message': {'content': content}}]}).encode()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)
        model = ThreadingHTTPServer(('127.0.0.1', 0), Model)
        worker = threading.Thread(target=model.serve_forever, daemon=True)
        worker.start()
        try:
            with patch.dict(os.environ, {'TOWN_API_KEY': 'test-only', 'TOWN_API_BASE': f'http://127.0.0.1:{model.server_port}/v1'}):
                result = server.advance(server.initial(), 'power')
                self.assertEqual(result['mode'], 'ai')
                self.assertEqual(result['state']['log'][-1]['text'], '我们一起解决吧。')
                self.assertEqual(model.seen['messages'][0]['role'], 'system')
                Model.malformed = True
                result = server.advance(server.initial())
                self.assertEqual(result['mode'], 'demo')
                self.assertTrue(result['warning'])
        finally:
            model.shutdown()
            model.server_close()

    def test_http_errors_and_functional_request(self):
        http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=http.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{http.server_port}'
        try:
            with urlopen(base + '/api/status') as response:
                state = json.load(response)['initial']
            with patch.dict(os.environ, {'TOWN_API_KEY': ''}):
                with urlopen(Request(base + '/api/step', data=json.dumps({'state': state, 'event': 'harvest'}).encode(), headers={'Content-Type': 'application/json'})) as response:
                    result = json.load(response)
                self.assertEqual(result['state']['turn'], 1)
                self.assertEqual(result['mode'], 'demo')
            for data in ({'state': state, 'event': 'x' * 201}, {'state': None}, []):
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + '/api/step', data=json.dumps(data).encode()))
                self.assertEqual(error.exception.code, 400)
        finally:
            http.shutdown()
            http.server_close()


if __name__ == '__main__':
    unittest.main()
