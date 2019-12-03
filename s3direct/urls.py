from django.conf.urls import url
from s3direct.views import get_presigned_url

urlpatterns = [
    url('^get_presigned_url/', get_presigned_url, name='presigned-url')
]
