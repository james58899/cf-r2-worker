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

    if (request.method === 'GET') {
        const cacheKey = new Request(url.toString(), request)
        const cache = caches.default
        let response = await cache.match(cacheKey)

        // Cache hit
        if (response) return response

        const object = await BUCKET.get(objectName)

        if (!object) {
            return objectNotFound(objectName)
        }

        const headers = new Headers()
        headers.set('etag', object.httpEtag)
        headers.set('content-type', object.httpMetadata.contentType)
        response = new Response(object.body, {
            headers,
        })

        // Cache response
        event.waitUntil(cache.put(cacheKey, response.clone()));

        return response;
    } else if (request.method === 'HEAD') {
        const object = await BUCKET.head(objectName, {
            onlyIf: request.headers,
        })

        if (!object) {
            return objectNotFound(objectName)
        }
        const headers = new Headers()
        headers.set('etag', object.httpEtag)
        headers.set('content-type', object.httpMetadata.contentType)
        return new Response(null, {
            headers,
        })
    }

    return new Response(`Unsupported method`, {
        status: 400
    })
}

addEventListener('fetch', event => {
    try {
        return event.respondWith(handleRequest(event));
    } catch (e) {
        return event.respondWith(new Response('Error thrown ' + e.message));
    }
});