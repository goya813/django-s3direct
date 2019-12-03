import json
from django.conf import settings
from django.http import (HttpResponse, HttpResponseBadRequest,
                         HttpResponseForbidden, HttpResponseNotFound,
                         HttpResponseServerError)
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST
try:
    from urllib.parse import unquote
except ImportError:
    from urlparse import unquote
from .utils import get_s3direct_destinations, get_key, get_s3_presigned_post


@csrf_protect
@require_POST
def get_presigned_url(request):
    """Authorises user and validates given file properties."""
    file_name = request.POST['name']
    file_type = request.POST['type']
    file_size = int(request.POST['size'])
    key_args = request.POST.get('keyArgs')

    dest = get_s3direct_destinations().get(
        request.POST.get('dest', None), None)
    if not dest:
        resp = json.dumps({'error': 'File destination does not exist.'})
        return HttpResponseNotFound(resp, content_type='application/json')

    auth = dest.get('auth')
    if auth and not auth(request.user):
        resp = json.dumps({'error': 'Permission denied.'})
        return HttpResponseForbidden(resp, content_type='application/json')

    allowed = dest.get('allowed')
    if (allowed and file_type not in allowed) and allowed != '*':
        resp = json.dumps({'error': 'Invalid file type (%s).' % file_type})
        return HttpResponseBadRequest(resp, content_type='application/json')

    cl_range = dest.get('content_length_range')
    if (cl_range and not cl_range[0] <= file_size <= cl_range[1]):
        msg = 'Invalid file size (must be between %s and %s bytes).'
        resp = json.dumps({'error': (msg % cl_range)})
        return HttpResponseBadRequest(resp, content_type='application/json')

    key = dest.get('key')
    if not key:
        resp = json.dumps({'error': 'Missing destination path.'})
        return HttpResponseServerError(resp, content_type='application/json')

    if key_args:
        try:
            key_args = json.loads(key_args)
        except Exception:
            resp = json.dumps({'error': 'Malformed key_args override defined on widget, make sure it\'s json serializable'})
            return HttpResponseServerError(resp, content_type='application/json')

    bucket = dest.get('bucket',
                      getattr(settings, 'AWS_STORAGE_BUCKET_NAME', None))
    if not bucket:
        resp = json.dumps({'error': 'S3 bucket config missing.'})
        return HttpResponseServerError(resp, content_type='application/json')

    region = dest.get('region', getattr(settings, 'AWS_S3_REGION_NAME', None))
    if not region:
        resp = json.dumps({'error': 'S3 region config missing.'})
        return HttpResponseServerError(resp, content_type='application/json')

    endpoint = dest.get('endpoint',
                        getattr(settings, 'AWS_S3_ENDPOINT_URL', None))
    if not endpoint:
        resp = json.dumps({'error': 'S3 endpoint config missing.'})
        return HttpResponseServerError(resp, content_type='application/json')

    object_key = get_key(key, file_name, dest, key_args)
    acl = dest.get('acl') or 'public_read'
    presigned_post = get_s3_presigned_post(bucket, object_key, acl, region, file_type)

    content = {
        'url': presigned_post['url'],
        'fields': presigned_post['fields'],
        'object_key': object_key,
        'bucket': bucket,
        'endpoint': endpoint
    }

    resp = json.dumps(content)
    return HttpResponse(resp, content_type='application/json')
