import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

const soup2 = Soup.MAJOR_VERSION === 2;

function collectRequest(msg) {
    const method = soup2 ? msg.method : msg.get_method();
    const uri = msg.get_uri();
    const path = uri?.get_path() ?? '/';
    const headers = {};
    const requestHeaders = soup2 ? msg.request_headers : msg.get_request_headers();
    requestHeaders.foreach((name, value) => {
        headers[name.toLowerCase()] = value;
    });
    let bodyBytes = new Uint8Array(0);
    const reqBody = soup2 ? msg.request_body : msg.get_request_body();
    const flat = reqBody?.flatten?.();
    const data = soup2 ? flat?.get_as_bytes()?.get_data() : flat?.get_data?.();
    if (data)
        bodyBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return {method, path, headers, bodyBytes};
}

function writeResponse(msg, r) {
    if (soup2)
        msg.set_status(r.status ?? 200);
    else
        msg.set_status(r.status ?? 200, null);
    const respHeaders = soup2 ? msg.response_headers : msg.get_response_headers();
    let contentType = null;
    if (r.headers) {
        for (const [k, v] of Object.entries(r.headers)) {
            if (k.toLowerCase() === 'content-type')
                contentType = String(v);
            else
                respHeaders.append(k, String(v));
        }
    }
    let body = r.body ?? '';
    if (typeof body === 'string')
        body = new TextEncoder().encode(body);
    // libsoup3 asserts content_type != NULL when body is non-empty.
    if (body.length > 0 && contentType === null)
        contentType = 'application/octet-stream';
    msg.set_response(contentType, Soup.MemoryUse.COPY, body);
}

export function startServer(handler) {
    const server = new Soup.Server({});
    server.add_handler(null, (srv, msg /*, path, query */) => {
        let r;
        try {
            r = handler(collectRequest(msg)) ?? {};
        } catch (e) {
            r = {status: 500, body: `handler threw: ${e?.message ?? e}`};
        }
        if (r.delayMs && r.delayMs > 0) {
            srv.pause_message(msg);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, r.delayMs, () => {
                writeResponse(msg, r);
                srv.unpause_message(msg);
                return GLib.SOURCE_REMOVE;
            });
        } else {
            writeResponse(msg, r);
        }
    });

    server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
    const uris = server.get_uris();
    if (!uris || uris.length === 0) {
        server.disconnect();
        return Promise.reject(new Error('startServer: no listening URI'));
    }
    const uri = soup2 ? uris[0].to_string(false) : uris[0].to_string();
    const url = uri.replace(/\/$/, '');

    return Promise.resolve({
        url,
        stop() {
            server.disconnect();
        },
    });
}
