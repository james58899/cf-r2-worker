function parseRange(encoded) {
    if (encoded === null) {
        return
    }

    const parts = encoded.split('-')
    if (parts.length !== 2) {
        throw new Error('Not supported to skip specifying the beginning/ending byte at this time')
    }

    return {
        offset: Number(parts[0]),
        length: Number(parts[1]) + 1 - Number(parts[0]),
    }
}

function objectNotFound(objectName) {
    return new Response(`<html><body>Object "<b>${objectName}</b>" not found</body></html>`, {
        status: 404,
        headers: {
            'content-type': 'text/html; charset=UTF-8'
        }
    })
}

async function handleRequest(event) {
    const request = event.request;
    const url = new URL(request.url);
    const objectName = url.pathname.slice(1);

    if (objectName === '') {
        return new Response(undefined, { status: 400 })
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
        // Cache matching
        const cache = caches.default
        const cacheKey = new Request(url.toString(), {
            headers: request.headers,
            method: 'GET' // Make HEAD requests cacheable
        })
        let response = await cache.match(cacheKey)
        if (response) return response

        const object = await BUCKET.get(objectName, { onlyIf: request.headers })

        if (!object) {
            return objectNotFound(objectName)
        }

        const headers = new Headers()
        headers.set('last-modified', object.uploaded.toUTCString())
        headers.set('etag', object.httpEtag)
        if (object.httpMetadata.contentType) headers.set('content-type', object.httpMetadata.contentType)
        if (object.httpMetadata.contentLanguage) headers.set('content-language', object.httpMetadata.contentLanguage)
        if (object.httpMetadata.contentDisposition) headers.set('content-disposition', object.httpMetadata.contentDisposition)
        if (object.httpMetadata.contentEncoding) headers.set('content-encoding', object.httpMetadata.contentEncoding)
        if (object.httpMetadata.cacheControl) headers.set('cache-control', object.httpMetadata.cacheControl)

        if (object.body) {
            response = new Response(object.body, { headers })
            // Cache response
            event.waitUntil(cache.put(cacheKey, response.clone()));
        } else {
            response = new Response(object.body, { status: 304, headers })
        }

        if (request.method === 'HEAD') {
            headers.set('content-length', object.size)
            return new Response(null, { headers })
        }

        return response;
    }

    return new Response(`Unsupported method`, { status: 400 })
}

addEventListener('fetch', event => {
    try {
        return event.respondWith(handleRequest(event));
    } catch (e) {
        return event.respondWith(new Response('Error thrown ' + e.message));
    }
});