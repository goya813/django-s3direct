import hashlib
import hmac
from collections import namedtuple

from django.conf import settings

# django-s3direct accesses AWS credentials from Django config and provides
# an optional ability to retrieve credentials from EC2 instance profile if
# AWS settings are set to None. This optional ability requires botocore,
# however dependency on botocore is not enforced as this a secondary
# method for retrieving credentials.
import boto3
from botocore.client import Config
try:
    from botocore.credentials import (InstanceMetadataProvider,
                                      InstanceMetadataFetcher)
except ImportError:
    InstanceMetadataProvider = None
    InstanceMetadataFetcher = None


def get_s3direct_destinations():
    """Returns s3direct destinations.

    NOTE: Don't use constant as it will break ability to change at runtime.
    """
    return getattr(settings, 'S3DIRECT_DESTINATIONS', None)


def get_key(key, file_name, dest, overridden_key_args=None):
    if hasattr(key, '__call__'):
        fn_args = [
            file_name,
        ]
        args = overridden_key_args or dest.get('key_args')
        if args:
            fn_args.append(args)
        object_key = key(*fn_args)
    elif key == '/':
        object_key = file_name
    else:
        object_key = '%s/%s' % (key.strip('/'), file_name)
    return object_key


def get_s3_presigned_post(bucket, key, acl, region, fileType, expires=3600):
    client = boto3.client('s3', region_name=region, config=Config(signature_version='s3v4'))
    return client.generate_presigned_post(
        Bucket=bucket,
        Key=key,
        Fields={"Content-Type": fileType, "acl": acl},
        Conditions=[{"Content-Type": fileType}, {"acl": acl}],
        ExpiresIn=expires
    )
