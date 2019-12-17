import 'regenerator-runtime/runtime'
import Cookies from 'js-cookie';
import axios from 'axios';

import './css/bootstrap.css';
import './css/styles.css';

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

  [].forEach.call(buttons, el => {
    el.disabled = status;
  });
};

const beginUploads = element => {
  disableSubmit(true);
  element.className = 's3direct progress-active';
};

const endUploads = element => {
  disableSubmit(false);
};

const uploadedFile = (element, endpoint, bucket, objectKey, fileName) => {
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

  return Promise.resolve();
}

const checkFileAndInitiateUpload = async event => {
  const element = event.target.parentElement;
  const files = element.querySelector('.file-input').files;
  const dest = element.querySelector('.file-dest').value;
  const keyArgs = element.querySelector('.file-key_args').value;
  const presignedUrlEnpoint= element.getAttribute('get-presigned-url-endpoint');
  const headers = { 'X-CSRFToken': getCsrfToken(element) };

  const fileNum = files.length;
  beginUploads(element);
  updateProgressUploadedCount(element, 0, fileNum);

  for (let i = 0; i < files.length; i++) {
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
        while (true) {
          try {
            await uploadFileToS3(element, res.data, files[i], dest);

            uploadedFile(element, res.data.endpoint, res.data.bucket, res.data.object_key, files[i].name);
            updateProgressUploadedCount(element, i + 1, fileNum);
            break;
          } catch(e) {
            console.log(e);
            console.log('Uploading Error, retry');
          }
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

  endUploads(element);
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
