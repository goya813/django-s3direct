import 'regenerator-runtime/runtime'
import Cookies from 'js-cookie';
import createHash from 'sha.js';
import Evaporate from 'evaporate';
import SparkMD5 from 'spark-md5';

import './css/bootstrap.css';
import './css/styles.css';

let uploadedImgCount = -1;
let uploadImgNum = -1;

const request = (method, url, data, headers, el) => {
  return new Promise((resolve, reject) => {
    let req = new XMLHttpRequest();
    req.open(method, url, true);

    Object.keys(headers).forEach(key => {
      req.setRequestHeader(key, headers[key]);
    });

    req.onload = () => {
      resolve({status: req.status, body: req.responseText});
    };

    req.onerror = req.onabort = () => {
      disableSubmit(false);
      error(el, 'Sorry, failed to upload file.');
    };

    req.send(data);
  })
};

const parseNameFromUrl = url => {
  return decodeURIComponent((url + '').replace(/\+/g, '%20'));
};

const parseJson = json => {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    data = null;
  }
  return data;
};

const updateProgressUploadedCount = (element, count, max) => {
  element.querySelector('.file-uploaded-num').innerHTML = `${count} / ${max} uploaded`;
};

const updateProgressBar = (element, progressRatio) => {
  const bar = element.querySelector('.bar');
  bar.style.width = Math.round(progressRatio * 100) + '%';
};

const error = (el, msg) => {
  el.className = 's3direct form-active';
  el.querySelector('.file-input').value = '';
  alert(msg);
};

let concurrentUploads = 0;

const disableSubmit = status => {
  const submitRow = document.querySelector('.submit-row');
  if (!submitRow) return;

  const buttons = submitRow.querySelectorAll(
    'input[type=submit],button[type=submit]'
  );

  if (status === true) concurrentUploads++;
  else concurrentUploads--;

  [].forEach.call(buttons, el => {
    el.disabled = concurrentUploads !== 0;
  });
};

const beginUpload = element => {
  disableSubmit(true);
  element.className = 's3direct progress-active';
};

const finishUpload = (element, endpoint, bucket, objectKey) => {
  const fileList = element.querySelector('.file-list');
  const value = element.querySelector('.file-value');
  const url = endpoint + '/' + bucket + '/' + objectKey;
  const fileName = parseNameFromUrl(url).split('/').pop()
  fileList.innerHTML += `<p><a class="file-link" target="_blank" href="${url}">${fileName}</a></p>`;

  if (value.value === '') {
    value.value += endpoint + '/' + bucket + '/' + objectKey;
  }
  else {
    value.value += ',' + endpoint + '/' + bucket + '/' + objectKey;
  }

  element.className = 's3direct link-active';
  element.querySelector('.bar').style.width = '0%';
  disableSubmit(false);

  uploadedImgCount++;
  updateProgressUploadedCount(element, uploadedImgCount, uploadedImgCount);
};

const computeMd5 = data => {
  return btoa(SparkMD5.ArrayBuffer.hash(data, true));
};

const computeSha256 = data => {
  return createHash('sha256')
    .update(data, 'utf-8')
    .digest('hex');
};

const getCsrfToken = element => {
  const cookieInput = element.querySelector('.csrf-cookie-name');
  const input = document.querySelector('input[name=csrfmiddlewaretoken]');
  const token = input ? input.value : Cookies.get(cookieInput.value);
  return token;
};

const generateAmzInitHeaders = (acl, serverSideEncryption, sessionToken) => {
  const headers = {};
  if (acl) headers['x-amz-acl'] = acl;
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;
  if (serverSideEncryption) {
    headers['x-amz-server-side-encryption'] = serverSideEncryption;
  }
  return headers;
};

const generateAmzCommonHeaders = sessionToken => {
  const headers = {};
  if (sessionToken) headers['x-amz-security-token'] = sessionToken;
  return headers;
};

const generateCustomAuthMethod = (element, signingUrl, dest) => {
  const getAwsV4Signature = async (
    _signParams,
    _signHeaders,
    stringToSign,
    signatureDateTime,
    _canonicalRequest
  ) => {
    const form = new FormData();
    const headers = { 'X-CSRFToken': getCsrfToken(element) };

    form.append('to_sign', stringToSign);
    form.append('datetime', signatureDateTime);
    form.append('dest', dest);

    const res = await request('POST', signingUrl, form, headers, element)
    const body = parseJson(res.body);
    switch (res.status) {
      case 200:
        return Promise.resolve(body.s3ObjKey);
        break;
      case 403:
      default:
        return Promise.reject(body.error);
        break;
    }
  };

  return getAwsV4Signature;
};

