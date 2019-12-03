import 'regenerator-runtime/runtime'
import Cookies from 'js-cookie';
const axios = require('axios');

import './css/bootstrap.css';
import './css/styles.css';

let uploadedImgCount = -1;
let uploadImgNum = -1;
let concurrentUploads = 0;

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

const finishUpload = (element, endpoint, bucket, objectKey, fileName) => {
  const fileList = element.querySelector('.file-list');
  const value = element.querySelector('.file-value');
  const url = endpoint + '/' + bucket + '/' + objectKey;
  fileList.innerHTML += `<p>${fileName}</p>`;

  if (value.value === '') {
    value.value += endpoint + '/' + bucket + '/' + objectKey;
  }
  else {
    value.value += ',' + endpoint + '/' + bucket + '/' + objectKey;
  }

  element.className = 's3direct link-active';
  element.querySelector('.bar').style.width = '0%';

  uploadedImgCount++;
  updateProgressUploadedCount(element, uploadedImgCount, uploadImgNum);
  if (uploadedImgCount === uploadImgNum) {
    disableSubmit(false);
  }
};

const getCsrfToken = element => {
  const cookieInput = element.querySelector('.csrf-cookie-name');
  const input = document.querySelector('input[name=csrfmiddlewaretoken]');
  const token = input ? input.value : Cookies.get(cookieInput.value);
  return token;
};

async function uploadFileToS3(element, uploadParameters, file, dest) {
  const postData = new FormData();
  Object.keys(uploadParameters.fields).forEach((key) => {
    postData.append(key, uploadParameters.fields[key]);
  });

  postData.append('file', file);
  await axios({
    method: 'post',
    url: uploadParameters.url,
    data: postData,
    onUploadProgress: (progressEvent) => {
      updateProgressBar(element, progressEvent.loaded / progressEvent.total);
    }
  });

  finishUpload(
    element,
    uploadParameters.endpoint,
    uploadParameters.bucket,
    uploadParameters.object_key,
    file.name
  );
  return Promise.resolve();
}

const checkFileAndInitiateUpload = async event => {
  const element = event.target.parentElement;
  const files = element.querySelector('.file-input').files;
  const dest = element.querySelector('.file-dest').value;
  const keyArgs = element.querySelector('.file-key_args').value;
  const presignedUrlEnpoint= element.getAttribute('get-presigned-url-endpoint');
  const headers = { 'X-CSRFToken': getCsrfToken(element) };
  console.log(presignedUrlEnpoint);

  uploadedImgCount = 0;
  uploadImgNum = files.length;
  beginUpload(element);
  updateProgressUploadedCount(element, uploadedImgCount, uploadedImgCount);

  let i = 0;
  while (i < files.length) {
    console.log(files[i].name);
    const form = new FormData();
    form.append('dest', dest);
    form.append('keyArgs', keyArgs);
    form.append('name', files[i].name);
    form.append('type', files[i].type);
    form.append('size', files[i].size);

    const res = await axios({method: 'post', url: presignedUrlEnpoint, data: form, headers});
    switch (res.status) {
      case 200:
        try {
          await uploadFileToS3(element, res.data, files[i], dest);
          i++;
        } catch(e) {
          console.log(e);
          console.log('Uploading Error, retry');
        }
        break;
      case 400:
      case 403:
      case 500:
        error(element, res.data.error);
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
