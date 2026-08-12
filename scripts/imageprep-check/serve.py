import http.server, socketserver, os

os.chdir("/tmp/iptest")


class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        with open("/tmp/iptest/RESULT.txt", "wb") as f:
            f.write(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(("", 8899), H).serve_forever()