const initiateUpload = async (element, signingUrl, uploadParameters, file, dest) => {
  const createConfig = {
    customAuthMethod: generateCustomAuthMethod(element, signingUrl, dest),
    aws_key: uploadParameters.access_key_id,
    bucket: uploadParameters.bucket,
    aws_url: uploadParameters.endpoint,
    awsRegion: uploadParameters.region,
    computeContentMd5: true,
    cryptoMd5Method: computeMd5,
    cryptoHexEncodedHash256: computeSha256,
    partSize: 20 * 1024 * 1024,
    logging: true,
    allowS3ExistenceOptimization: uploadParameters.allow_existence_optimization,
    s3FileCacheHoursAgo: uploadParameters.allow_existence_optimization ? 12 : 0
  };

  const addConfig = {
    name: uploadParameters.object_key,
    file: file,
    contentType: file.type,
    xAmzHeadersCommon: generateAmzCommonHeaders(uploadParameters.session_token),
    xAmzHeadersAtInitiate: generateAmzInitHeaders(
        uploadParameters.acl,
        uploadParameters.server_side_encryption,
        uploadParameters.session_token
    ),
    progress: (progressRatio, stats) => {
      updateProgressBar(element, progressRatio);
    },
    warn: (warnType, area, msg) => {
      if (msg.includes('InvalidAccessKeyId')) {
        error(element, msg);
      }
    }
  };

  const optHeaders = {};

  if (uploadParameters.cache_control) {
    optHeaders['Cache-Control'] = uploadParameters.cache_control;
  }

  if (uploadParameters.content_disposition) {
    optHeaders['Content-Disposition'] = uploadParameters.content_disposition;
  }
  addConfig['notSignedHeadersAtInitiate'] = optHeaders;

  const evaporate = await Evaporate.create(createConfig);
  beginUpload(element);

  return evaporate.add(addConfig).then(
      s3Objkey => {
        finishUpload(
            element,
            uploadParameters.endpoint,
            uploadParameters.bucket,
            s3Objkey
        );
        Promise.resolve();
      },
      reason => {
        return error(element, reason);
      }
  )
};

const checkFileAndInitiateUpload = async event => {
  const element = event.target.parentElement;
  const files = element.querySelector('.file-input').files;
  const dest = element.querySelector('.file-dest').value;
  const keyArgs = element.querySelector('.file-key_args').value;
  const destCheckUrl = element.getAttribute('data-policy-url');
  const signerUrl = element.getAttribute('data-signing-url');
  const headers = { 'X-CSRFToken': getCsrfToken(element) };

  uploadedImgCount = 0;
  uploadImgNum = files.length;
  updateProgressUploadedCount(element, uploadedImgCount, uploadedImgCount);

  for (let i = 0; i < files.length; i++) {
    const form = new FormData();
    form.append('dest', dest);
    form.append('keyArgs', keyArgs);
    form.append('name', files[i].name);
    form.append('type', files[i].type);
    form.append('size', files[i].size);

    const res = await request('POST', destCheckUrl, form, headers, element);
    const uploadParameters = parseJson(res.body);
    switch (res.status) {
      case 200:
        await initiateUpload(element, signerUrl, uploadParameters, files[i], dest);
        break;
      case 400:
      case 403:
      case 500:
        error(element, uploadParameters.error);
        break;
      default:
        error(element, 'Sorry, could not get upload URL.');

    }
  }
};

const addHandlers = el => {
  const value = el.querySelector('.file-value');
  const input = el.querySelector('.file-input');
  const status = value.value === '' ? 'form' : 'link';

  el.className = 's3direct ' + status + '-active';
  input.addEventListener('change', checkFileAndInitiateUpload, false);
};

document.addEventListener('DOMContentLoaded', event => {
  [].forEach.call(document.querySelectorAll('.s3direct'), addHandlers);
});

document.addEventListener('DOMNodeInserted', event => {
  if (event.target.tagName) {
    const el = event.target.querySelectorAll('.s3direct');
    [].forEach.call(el, (element, index, array) => {
      addHandlers(element);
    });
  }
});
