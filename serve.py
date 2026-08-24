import http.server
import socketserver
import functools
import os

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PORT = 8934

Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIRECTORY)

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReusableTCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {DIRECTORY} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
