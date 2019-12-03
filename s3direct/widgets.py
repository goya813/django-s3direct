from __future__ import unicode_literals

import json
import os
from django.forms import widgets
from django.utils.safestring import mark_safe
try:
    from django.urls import reverse
except ImportError:
    # Django <1.10 compliance
    from django.core.urlresolvers import reverse
from django.template.loader import render_to_string
from django.utils.http import urlunquote_plus
from django.conf import settings


class S3DirectWidget(widgets.TextInput):
    class Media:
        js = ('s3direct/dist/index.js', )
        css = {'all': ('s3direct/dist/index.css', )}

    def __init__(self, *args, **kwargs):
        self.dest = kwargs.pop('dest', None)
        self.key_args = kwargs.pop('key_args', None)
        super(S3DirectWidget, self).__init__(*args, **kwargs)

    def render(self, name, value, **kwargs):
        csrf_cookie_name = getattr(settings, 'CSRF_COOKIE_NAME', 'csrftoken')
        value = value or ''
        files = []

        if value != '':
            for file_url in [item.strip() for item in value.split(',')]:
                files.append({
                    'url': file_url,
                    'name': os.path.basename(urlunquote_plus(file_url))
                })

        ctx = {
            'presigned_url_endpoint': reverse('presigned-url'),
            'dest': self.dest,
            'name': name,
            'csrf_cookie_name': csrf_cookie_name,
            'files': files,
            'value': value,
        }

        if self.key_args:
            try:
                ctx.update(key_args=json.dumps(self.key_args))
            except Exception:
                raise RuntimeError('widget argument key_args is not json-serializable')

        return mark_safe(
            render_to_string(
                os.path.join('s3direct', 's3direct-widget.tpl'), ctx))
