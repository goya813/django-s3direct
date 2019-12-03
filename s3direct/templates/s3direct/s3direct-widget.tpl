<div class="s3direct" get-presigned-url-endpoint="{{ presigned_url_endpoint }}" >
  <div class="file-uploaded-num"></div>
  <div class="file-list">
    {% for file in files %}
      <p><a class="file-link" target="_blank" href="{{ file.url }}">{{ file.name }}</a></p>
    {% endfor %}
  </div>
  <input class="csrf-cookie-name" type="hidden" value="{{ csrf_cookie_name }}">
  <input class="file-value" type="hidden" value="{{ value }}" id="{{ element_id }}" name="{{ name }}" />
  <input class="file-dest" type="hidden" value="{{ dest }}">
  <input class="file-key_args" type="hidden" value="{{ key_args }}">
  <input class="file-input" type="file"  style="{{ style }}" multiple/>
  <div class="progress progress-striped active">
    <div class="bar"></div>
  </div>
</div>
