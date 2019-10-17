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
try:
    from botocore.credentials import (InstanceMetadataProvider,
                                      InstanceMetadataFetcher)
except ImportError:
    InstanceMetadataProvider = None
    InstanceMetadataFetcher = None

AWSCredentials = namedtuple('AWSCredentials',
                            ['token', 'secret_key', 'access_key'])


def get_at(index, t):
    try:
        value = t[index]
    except IndexError:
        value = None
    return value


def get_s3direct_destinations():
    """Returns s3direct destinations.

    NOTE: Don't use constant as it will break ability to change at runtime.
    """
    return getattr(settings, 'S3DIRECT_DESTINATIONS', None)


# AWS Signature v4 Key derivation functions. See:
# http://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html#signature-v4-examples-python


def sign(key, message):
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def get_aws_v4_signing_key(key, signing_date, region, service):
    datestamp = signing_date.strftime('%Y%m%d')
    date_key = sign(('AWS4' + key).encode('utf-8'), datestamp)
    k_region = sign(date_key, region)
    k_service = sign(k_region, service)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing


def get_aws_v4_signature(key, message):
    return hmac.new(key, message.encode('utf-8'), hashlib.sha256).hexdigest()


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


def get_aws_credentials():
    credentials = boto3.Session().get_credentials().get_frozen_credentials()
    if credentials.access_key and credentials.secret_key:
        return AWSCredentials(credentials.token, credentials.secret_key, credentials.access_key)
